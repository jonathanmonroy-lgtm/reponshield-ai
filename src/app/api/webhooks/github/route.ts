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

  const installationId = payload.installation?.id?.toString();
  if (!installationId) {
    return NextResponse.json(
      { error: "No installation ID in payload" },
      { status: 400 }
    );
  }

  const container = buildContainer();
  const { repos, useCases } = container;

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

  // Fire AutoFix asynchronously for enterprise orgs when critical findings exist
  const criticalFindings = auditResult.data.findings.filter(
    (f) => f.severity === "critical"
  );
  if (criticalFindings.length > 0) {
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
      criticalFindings,
      installationToken: tokenResult.data,
      aiModel: model,
    });
  }

  return NextResponse.json({
    success: true,
    auditId: auditResult.data.id,
    findingsCount: auditResult.data.findings.length,
    securityScore: auditResult.data.securityScore,
  });
}
