import { NextRequest, NextResponse } from "next/server";
import { GitHubWebhookVerifier } from "@/infrastructure/github/GitHubWebhookVerifier";
import { GitHubApiClient } from "@/infrastructure/github/GitHubApiClient";
import { AIProviderFactory } from "@/infrastructure/ai/AIProviderFactory";
import { AuditAIEngine } from "@/services/audit/AuditAIEngine";
import { DiffAnalyzer } from "@/services/audit/DiffAnalyzer";
import { ProcessPullRequestAuditUseCase } from "@/core/use-cases/audit/ProcessPullRequestAudit";
import { AutoFixEngine } from "@/services/repair/AutoFixEngine";
import { buildContainer } from "@/lib/container";
import type { AIProvider } from "@/lib/types";

const diffAnalyzer = new DiffAnalyzer();

interface GitHubPREvent {
  action: string;
  number: number;
  pull_request: {
    title: string;
    user: { login: string };
    head: { sha: string; ref: string };
    base: { sha: string; ref: string };
  };
  repository: {
    id: number;
    full_name: string;
  };
  installation?: { id: number };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const verifier = new GitHubWebhookVerifier(secret);
  try {
    verifier.verify(rawBody, request.headers.get("x-hub-signature-256"));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  if (event !== "pull_request") {
    return NextResponse.json({ received: true, skipped: true });
  }

  let payload: GitHubPREvent;
  try {
    payload = JSON.parse(rawBody) as GitHubPREvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const triggeringActions = ["opened", "synchronize", "reopened"];
  if (!triggeringActions.includes(payload.action)) {
    return NextResponse.json({ received: true, skipped: true });
  }

  const deliveryId = request.headers.get("x-github-delivery");
  if (!deliveryId) {
    return NextResponse.json(
      { error: "Missing X-GitHub-Delivery header" },
      { status: 400 }
    );
  }

  const installationId = payload.installation?.id?.toString();
  if (!installationId) {
    return NextResponse.json(
      { error: "No installation ID in payload" },
      { status: 400 }
    );
  }

  const container = buildContainer();
  const { db, repos, useCases } = container;

  // Idempotency guard: insert delivery_id before any processing.
  // A unique-constraint violation (23505) means GitHub is retrying a delivery
  // we already handled — return 200 so GitHub stops retrying.
  const { error: deliveryInsertError } = await db
    .from("webhook_deliveries")
    .insert({ delivery_id: deliveryId, event_type: event, processed: false });

  if (deliveryInsertError) {
    if (deliveryInsertError.code === "23505") {
      return NextResponse.json({ received: true, deduplicated: true });
    }
    // Non-fatal: DB unavailable — log and continue rather than drop the event.
    console.error("[webhook] delivery tracking insert failed:", deliveryInsertError.message);
  }

  const repoResult = await repos.repoRepo.findByGithubRepoId(
    payload.repository.id
  );
  if (!repoResult.success || !repoResult.data) {
    return NextResponse.json(
      { error: "Repository not registered in RepoShield" },
      { status: 404 }
    );
  }

  const repo = repoResult.data;

  const orgResult = await repos.orgRepo.findById(repo.organizationId);
  if (!orgResult.success || !orgResult.data) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const org = orgResult.data;

  const subCheck = await useCases.checkSubscription.execute(org.id);
  if (!subCheck.success) {
    return NextResponse.json({ error: "Subscription check failed" }, { status: 500 });
  }
  if (!subCheck.data) {
    return NextResponse.json(
      { error: "No active RepoShield subscription for this organization" },
      { status: 402 }
    );
  }

  const provider = org.preferredAiProvider as AIProvider;
  const model = org.preferredAiModel;

  const apiKeyResult = await useCases.getDecryptedApiKey.execute(
    org.id,
    provider
  );
  if (!apiKeyResult.success) {
    return NextResponse.json(
      { error: `No ${provider} API key configured: ${apiKeyResult.error.message}` },
      { status: 422 }
    );
  }

  const appId = process.env.GITHUB_APP_ID ?? "";
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY ?? "";
  const githubClient = new GitHubApiClient(appId, privateKey);

  const tokenResult = await githubClient.getInstallationToken(installationId);
  if (!tokenResult.success) {
    return NextResponse.json(
      { error: `GitHub token error: ${tokenResult.error.message}` },
      { status: 502 }
    );
  }

  const diffResult = await githubClient.getPullRequestDiff(
    payload.repository.full_name,
    payload.number,
    tokenResult.data
  );
  if (!diffResult.success) {
    return NextResponse.json(
      { error: `Diff fetch error: ${diffResult.error.message}` },
      { status: 502 }
    );
  }

  const aiProvider = AIProviderFactory.create(provider, apiKeyResult.data);
  const auditEngine = new AuditAIEngine(aiProvider, model);

  const commentPoster = {
    postReviewComments: (
      repoFullName: string,
      prNumber: number,
      headSha: string,
      findings: Parameters<typeof githubClient.postReviewComments>[3],
      _installationId: string
    ) =>
      githubClient.postReviewComments(
        repoFullName,
        prNumber,
        headSha,
        findings,
        tokenResult.data
      ),
  };

  const processUseCase = new ProcessPullRequestAuditUseCase(
    repos.auditRepo,
    repos.repoRepo,
    auditEngine,
    commentPoster,
    { parse: (raw: string) => diffAnalyzer.parse(raw) }
  );

  const auditResult = await processUseCase.execute({
    repositoryId: repo.id,
    githubRepoFullName: payload.repository.full_name,
    prNumber: payload.number,
    prTitle: diffResult.data.prTitle,
    prAuthor: diffResult.data.prAuthor,
    headSha: diffResult.data.headSha,
    baseSha: diffResult.data.baseSha,
    rawDiff: diffResult.data.rawDiff,
    githubInstallationId: installationId,
    aiProvider: provider,
    aiModel: model,
  });

  if (!auditResult.success) {
    return NextResponse.json(
      { error: auditResult.error.message },
      { status: 500 }
    );
  }

  // Append one row to audit_logs for dashboard "failures prevented" metrics
  const audit = auditResult.data;
  const criticalCount = audit.findings.filter((f) => f.severity === "critical").length;
  const highCount     = audit.findings.filter((f) => f.severity === "high").length;
  const mediumCount   = audit.findings.filter((f) => f.severity === "medium").length;
  const lowCount      = audit.findings.filter((f) => f.severity === "low").length;
  const infoCount     = audit.findings.filter((f) => f.severity === "info").length;

  const { error: logError } = await db.from("audit_logs").insert({
    organization_id:    org.id,
    repository_id:      repo.id,
    audit_id:           audit.id,
    pr_number:          payload.number,
    pr_title:           diffResult.data.prTitle,
    pr_author:          diffResult.data.prAuthor,
    findings_count:     audit.findings.length,
    critical_count:     criticalCount,
    high_count:         highCount,
    medium_count:       mediumCount,
    low_count:          lowCount,
    info_count:         infoCount,
    security_score:     audit.securityScore,
    total_debt_minutes: audit.totalDebtMinutes,
    prevented_issues:   criticalCount + highCount,
    ai_provider:        provider,
    ai_model:           model,
  });
  if (logError) {
    console.error("[audit_log] insert failed:", logError.message);
  }

  // Fire AutoFix asynchronously for enterprise orgs when critical findings exist
  if (criticalCount > 0) {
    const autoFixEngine = new AutoFixEngine(
      aiProvider,
      githubClient,
      repos.subscriptionRepo
    );
    autoFixEngine.triggerIfEligible({
      organizationId: org.id,
      repoFullName: payload.repository.full_name,
      prNumber: payload.number,
      headSha: diffResult.data.headSha,
      baseBranch: payload.pull_request.base.ref,
      criticalFindings: audit.findings.filter((f) => f.severity === "critical"),
      installationToken: tokenResult.data,
      aiModel: model,
    });
  }

  // Mark delivery as fully processed so idempotency checks remain meaningful.
  await db
    .from("webhook_deliveries")
    .update({ processed: true })
    .eq("delivery_id", deliveryId);

  return NextResponse.json({
    success: true,
    auditId: audit.id,
    findingsCount: audit.findings.length,
    securityScore: audit.securityScore,
  });
}
