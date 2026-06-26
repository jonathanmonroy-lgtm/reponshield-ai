import { describe, it, expect, vi } from "vitest";
import { ContextEngine } from "@/services/context/ContextEngine";
import type { IGitHubClient } from "@/core/repositories/IGitHubClient";
import { ok, err } from "@/lib/types";

function makeGitHubClient(overrides: Partial<IGitHubClient> = {}): IGitHubClient {
  return {
    getInstallationToken: vi.fn(),
    getPullRequestDiff: vi.fn(),
    postReviewComments: vi.fn(),
    getFileContent: vi.fn(),
    createBranch: vi.fn(),
    createOrUpdateFile: vi.fn(),
    createPullRequest: vi.fn(),
    ...overrides,
  };
}

describe("ContextEngine", () => {
  describe("fetchRulesProfile — custom rules", () => {
    it("returns source 'custom' when .reposhield/rules.md exists", async () => {
      const client = makeGitHubClient({
        getFileContent: vi.fn().mockResolvedValue(
          ok({ content: "## Rules\n- No axios.", sha: "abc123" })
        ),
      });
      const engine = new ContextEngine(client);
      const profile = await engine.fetchRulesProfile("acme/backend", "main", "ghp_token");

      expect(profile.source).toBe("custom");
    });

    it("returns rulesMarkdown that contains the file content (wrapped in safe-context delimiters)", async () => {
      const rulesContent = "## Forbidden Libraries\n- It is strictly prohibited to use axios.";
      const client = makeGitHubClient({
        getFileContent: vi.fn().mockResolvedValue(
          ok({ content: rulesContent, sha: "abc123" })
        ),
      });
      const engine = new ContextEngine(client);
      const profile = await engine.fetchRulesProfile("acme/backend", "main", "ghp_token");

      expect(profile.rulesMarkdown).toContain(rulesContent);
      expect(profile.rulesMarkdown).toContain("--- BEGIN ORGANIZATION CODING RULES ---");
    });

    it("fetches exactly .reposhield/rules.md from the correct repo and ref", async () => {
      const client = makeGitHubClient({
        getFileContent: vi.fn().mockResolvedValue(
          ok({ content: "rules", sha: "abc" })
        ),
      });
      const engine = new ContextEngine(client);
      await engine.fetchRulesProfile("acme/backend", "feature/auth", "ghp_token");

      expect(client.getFileContent).toHaveBeenCalledWith(
        "acme/backend",
        ".reposhield/rules.md",
        "feature/auth",
        "ghp_token"
      );
    });

    it("preserves multi-section custom rules inside safe-context wrapper", async () => {
      const multilineRules = `# Acme Engineering Rules

## Forbidden Libraries
- axios: use native fetch
- moment: use date-fns

## Required Patterns
- All database queries must use the QueryBuilder abstraction
- No raw SQL strings allowed`;

      const client = makeGitHubClient({
        getFileContent: vi.fn().mockResolvedValue(
          ok({ content: multilineRules, sha: "def456" })
        ),
      });
      const engine = new ContextEngine(client);
      const profile = await engine.fetchRulesProfile("acme/backend", "main", "ghp_token");

      expect(profile.rulesMarkdown).toContain("# Acme Engineering Rules");
      expect(profile.rulesMarkdown).toContain("- axios: use native fetch");
      expect(profile.rulesMarkdown).toContain("--- BEGIN ORGANIZATION CODING RULES ---");
      expect(profile.rulesMarkdown).toContain("--- END ORGANIZATION CODING RULES ---");
    });
  });

  describe("fetchRulesProfile — default fallback", () => {
    it("returns source 'default' when file is not found", async () => {
      const client = makeGitHubClient({
        getFileContent: vi.fn().mockResolvedValue(err(new Error("Not Found"))),
      });
      const engine = new ContextEngine(client);
      const profile = await engine.fetchRulesProfile("acme/backend", "main", "ghp_token");

      expect(profile.source).toBe("default");
    });

    it("returns non-empty default rulesMarkdown", async () => {
      const client = makeGitHubClient({
        getFileContent: vi.fn().mockResolvedValue(err(new Error("Not Found"))),
      });
      const engine = new ContextEngine(client);
      const profile = await engine.fetchRulesProfile("acme/backend", "main", "ghp_token");

      expect(profile.rulesMarkdown.trim().length).toBeGreaterThan(0);
    });

    it("default rules cover secret management", async () => {
      const client = makeGitHubClient({
        getFileContent: vi.fn().mockResolvedValue(err(new Error("Not Found"))),
      });
      const engine = new ContextEngine(client);
      const profile = await engine.fetchRulesProfile("acme/backend", "main", "ghp_token");

      expect(profile.rulesMarkdown.toLowerCase()).toContain("secret");
    });

    it("default rules cover SQL injection prevention via parameterized queries", async () => {
      const client = makeGitHubClient({
        getFileContent: vi.fn().mockResolvedValue(err(new Error("Not Found"))),
      });
      const engine = new ContextEngine(client);
      const profile = await engine.fetchRulesProfile("acme/backend", "main", "ghp_token");

      expect(profile.rulesMarkdown.toLowerCase()).toContain("parameterized");
    });

    it("falls back to default when GitHub returns a server error", async () => {
      const client = makeGitHubClient({
        getFileContent: vi.fn().mockResolvedValue(err(new Error("Internal Server Error"))),
      });
      const engine = new ContextEngine(client);
      const profile = await engine.fetchRulesProfile("acme/backend", "main", "ghp_token");

      expect(profile.source).toBe("default");
    });
  });
});
