import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/lib/container";
import { getSupabaseClient } from "@/infrastructure/database/supabase/client";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: { user }, error: authError } = await getSupabaseClient().auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("orgId");
  const days = parseInt(request.nextUrl.searchParams.get("days") ?? "30", 10);

  if (!orgId) {
    return NextResponse.json(
      { error: "orgId query parameter is required" },
      { status: 400 }
    );
  }

  if (isNaN(days) || days < 1 || days > 365) {
    return NextResponse.json(
      { error: "days must be between 1 and 365" },
      { status: 400 }
    );
  }

  const { useCases } = buildContainer();
  const result = await useCases.getAuditAnalytics.execute(orgId, days);
  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ analytics: result.data });
}
