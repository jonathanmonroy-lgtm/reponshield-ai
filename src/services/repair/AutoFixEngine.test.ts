import { describe, it, expect, vi, beforeEach } from "vitest";
import { AutoFixEngine } from "@/services/repair/AutoFixEngine";
import type { AutoFixInput } from "@/services/repair/AutoFixEngine";
import type { IAIProvider, AICompletionResult } from "@/infrastructure/ai/IAIProvider";
import type { IGitHubClient } from "@/core/repositories/IGitHubClient";
import type { ISubscriptionRepository } from "@/core/repositories/ISubscriptionRepository";
import type { AuditFinding } from "@/core/entities/PullRequestAudit";
import type { Subscription } from "@/core/entities/Subscription";
import { ok, err } from "@/lib/types";

// ── Factories ─────────────────────────────────────────────────────────────────

function makeSub(planType: Subscription["planType"]): Subscription {
  const now = new Date();
  return {
    id: "sub-1",
    organizationId: "org-1",
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
    status: "active",
    planType,
    currentPeriodStart: now,
    currentPeriodEnd: now,
    cancelAtPeriodEnd: false,
    createdAt: now,
    updatedAt: now,
  };
}

function makeSubRepo(
  sub: Subscription | null = null,
  fail = false
): ISubscriptionRepository {
  return {
    findByOrganizationId: vi.fn().mockResolvedValue(
      fail ? err(new Error("DB error")) : ok(sub)
    ),
    findByStripeSubscriptionId: vi.fn().mockResolvedValue(ok(null)),
    upsert: vi.fn().mockResolvedValue(ok(sub ?? makeSub("starter"))),
    updateStatus: vi.fn().mockResolvedValue(ok(undefined)),
  };
}

function makeAiProvider(patchedContent = "const fixed = true;"): IAIProvider {
  const result: AICompletionResult = {
    content: JSON.stringify({
      patchedContent,
      changesSummary: "Replaced string concatenation with parameterized query",
    }),
    inputTokens: 200,
    outputTokens: 100,
    model: "claude-sonnet-4-6",
  };
  return {
    providerName: "anthropic",
    complete: vi.fn().mockResolvedValue(result),
  };
}

function makeGitHubClient(overrides: Partial<IGitHubClient> = {}): IGitHubClient {
  return {
    getInstallationToken: vi.fn().mockResolvedValue(ok("token")),
    getPullRequestDiff: vi.fn().mockResolvedValue(ok({ rawDiff: "", prTitle: "", prAuthor: "", headSha: "abc", baseSha: "def" })),
    postReviewComments: vi.fn().mockResolvedValue(ok([])),
    getFileContent: vi.fn().mockResolvedValue(ok({ content: 'const x = "bad";', sha: "file-sha-123" })),
    createBranch: vi.fn().mockResolvedValue(ok(undefined)),
    createOrUpdateFile: vi.fn().mockResolvedValue(ok({ commitSha: "commit-abc" })),
    createPullRequest: vi.fn().mockResolvedValue(ok(99)),
    ...overrides,
  };
}

function makeCriticalFinding(filePath = "src/db.js"): AuditFinding {
  return {
    id: "find-1",
    filePath,
    lineStart: 5,
    lineEnd: 8,
    category: "security",
    severity: "critical",
    title: "SQL Injection",
    description: "Unsanitized input in query",
    suggestion: "Use parameterized queries",
    owaspReference: "A03:2021",
    debtMinutes: 45,
  };
}

