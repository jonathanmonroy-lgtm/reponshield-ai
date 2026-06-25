import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditAIEngine } from "./AuditAIEngine";
import type { IAIProvider, AICompletionResult } from "@/infrastructure/ai/IAIProvider";
import type { ParsedDiff } from "@/core/use-cases/audit/ProcessPullRequestAudit";

const SAMPLE_DIFF: ParsedDiff = {
  files: [
    {
      path: "src/auth.ts",
      additions: 4,
      deletions: 0,
      chunks: [
        {
          oldStart: 1,
          newStart: 1,
          lines: [
            { type: "add", content: "const token = req.query.token as string;", newLine: 1 },
            { type: "add", content: 'const user = jwt.verify(token, "hardcoded-secret");', newLine: 2 },
            { type: "add", content: "eval(req.body.expression);", newLine: 3 },
            { type: "add", content: "console.log(password);", newLine: 4 },
          ],
        },
      ],
    },
  ],
};

function buildMockResult(content: string): AICompletionResult {
  return { content, inputTokens: 100, outputTokens: 200, model: "gpt-4o" };
}

function makeProvider(content: string): IAIProvider {
  return {
    providerName: "openai",
    complete: vi.fn().mockResolvedValue(buildMockResult(content)),
  };
}

const VALID_RESPONSE = JSON.stringify({
  findings: [
    {
      filePath: "src/auth.ts",
      lineStart: 2,
      lineEnd: 2,
      category: "security",
      severity: "critical",
      title: "Hardcoded JWT secret",
      description: "JWT secret is hardcoded in source code — any attacker with code access can forge tokens.",
      suggestion: "Move secret to environment variable: jwt.verify(token, process.env.JWT_SECRET!)",
      owaspReference: "A02:2021 - Cryptographic Failures",
      debtMinutes: 15,
    },
    {
      filePath: "src/auth.ts",
      lineStart: 3,
      lineEnd: 3,
      category: "security",
      severity: "critical",
      title: "Remote Code Execution via eval()",
      description: "eval() executes arbitrary user-supplied code.",
      suggestion: "Remove eval() entirely. Parse the expression safely.",
      owaspReference: "A03:2021 - Injection",
      debtMinutes: 60,
    },
    {
      filePath: "src/auth.ts",
      lineStart: 4,
      lineEnd: 4,
      category: "security",
      severity: "high",
      title: "Credential leaked to logs",
      description: "Password logged in plaintext.",
      suggestion: "Remove console.log(password).",
      owaspReference: "A09:2021 - Security Logging and Monitoring Failures",
      debtMinutes: 5,
    },
  ],
  summary: "Two RCE-level vulnerabilities and one credential leak detected.",
});

describe("AuditAIEngine", () => {
  let engine: AuditAIEngine;
  let provider: IAIProvider;

  beforeEach(() => {
    provider = makeProvider(VALID_RESPONSE);
    engine = new AuditAIEngine(provider, "gpt-4o");
  });

  it("calls the provider with system + user messages", async () => {
    await engine.analyzeDiff(SAMPLE_DIFF, "acme/backend");
    expect(provider.complete).toHaveBeenCalledOnce();
    const call = vi.mocked(provider.complete).mock.calls[0]![0];
    expect(call.messages[0]?.role).toBe("system");
    expect(call.messages[1]?.role).toBe("user");
  });

  it("requests json_object response format", async () => {
    await engine.analyzeDiff(SAMPLE_DIFF, "acme/backend");
    const call = vi.mocked(provider.complete).mock.calls[0]![0];
    expect(call.responseFormat).toBe("json_object");
  });

  it("returns success with correctly mapped findings", async () => {
    const result = await engine.analyzeDiff(SAMPLE_DIFF, "acme/backend");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toHaveLength(3);
  });

  it("maps severity values correctly", async () => {
    const result = await engine.analyzeDiff(SAMPLE_DIFF, "acme/backend");
    if (!result.success) return;

    const severities = result.data.map((f) => f.severity);
    expect(severities).toContain("critical");
    expect(severities).toContain("high");
  });

  it("maps OWASP references correctly", async () => {
    const result = await engine.analyzeDiff(SAMPLE_DIFF, "acme/backend");
    if (!result.success) return;

    const owaspRefs = result.data.map((f) => f.owaspReference);
    expect(owaspRefs).toContain("A03:2021 - Injection");
  });

  it("maps debtMinutes correctly", async () => {
    const result = await engine.analyzeDiff(SAMPLE_DIFF, "acme/backend");
    if (!result.success) return;

    const total = result.data.reduce((sum, f) => sum + f.debtMinutes, 0);
    expect(total).toBe(80);
  });

  it("maps lineStart and lineEnd from AI response", async () => {
    const result = await engine.analyzeDiff(SAMPLE_DIFF, "acme/backend");
    if (!result.success) return;

    const evalFinding = result.data.find((f) => f.title.includes("eval"));
    expect(evalFinding?.lineStart).toBe(3);
    expect(evalFinding?.lineEnd).toBe(3);
  });

  it("handles AI response wrapped in markdown fences", async () => {
    const fencedProvider = makeProvider("```json\n" + VALID_RESPONSE + "\n```");
    const fencedEngine = new AuditAIEngine(fencedProvider, "gpt-4o");
    const result = await fencedEngine.analyzeDiff(SAMPLE_DIFF, "acme/backend");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(3);
  });

  it("returns err when provider throws", async () => {
    const failingProvider: IAIProvider = {
      providerName: "openai",
      complete: vi.fn().mockRejectedValue(new Error("Rate limited")),
    };
    const failingEngine = new AuditAIEngine(failingProvider, "gpt-4o");
    const result = await failingEngine.analyzeDiff(SAMPLE_DIFF, "acme/backend");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain("Rate limited");
  });

  it("returns err when AI returns non-JSON", async () => {
    const badProvider = makeProvider("I cannot analyze this code. Please try again.");
    const badEngine = new AuditAIEngine(badProvider, "gpt-4o");
    const result = await badEngine.analyzeDiff(SAMPLE_DIFF, "acme/backend");
    expect(result.success).toBe(false);
  });

  it("returns empty findings array for clean diff", async () => {
    const cleanProvider = makeProvider(
      JSON.stringify({ findings: [], summary: "No issues found." })
    );
    const cleanEngine = new AuditAIEngine(cleanProvider, "gpt-4o");
    const result = await cleanEngine.analyzeDiff(SAMPLE_DIFF, "acme/backend");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(0);
  });

  it("passes the correct model to provider.complete", async () => {
    const modelEngine = new AuditAIEngine(provider, "claude-sonnet-4-6");
    await modelEngine.analyzeDiff(SAMPLE_DIFF, "acme/backend");
    const call = vi.mocked(provider.complete).mock.calls[0]![0];
    expect(call.model).toBe("claude-sonnet-4-6");
  });

  it("passes temperature 0.1 for deterministic output", async () => {
    await engine.analyzeDiff(SAMPLE_DIFF, "acme/backend");
    const call = vi.mocked(provider.complete).mock.calls[0]![0];
    expect(call.temperature).toBe(0.1);
  });
});
