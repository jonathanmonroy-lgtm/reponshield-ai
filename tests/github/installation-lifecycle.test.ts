import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import {
  handleInstallationEvent,
  handleInstallationRepositoriesEvent,
  type GitHubInstallationEvent,
  type GitHubInstallationRepositoriesEvent,
} from "@/app/api/webhooks/github/_lifecycle-handlers";
import { InstallationTokenCache } from "@/infrastructure/github/InstallationTokenCache";
import type { SupabaseServiceClient } from "@/infrastructure/database/supabase/client";

// ---------------------------------------------------------------------------
// Supabase db mock factory
// ---------------------------------------------------------------------------
function makeMockDb(opts: {
  upsertError?: { message: string } | null;
  updateError?: { message: string } | null;
  installationOrgId?: string | null;
} = {}): SupabaseServiceClient {
  const upsertError = opts.upsertError ?? null;
  const updateError = opts.updateError ?? null;
  const orgId = opts.installationOrgId !== undefined
    ? opts.installationOrgId
    : "org-uuid-123";

  // Each call to from() returns a fresh fluent chain mock
  const from = vi.fn().mockImplementation((table: string) => {
    const eqForSelect = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { organization_id: orgId },
        error: null,
      }),
    });

    const inFn = vi.fn().mockResolvedValue({ error: null });

    const eqForUpdate = vi.fn().mockResolvedValue({ error: updateError });

    const updateFn = vi.fn().mockReturnValue({
      eq: eqForUpdate,
      in: inFn,
    });

    const upsertFn = vi.fn().mockResolvedValue({ error: upsertError });

    return {
      table,
      upsert: upsertFn,
      update: updateFn,
      select: vi.fn().mockReturnValue({ eq: eqForSelect }),
    };
  });

  return { from } as unknown as SupabaseServiceClient;
}

// ---------------------------------------------------------------------------
// handleInstallationEvent
// ---------------------------------------------------------------------------
describe("handleInstallationEvent", () => {
  let cache: InstallationTokenCache;

  beforeEach(() => {
    cache = new InstallationTokenCache();
  });

  function makePayload(
    action: GitHubInstallationEvent["action"],
    id = 42
  ): GitHubInstallationEvent {
    return {
      action,
      installation: { id, account: { login: "acme-corp", type: "Organization" } },
    };
  }

  it("upserts a new installation on 'created'", async () => {
    const db = makeMockDb();
    const payload = makePayload("created");
    const response = await handleInstallationEvent(payload, db, cache);
    const body = await response.json() as { received: boolean; action: string };
    expect(body.received).toBe(true);
    expect(body.action).toBe("created");
    // from() was called with github_app_installations for the upsert
    const fromCalls = (db.from as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(fromCalls.flat()).toContain("github_app_installations");
  });

  it("marks installation as 'deleted' and evicts token cache on 'deleted'", async () => {
    const db = makeMockDb();
    cache.set("42", "ghs_old_token", new Date(Date.now() + 3_600_000));
    expect(cache.has("42")).toBe(true);

    await handleInstallationEvent(makePayload("deleted", 42), db, cache);

    expect(cache.has("42")).toBe(false);
    const fromCalls = (db.from as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(fromCalls.flat()).toContain("github_app_installations");
  });

  it("marks installation as 'suspended' and evicts token cache on 'suspend'", async () => {
    const db = makeMockDb();
    cache.set("42", "ghs_token", new Date(Date.now() + 3_600_000));

    const response = await handleInstallationEvent(makePayload("suspend", 42), db, cache);

    expect(cache.has("42")).toBe(false);
    const body = await response.json() as { action: string };
    expect(body.action).toBe("suspend");
  });

  it("marks installation as 'active' and does NOT evict cache on 'unsuspend'", async () => {
    const db = makeMockDb();
    cache.set("42", "ghs_token", new Date(Date.now() + 3_600_000));

    await handleInstallationEvent(makePayload("unsuspend", 42), db, cache);

    // Token must remain — unsuspend restores access
    expect(cache.has("42")).toBe(true);
  });

  it("still returns received:true when the db update returns an error", async () => {
    const db = makeMockDb({ updateError: { message: "db down" } });
    const response = await handleInstallationEvent(makePayload("deleted", 42), db, cache);
    expect(response).toBeInstanceOf(NextResponse);
    const body = await response.json() as { received: boolean };
    expect(body.received).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleInstallationRepositoriesEvent
// ---------------------------------------------------------------------------
describe("handleInstallationRepositoriesEvent", () => {
  function makePayload(
    action: GitHubInstallationRepositoriesEvent["action"],
    added: GitHubInstallationRepositoriesEvent["repositories_added"] = [],
    removed: GitHubInstallationRepositoriesEvent["repositories_removed"] = []
  ): GitHubInstallationRepositoriesEvent {
    return {
      action,
      installation: { id: 99 },
      repositories_added: added,
      repositories_removed: removed,
    };
  }

  it("upserts added repos when org is linked", async () => {
    const db = makeMockDb({ installationOrgId: "org-uuid-123" });
    const payload = makePayload("added", [
      { id: 1001, full_name: "acme/web", name: "web" },
    ]);

    const response = await handleInstallationRepositoriesEvent(payload, db);
    const body = await response.json() as { received: boolean; action: string };
    expect(body.received).toBe(true);
    expect(body.action).toBe("added");

    const fromCalls = (db.from as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(fromCalls.flat()).toContain("repositories");
  });

  it("skips repo upsert when installation has no linked org", async () => {
    const db = makeMockDb({ installationOrgId: null });

    const payload = makePayload("added", [
      { id: 1002, full_name: "anon/repo", name: "repo" },
    ]);
    await handleInstallationRepositoriesEvent(payload, db);

    const fromCalls = (db.from as ReturnType<typeof vi.fn>).mock.calls as string[][];
    const repositoriesCalls = fromCalls.filter((c) => c[0] === "repositories");
    // upsert should not be called when organizationId is null
    expect(repositoriesCalls.length).toBe(0);
  });

  it("disables audit for removed repos", async () => {
    const db = makeMockDb();
    const payload = makePayload("removed", [], [
      { id: 2001, full_name: "acme/old", name: "old" },
    ]);

    const response = await handleInstallationRepositoriesEvent(payload, db);
    const body = await response.json() as { action: string };
    expect(body.action).toBe("removed");

    const fromCalls = (db.from as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(fromCalls.flat()).toContain("repositories");
  });
});
