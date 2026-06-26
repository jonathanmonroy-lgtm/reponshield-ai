import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/infrastructure/database/supabase/client";
import { createGitHubAppJWT } from "@/infrastructure/github/GitHubApiClient";
import { GITHUB_API_BASE } from "@/lib/constants";

// Cookie written by the install-initiation flow (e.g. dashboard "Connect GitHub" button).
// Format: `${orgId}|${nonce}` — httpOnly, SameSite=Lax, MaxAge=600.
export const STATE_COOKIE = "gh_install_state";

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
} as const;

// Exported for unit tests — state HMAC is computed over the full cookie value.
export function computeStateHmac(cookieValue: string, secret: string): string {
  return createHmac("sha256", secret).update(cookieValue).digest("hex");
}

// Constant-time hex comparison to prevent timing-oracle attacks.
export function hmacEqual(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "hex");
    const bBuf = Buffer.from(b, "hex");
    if (aBuf.length === 0 || bBuf.length === 0) return false;
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

function redirectWithError(base: URL, code: string): NextResponse {
  const url = new URL(base.toString());
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const installationId = searchParams.get("installation_id");
  const state = searchParams.get("state");

  const dashboardBase = new URL("/dashboard", request.url);

  if (!installationId || !state) {
    return redirectWithError(dashboardBase, "missing_params");
  }

  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!webhookSecret || !appId || !privateKey) {
    return redirectWithError(dashboardBase, "server_misconfigured");
  }

  // --- CSRF validation ---
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(STATE_COOKIE)?.value;
  if (!cookieValue) {
    return redirectWithError(dashboardBase, "csrf_missing");
  }

  const parts = cookieValue.split("|");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return redirectWithError(dashboardBase, "csrf_invalid");
  }
  const orgId = parts[0];

  const expectedHmac = computeStateHmac(cookieValue, webhookSecret);
  if (!hmacEqual(expectedHmac, state)) {
    return redirectWithError(dashboardBase, "csrf_mismatch");
  }

  // --- Parse installation ID ---
  const installationIdNum = parseInt(installationId, 10);
  if (!Number.isFinite(installationIdNum) || installationIdNum <= 0) {
    return redirectWithError(dashboardBase, "invalid_installation_id");
  }

  // --- Fetch installation metadata from GitHub ---
  let accountLogin: string;
  let accountType: string;
  try {
    const jwt = await createGitHubAppJWT(appId, privateKey);
    const res = await fetch(
      `${GITHUB_API_BASE}/app/installations/${installationId}`,
      { headers: { Authorization: `Bearer ${jwt}`, ...GH_HEADERS } }
    );
    if (!res.ok) {
      return redirectWithError(dashboardBase, "github_api_error");
    }
    const data = (await res.json()) as {
      account: { login: string; type: string };
    };
    accountLogin = data.account.login;
    accountType = data.account.type;
  } catch {
    return redirectWithError(dashboardBase, "github_api_error");
  }

  // --- Persist installation record and link to org (atomic via service role) ---
  const db = createServiceClient();

  const { error: upsertError } = await db
    .from("github_app_installations")
    .upsert({
      id: installationIdNum,
      organization_id: orgId,
      account_login: accountLogin,
      account_type: accountType,
      status: "active",
    });

  if (upsertError) {
    return redirectWithError(dashboardBase, "db_error");
  }

  // Mirror installation_id onto the organizations row for fast webhook lookups.
  await db
    .from("organizations")
    .update({ github_installation_id: installationId })
    .eq("id", orgId);

  // Clear CSRF cookie so it cannot be replayed.
  const successUrl = new URL(dashboardBase.toString());
  successUrl.searchParams.set("installed", "true");
  const response = NextResponse.redirect(successUrl);
  response.cookies.delete(STATE_COOKIE);
  return response;
}
