import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/lib/container";
import { validateRepository } from "@/core/entities/Repository";
import { getSupabaseClient } from "@/infrastructure/database/supabase/client";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: { user }, error: authError } = await getSupabaseClient().auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json(
      { error: "orgId query parameter is required" },
      { status: 400 }
    );
  }

  const { repos } = buildContainer();
  const result = await repos.repoRepo.findByOrganizationId(orgId);
  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ repositories: result.data });
}

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

  const {
    organizationId,
    githubRepoId,
    fullName,
    defaultBranch,
    isPrivate,
  } = body as Record<string, unknown>;

  const input = {
    organizationId: String(organizationId ?? ""),
    githubRepoId: Number(githubRepoId),
    fullName: String(fullName ?? ""),
    defaultBranch: String(defaultBranch ?? "main"),
    isPrivate: Boolean(isPrivate),
  };

  const validationError = validateRepository(input);
  if (validationError) {
    return NextResponse.json({ error: validationError.message }, { status: 422 });
  }

  const { repos } = buildContainer();
  const result = await repos.repoRepo.create(input);
  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ repository: result.data }, { status: 201 });
}