function makeInput(overrides: Partial<AutoFixInput> = {}): AutoFixInput {
  return {
    organizationId: "org-1",
    repoFullName: "acme/backend",
    prNumber: 42,
    headSha: "head-sha-abc",
    baseBranch: "main",
    criticalFindings: [makeCriticalFinding()],
    installationToken: "ghs_token",
    aiModel: "claude-sonnet-4-6",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AutoFixEngine.execute()", () => {
  let ghClient: IGitHubClient;
  let aiProvider: IAIProvider;
  let subRepo: ISubscriptionRepository;

  beforeEach(() => {
    ghClient = makeGitHubClient();
    aiProvider = makeAiProvider();
    subRepo = makeSubRepo(makeSub("enterprise"));
  });

  it("returns ok(null) when subscription is not found", async () => {
    const engine = new AutoFixEngine(aiProvider, ghClient, makeSubRepo(null));
    const result = await engine.execute(makeInput());
    expect(result).toEqual(ok(null));
    expect(ghClient.createBranch).not.toHaveBeenCalled();
  });

  it("returns ok(null) for a starter plan org", async () => {
    const engine = new AutoFixEngine(aiProvider, ghClient, makeSubRepo(makeSub("starter")));
    const result = await engine.execute(makeInput());
    expect(result).toEqual(ok(null));
  });

  it("returns ok(null) for a pro plan org", async () => {
    const engine = new AutoFixEngine(aiProvider, ghClient, makeSubRepo(makeSub("pro")));
    const result = await engine.execute(makeInput());
    expect(result).toEqual(ok(null));
  });

  it("returns ok(null) for enterprise when no critical findings provided", async () => {
    const engine = new AutoFixEngine(aiProvider, ghClient, subRepo);
    const result = await engine.execute(
      makeInput({ criticalFindings: [] })
    );
    expect(result).toEqual(ok(null));
  });

  it("returns ok(null) for enterprise when findings are non-critical", async () => {
    const lowFinding: AuditFinding = { ...makeCriticalFinding(), severity: "high" };
    const engine = new AutoFixEngine(aiProvider, ghClient, subRepo);
    const result = await engine.execute(makeInput({ criticalFindings: [lowFinding] }));
    expect(result).toEqual(ok(null));
  });

  it("propagates repository error as a failed Result", async () => {
    const engine = new AutoFixEngine(aiProvider, ghClient, makeSubRepo(null, true));
    const result = await engine.execute(makeInput());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toBe("DB error");
  });

  it("fetches file content at the PR head SHA", async () => {
    const engine = new AutoFixEngine(aiProvider, ghClient, subRepo);
    await engine.execute(makeInput());
    expect(ghClient.getFileContent).toHaveBeenCalledWith(
      "acme/backend",
      "src/db.js",
      "head-sha-abc",
      "ghs_token"
    );
  });

  it("calls AI with a message containing the file path and finding title", async () => {
    const engine = new AutoFixEngine(aiProvider, ghClient, subRepo);
    await engine.execute(makeInput());
    expect(aiProvider.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-6",
        temperature: 0.05,
        responseFormat: "json_object",
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "user" }),
          expect.objectContaining({ role: "system" }),
        ]),
      })
    );
    const call = (aiProvider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const userMsg = (call.messages as Array<{ role: string; content: string }>).find(
      (m) => m.role === "user"
    );
    expect(userMsg?.content).toContain("src/db.js");
    expect(userMsg?.content).toContain("SQL Injection");
  });

  it("creates a branch named reposhield/autofix-pr-{prNumber} from headSha", async () => {
    const engine = new AutoFixEngine(aiProvider, ghClient, subRepo);
    await engine.execute(makeInput());
    expect(ghClient.createBranch).toHaveBeenCalledWith(
      "acme/backend",
      "reposhield/autofix-pr-42",
      "head-sha-abc",
      "ghs_token"
    );
  });

  it("commits the patched file to the fix branch", async () => {
    const engine = new AutoFixEngine(aiProvider, ghClient, subRepo);
    await engine.execute(makeInput());
    expect(ghClient.createOrUpdateFile).toHaveBeenCalledWith(
      "acme/backend",
      "src/db.js",
      "const fixed = true;",
      expect.stringContaining("autofix"),
      "reposhield/autofix-pr-42",
      "file-sha-123",
      "ghs_token"
    );
  });

  it("opens a PR with the correct title referencing the original PR number", async () => {
    const engine = new AutoFixEngine(aiProvider, ghClient, subRepo);
    await engine.execute(makeInput());
    expect(ghClient.createPullRequest).toHaveBeenCalledWith(
      "acme/backend",
      "[RepoShield Auto-Fix] Security & Debt Patch for #42",
      expect.stringContaining("#42"),
      "reposhield/autofix-pr-42",
      "main",
      "ghs_token"
    );
  });

  it("returns fixPrNumber, branchName, and patchedFileCount on success", async () => {
    const engine = new AutoFixEngine(aiProvider, ghClient, subRepo);
    const result = await engine.execute(makeInput());
    expect(result.success).toBe(true);
    if (result.success && result.data !== null) {
      expect(result.data.fixPrNumber).toBe(99);
      expect(result.data.branchName).toBe("reposhield/autofix-pr-42");
      expect(result.data.patchedFileCount).toBe(1);
    }
  });

  it("skips files where getFileContent fails and proceeds with remaining files", async () => {
    const finding1 = makeCriticalFinding("src/db.js");
    const finding2 = makeCriticalFinding("src/auth.js");
    const partialGh = makeGitHubClient({
      getFileContent: vi
        .fn()
        .mockResolvedValueOnce(err(new Error("404 not found")))
        .mockResolvedValueOnce(ok({ content: "const auth = {};", sha: "sha-auth" })),
    });
    const engine = new AutoFixEngine(aiProvider, partialGh, subRepo);
    const result = await engine.execute(
      makeInput({ criticalFindings: [finding1, finding2] })
    );
    expect(result.success).toBe(true);
    if (result.success && result.data !== null) {
      expect(result.data.patchedFileCount).toBe(1);
    }
    expect(partialGh.createBranch).toHaveBeenCalled();
  });

  it("returns ok(null) when all file content fetches fail", async () => {
    const failGh = makeGitHubClient({
      getFileContent: vi.fn().mockResolvedValue(err(new Error("Not found"))),
    });
    const engine = new AutoFixEngine(aiProvider, failGh, subRepo);
    const result = await engine.execute(makeInput());
    expect(result).toEqual(ok(null));
    expect(failGh.createBranch).not.toHaveBeenCalled();
  });

  it("returns failed Result when branch creation fails", async () => {
    const failGh = makeGitHubClient({
      createBranch: vi.fn().mockResolvedValue(err(new Error("Branch already exists"))),
    });
    const engine = new AutoFixEngine(aiProvider, failGh, subRepo);
    const result = await engine.execute(makeInput());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Branch already exists");
    }
  });

  it("returns failed Result when createPullRequest fails", async () => {
    const failGh = makeGitHubClient({
      createPullRequest: vi.fn().mockResolvedValue(err(new Error("PR creation rejected"))),
    });
    const engine = new AutoFixEngine(aiProvider, failGh, subRepo);
    const result = await engine.execute(makeInput());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("PR creation rejected");
    }
  });

  it("patches multiple files in the same PR when critical findings span files", async () => {
    const gh = makeGitHubClient();
    const findings = [
      makeCriticalFinding("src/db.js"),
      makeCriticalFinding("src/user.js"),
    ];
    const engine = new AutoFixEngine(makeAiProvider(), gh, subRepo);
    const result = await engine.execute(makeInput({ criticalFindings: findings }));
    expect(result.success).toBe(true);
    if (result.success && result.data !== null) {
      expect(result.data.patchedFileCount).toBe(2);
    }
    expect(gh.createOrUpdateFile).toHaveBeenCalledTimes(2);
  });
});

describe("AutoFixEngine.triggerIfEligible()", () => {
  it("swallows errors thrown by execute() without crashing", async () => {
    const brokenSubRepo = makeSubRepo(null, true);
    // Force execute to reject entirely
    const engine = new AutoFixEngine(makeAiProvider(), makeGitHubClient(), brokenSubRepo);
    expect(() => engine.triggerIfEligible(makeInput())).not.toThrow();
    // Give the microtask queue a tick to confirm no unhandled rejection
    await new Promise((r) => setTimeout(r, 0));
  });

  it("does not await the result (returns void synchronously)", () => {
    const engine = new AutoFixEngine(
      makeAiProvider(),
      makeGitHubClient(),
      makeSubRepo(makeSub("enterprise"))
    );
    const returnValue = engine.triggerIfEligible(makeInput());
    expect(returnValue).toBeUndefined();
  });
});
