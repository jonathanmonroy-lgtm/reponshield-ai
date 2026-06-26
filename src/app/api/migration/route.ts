import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/lib/container";
import { getSupabaseClient } from "@/infrastructure/database/supabase/client";
import { AIProviderFactory } from "@/infrastructure/ai/AIProviderFactory";
import { CodeMigrationService } from "@/services/migration/CodeMigrationService";
import type { AIProvider } from "@/lib/types";
import type { SourceLanguage } from "@/core/entities/MigrationJob";

const VALID_LANGUAGES: SourceLanguage[] = ["javascript", "python", "php"];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user }, error: authError } = await getSupabaseClient().auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const { organizationId, sourceLanguage, files } = body as Record<
    string,
    unknown
  >;

  if (!VALID_LANGUAGES.includes(sourceLanguage as SourceLanguage)) {
    return NextResponse.json(
      { error: `sourceLanguage must be one of: ${VALID_LANGUAGES.join(", ")}` },
      { status: 422 }
    );
  }

  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json(
      { error: "files must be a non-empty array" },
      { status: 422 }
    );
  }

  const container = buildContainer();
  const { repos, useCases } = container;

  const orgResult = await repos.orgRepo.findById(String(organizationId ?? ""));
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

  const apiKeyResult = await useCases.getDecryptedApiKey.execute(org.id, provider);
  if (!apiKeyResult.success) {
    return NextResponse.json(
      { error: `No ${provider} API key: ${apiKeyResult.error.message}` },
      { status: 422 }
    );
  }

  const jobResult = await useCases.startMigrationJob.execute({
    organizationId: org.id,
    sourceLanguage: sourceLanguage as SourceLanguage,
    files: (files as Array<Record<string, unknown>>).map((f) => ({
      path: String(f.path ?? ""),
      content: String(f.content ?? ""),
    })),
    aiProvider: provider,
    aiModel: org.preferredAiModel,
  });

  if (!jobResult.success) {
    return NextResponse.json({ error: jobResult.error.message }, { status: 422 });
  }

  const aiProvider = AIProviderFactory.create(provider, apiKeyResult.data);
  const migrationService = new CodeMigrationService(
    aiProvider,
    org.preferredAiModel,
    repos.migrationRepo
  );

  migrationService.processJob(jobResult.data.id).catch(() => {
    // Background processing â€” errors captured in DB
  });

  return NextResponse.json({ job: jobResult.data }, { status: 202 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: { user }, error: authError } = await getSupabaseClient().auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get("jobId");
  const orgId = request.nextUrl.searchParams.get("orgId");

  const { repos } = buildContainer();

  if (jobId) {
    const result = await repos.migrationRepo.findById(jobId);
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
    if (!result.data) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ job: result.data });
  }

  if (orgId) {
    const result = await repos.migrationRepo.findByOrganizationId(orgId);
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
    return NextResponse.json({ jobs: result.data });
  }

  return NextResponse.json(
    { error: "jobId or orgId query parameter is required" },
    { status: 400 }
  );
}
