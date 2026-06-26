import { NextResponse } from "next/server";
import type { SupabaseServiceClient } from "@/infrastructure/database/supabase/client";
import type { InstallationTokenCache } from "@/infrastructure/github/InstallationTokenCache";

export interface GitHubInstallationEvent {
  action: "created" | "deleted" | "suspend" | "unsuspend";
  installation: {
    id: number;
    account: { login: string; type: string };
  };
}

export interface GitHubInstallationRepositoriesEvent {
  action: "added" | "removed";
  installation: { id: number };
  repositories_added?: Array<{ id: number; full_name: string; name: string }>;
  repositories_removed?: Array<{ id: number; full_name: string; name: string }>;
}

type InstallationStatus = "active" | "suspended" | "deleted";

export async function handleInstallationEvent(
  payload: GitHubInstallationEvent,
  db: SupabaseServiceClient,
  tokenCache: InstallationTokenCache
): Promise<NextResponse> {
  const { action, installation } = payload;
  const installationId = installation.id;

  if (action === "created") {
    const { error } = await db.from("github_app_installations").upsert({
      id: installationId,
      account_login: installation.account.login,
      account_type: installation.account.type,
      status: "active" as InstallationStatus,
    });
    if (error) {
      console.error("[webhook] installation.created upsert failed:", error.message);
    }
    return NextResponse.json({ received: true, action });
  }

  const statusMap: Record<"deleted" | "suspend" | "unsuspend", InstallationStatus> = {
    deleted: "deleted",
    suspend: "suspended",
    unsuspend: "active",
  };

  const newStatus = statusMap[action as "deleted" | "suspend" | "unsuspend"];
  if (!newStatus) {
    return NextResponse.json({ received: true, action, skipped: true });
  }

  const { error } = await db
    .from("github_app_installations")
    .update({ status: newStatus })
    .eq("id", installationId);

  if (error) {
    console.error(`[webhook] installation.${action} update failed:`, error.message);
  }

  // Immediately evict the cached IAT so subsequent requests cannot use a
  // token issued for a now-deleted or suspended installation.
  if (action === "deleted" || action === "suspend") {
    tokenCache.invalidate(String(installationId));
  }

  return NextResponse.json({ received: true, action });
}

export async function handleInstallationRepositoriesEvent(
  payload: GitHubInstallationRepositoriesEvent,
  db: SupabaseServiceClient
): Promise<NextResponse> {
  const { action, installation } = payload;
  const installationId = installation.id;

  // Resolve which org owns this installation for FK insertion
  const { data: installRow } = await db
    .from("github_app_installations")
    .select("organization_id")
    .eq("id", installationId)
    .maybeSingle();

  const organizationId = installRow?.organization_id ?? null;

  if (action === "added" && payload.repositories_added?.length) {
    for (const repo of payload.repositories_added) {
      if (!organizationId) continue;
      const { error } = await db.from("repositories").upsert(
        {
          organization_id: organizationId,
          github_repo_id: repo.id,
          full_name: repo.full_name,
          audit_enabled: false,
        },
        { onConflict: "github_repo_id", ignoreDuplicates: true }
      );
      if (error) {
        console.error("[webhook] repositories upsert failed:", error.message);
      }
    }
  }

  if (action === "removed" && payload.repositories_removed?.length) {
    const removedIds = payload.repositories_removed.map((r) => r.id);
    const { error } = await db
      .from("repositories")
      .update({ audit_enabled: false, webhook_active: false })
      .in("github_repo_id", removedIds);
    if (error) {
      console.error("[webhook] repositories disable failed:", error.message);
    }
  }

  return NextResponse.json({ received: true, action });
}
