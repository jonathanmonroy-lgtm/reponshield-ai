import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/lib/container";
import { getSupabaseClient } from "@/infrastructure/database/supabase/client";

export async function GET(): Promise<NextResponse> {
  const { data: { user }, error: authError } = await getSupabaseClient().auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { repos } = buildContainer();
  const result = await repos.orgRepo.findByUserId(user.id);
  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ organizations: result.data });
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

  const { name, slug } = body as Record<string, unknown>;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 422 });
  }

  const { useCases } = buildContainer();
  const result = await useCases.createOrganization.execute(
    name,
    user.id,
    slug ? String(slug) : undefined
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 422 });
  }

  return NextResponse.json({ organization: result.data }, { status: 201 });
}
