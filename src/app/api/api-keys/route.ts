import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/lib/container";
import { getSupabaseClient } from "@/infrastructure/database/supabase/client";
import type { AIProvider } from "@/lib/types";

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
  const result = await repos.apiKeyRepo.findAllByOrganization(orgId);
  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const safeKeys = result.data.map(({ encryptedKey: _ek, ...rest }) => rest);
  return NextResponse.json({ apiKeys: safeKeys });
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

  const { organizationId, provider, plaintextKey } = body as Record<
    string,
    unknown
  >;

  const validProviders: AIProvider[] = ["openai", "anthropic"];
  if (!validProviders.includes(provider as AIProvider)) {
    return NextResponse.json(
      { error: `provider must be one of: ${validProviders.join(", ")}` },
      { status: 422 }
    );
  }

  const { useCases } = buildContainer();
  const result = await useCases.storeApiKey.execute({
    organizationId: String(organizationId ?? ""),
    provider: provider as AIProvider,
    plaintextKey: String(plaintextKey ?? ""),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 422 });
  }

  const { encryptedKey: _ek, ...safeKey } = result.data;
  return NextResponse.json({ apiKey: safeKey }, { status: 201 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { data: { user }, error: authError } = await getSupabaseClient().auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
  }

  const { repos } = buildContainer();
  const result = await repos.apiKeyRepo.delete(id);
  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
