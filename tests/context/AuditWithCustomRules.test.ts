import { describe, it, expect, vi } from "vitest";
import { buildAuditMessages, parseAuditResponse } from "@/services/audit/AuditPromptBuilder";
import { buildRepairMessages } from "@/services/repair/RepairPromptBuilder";
import { AuditAIEngine } from "@/services/audit/AuditAIEngine";
import type { ParsedDiff } from "@/core/use-cases/audit/ProcessPullRequestAudit";
import type { RulesProfile } from "@/lib/types";
import type { IAIProvider, AICompletionResult } from "@/infrastructure/ai/IAIProvider";
import type { AuditFinding } from "@/core/entities/PullRequestAudit";

// Diff that imports and uses axios — clean from OWASP perspective but banned by custom rules
const AXIOS_DIFF: ParsedDiff = {
  files: [
    {
      path: "src/api/client.ts",
      additions: 4,
      deletions: 0,
      chunks: [
        {
          oldStart: 1,
          newStart: 1,
          lines: [
            { type: "add", content: "import axios from 'axios';", newLine: 1 },
            { type: "add", content: "", newLine: 2 },
            { type: "add", content: "export async function fetchUser(id: string) {", newLine: 3 },
            { type: "add", content: "  return axios.get(`/api/users/${id}`);", newLine: 4 },
            { type: "add", content: "}", newLine: 5 },
          ],
        },
      ],
    },
  ],
};

const AXIOS_CUSTOM_RULES: RulesProfile = {
  source: "custom",
  rulesMarkdown: `## Forbidden Libraries\n- It is strictly prohibited to use the axios library. All HTTP calls must use the native fetch API instead.`,
};

const DEFAULT_PROFILE: RulesProfile = {
  source: "default",
  rulesMarkdown: `## Default Rules\n- Follow OWASP Top 10 and general security best practices.`,
};

function buildMockResult(content: string): AICompletionResult {
  return { content, inputTokens: 120, outputTokens: 300, model: "gpt-4o" };
}

function makeProvider(content: string): IAIProvider {
  return {
    providerName: "openai",
    complete: vi.fn().mockResolvedValue(buildMockResult(content)),
  };
}

const FINDING_BASE: AuditFinding = {
  id: "f1",
  filePath: "src/api/client.ts",
  lineStart: 1,
  lineEnd: 4,
  category: "compliance",
  severity: "critical",
  title: "Forbidden library: axios",
  description: "axios is banned by organization rules.",
  suggestion: "Use native fetch instead.",
  owaspReference: null,
  debtMinutes: 30,
};

// ─────────────────────────────────────────────────────────────────────────────
// AuditPromptBuilder — system prompt injection
// ─────────────────────────────────────────────────────────────────────────────

describe("AuditPromptBuilder — rules injection into system prompt", () => {
  it("does NOT include organization rules section when no profile is provided", () => {
    const messages = buildAuditMessages(AXIOS_DIFF, "acme/backend");
    expect(messages[0]!.content).not.toContain("ORGANIZATION-SPECIFIC COMPLIANCE RULES");
  });

  it("does NOT include organization rules section for default profile", () => {
    const messages = buildAuditMessages(AXIOS_DIFF, "acme/backend", DEFAULT_PROFILE);
    expect(messages[0]!.content).not.toContain("ORGANIZATION-SPECIFIC COMPLIANCE RULES");
  });

  it("injects the custom rules section when source is 'custom'", () => {
    const messages = buildAuditMessages(AXIOS_DIFF, "acme/backend", AXIOS_CUSTOM_RULES);
    expect(messages[0]!.content).toContain("ORGANIZATION-SPECIFIC COMPLIANCE RULES");
  });

  it("embeds the exact custom rules markdown verbatim in the system prompt", () => {
    const uniqueRules: RulesProfile = {
      source: "custom",
      rulesMarkdown: "UNIQUE_MARKER_NO_LODASH_ALLOWED_IN_THIS_CODEBASE",
    };
    const messages = buildAuditMessages(AXIOS_DIFF, "acme/backend", uniqueRules);
    expect(messages[0]!.content).toContain("UNIQUE_MARKER_NO_LODASH_ALLOWED_IN_THIS_CODEBASE");
  });

  it("instructs the AI to use severity 'critical' for custom rule violations", () => {
    const messages = buildAuditMessages(AXIOS_DIFF, "acme/backend", AXIOS_CUSTOM_RULES);
    const systemPrompt = messages[0]!.content;
    expect(systemPrompt).toContain("critical");
  });

  it("instructs the AI to use category 'compliance' for custom rule violations", () => {
    const messages = buildAuditMessages(AXIOS_DIFF, "acme/backend", AXIOS_CUSTOM_RULES);
    const systemPrompt = messages[0]!.content;
    expect(systemPrompt).toContain("compliance");
  });

  it("system prompt still contains the OWASP baseline instructions alongside custom rules", () => {
    const messages = buildAuditMessages(AXIOS_DIFF, "acme/backend", AXIOS_CUSTOM_RULES);
    const systemPrompt = messages[0]!.content;
    expect(systemPrompt).toContain("OWASP");
    expect(systemPrompt).toContain("ORGANIZATION-SPECIFIC COMPLIANCE RULES");
  });

  it("user message always includes the repo name regardless of rules profile", () => {
    const withRules = buildAuditMessages(AXIOS_DIFF, "acme/backend", AXIOS_CUSTOM_RULES);
    const withoutRules = buildAuditMessages(AXIOS_DIFF, "acme/backend");
    expect(withRules[1]!.content).toContain("acme/backend");
    expect(withoutRules[1]!.content).toContain("acme/backend");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AuditAIEngine — standard rules (no custom profile)
// ─────────────────────────────────────────────────────────────────────────────

describe("AuditAIEngine — standard audit without custom rules", () => {
  it("does not include organization rules in the provider call", async () => {
    const provider = makeProvider(
      JSON.stringify({ findings: [], summary: "No issues." })
    );
    const engine = new AuditAIEngine(provider, "gpt-4o");
    await engine.analyzeDiff(AXIOS_DIFF, "acme/backend");

    const call = vi.mocked(provider.complete).mock.calls[0]![0];
    expect(call.messages[0]!.content).not.toContain("ORGANIZATION-SPECIFIC COMPLIANCE RULES");
  });

  it("rates axios usage as low-severity technical_debt without custom rules", async () => {
    const standardResponse = JSON.stringify({
      findings: [
        {
          filePath: "src/api/client.ts",
          lineStart: 1,
          lineEnd: 4,
          category: "technical_debt",
          severity: "low",
          title: "Third-party HTTP client where native fetch suffices",
          description: "axios adds bundle weight; native fetch covers this use case.",
          suggestion: "Replace axios.get() with fetch(url).then(r => r.json())",
          owaspReference: null,
          debtMinutes: 15,
        },
      ],
      summary: "Minor dependency preference.",
    });

    const provider = makeProvider(standardResponse);
    const engine = new AuditAIEngine(provider, "gpt-4o");
    const result = await engine.analyzeDiff(AXIOS_DIFF, "acme/backend");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]!.severity).toBe("low");
    expect(result.data[0]!.category).toBe("technical_debt");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AuditAIEngine — custom rule: axios is forbidden → CRITICAL compliance finding
// ─────────────────────────────────────────────────────────────────────────────

describe("AuditAIEngine — custom rule enforces axios ban as CRITICAL", () => {
  it("passes custom rules to the AI provider via system prompt", async () => {
    const provider = makeProvider(
      JSON.stringify({ findings: [], summary: "Checked." })
    );
    const engine = new AuditAIEngine(provider, "gpt-4o");
    await engine.analyzeDiff(AXIOS_DIFF, "acme/backend", AXIOS_CUSTOM_RULES);

    const call = vi.mocked(provider.complete).mock.calls[0]![0];
    expect(call.messages[0]!.content).toContain("ORGANIZATION-SPECIFIC COMPLIANCE RULES");
    expect(call.messages[0]!.content).toContain("axios");
  });

  it("AI detects axios import as CRITICAL compliance violation based purely on client rules", async () => {
    const axiosBannedResponse = JSON.stringify({
      findings: [
        {
          filePath: "src/api/client.ts",
          lineStart: 1,
          lineEnd: 4,
          category: "compliance",
          severity: "critical",
          title: "Forbidden library: axios",
          description:
            "The repository bans axios per .reposhield/rules.md. Native fetch must be used for all HTTP calls.",
          suggestion: "Replace `axios.get(url)` with `fetch(url).then(r => r.json())`.",
          owaspReference: null,
          debtMinutes: 30,
        },
      ],
      summary: "Organization compliance violation: forbidden library axios detected.",
    });

    const provider = makeProvider(axiosBannedResponse);
    const engine = new AuditAIEngine(provider, "gpt-4o");
    const result = await engine.analyzeDiff(AXIOS_DIFF, "acme/backend", AXIOS_CUSTOM_RULES);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const finding = result.data[0]!;
    expect(finding.severity).toBe("critical");
    expect(finding.category).toBe("compliance");
  });

  it("custom rule finding title references the banned library", async () => {
    const response = JSON.stringify({
      findings: [
        {
          filePath: "src/api/client.ts",
          lineStart: 1,
          lineEnd: 4,
          category: "compliance",
          severity: "critical",
          title: "Forbidden library: axios",
          description: "axios is banned by organization rules.",
          suggestion: "Use native fetch.",
          owaspReference: null,
          debtMinutes: 30,
        },
      ],
      summary: "Compliance violation.",
    });

    const provider = makeProvider(response);
    const engine = new AuditAIEngine(provider, "gpt-4o");
    const result = await engine.analyzeDiff(AXIOS_DIFF, "acme/backend", AXIOS_CUSTOM_RULES);

    if (!result.success) throw new Error("Expected success");
    expect(result.data[0]!.title).toContain("axios");
  });

  it("all fields of the compliance finding are correctly mapped", async () => {
    const response = JSON.stringify({
      findings: [
        {
          filePath: "src/api/client.ts",
          lineStart: 1,
          lineEnd: 4,
          category: "compliance",
          severity: "critical",
          title: "Forbidden library: axios",
          description: "axios banned.",
          suggestion: "Use fetch.",
          owaspReference: null,
          debtMinutes: 30,
        },
      ],
      summary: "Violation.",
    });

    const provider = makeProvider(response);
    const engine = new AuditAIEngine(provider, "gpt-4o");
    const result = await engine.analyzeDiff(AXIOS_DIFF, "acme/backend", AXIOS_CUSTOM_RULES);

    if (!result.success) throw new Error("Expected success");
    const f = result.data[0]!;
    expect(f.filePath).toBe("src/api/client.ts");
    expect(f.lineStart).toBe(1);
    expect(f.lineEnd).toBe(4);
    expect(f.debtMinutes).toBe(30);
    expect(f.owaspReference).toBeNull();
  });

  it("parseAuditResponse correctly parses a compliance/critical finding", () => {
    const json = JSON.stringify({
      findings: [
        {
          filePath: "src/api/client.ts",
          lineStart: 1,
          lineEnd: 4,
          category: "compliance",
          severity: "critical",
          title: "Forbidden library: axios",
          description: "axios banned per custom rules.",
          suggestion: "Use native fetch.",
          owaspReference: null,
          debtMinutes: 30,
        },
      ],
      summary: "Compliance violation.",
    });

    const findings = parseAuditResponse(json);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("critical");
    expect(findings[0]!.category).toBe("compliance");
    expect(findings[0]!.owaspReference).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RepairPromptBuilder — rules injection
// ─────────────────────────────────────────────────────────────────────────────

describe("RepairPromptBuilder — custom rules in system prompt", () => {
  it("does not include compliance rules section without a profile", () => {
    const messages = buildRepairMessages("src/api/client.ts", "const x = 1;", [
      FINDING_BASE,
    ]);
    expect(messages[0]!.content).not.toContain("ORGANIZATION COMPLIANCE RULES");
  });

  it("does not include compliance rules section for default profile", () => {
    const messages = buildRepairMessages(
      "src/api/client.ts",
      "const x = 1;",
      [FINDING_BASE],
      DEFAULT_PROFILE
    );
    expect(messages[0]!.content).not.toContain("ORGANIZATION COMPLIANCE RULES");
  });

  it("injects organization compliance rules when source is 'custom'", () => {
    const messages = buildRepairMessages(
      "src/api/client.ts",
      "const x = 1;",
      [FINDING_BASE],
      AXIOS_CUSTOM_RULES
    );
    expect(messages[0]!.content).toContain("ORGANIZATION COMPLIANCE RULES");
  });

  it("embeds the exact custom rules markdown in repair system prompt", () => {
    const uniqueRules: RulesProfile = {
      source: "custom",
      rulesMarkdown: "UNIQUE_REPAIR_MARKER_NO_MOMENT_JS",
    };
    const messages = buildRepairMessages(
      "src/api/client.ts",
      "const x = 1;",
      [FINDING_BASE],
      uniqueRules
    );
    expect(messages[0]!.content).toContain("UNIQUE_REPAIR_MARKER_NO_MOMENT_JS");
  });

  it("repair system prompt still enforces surgical patch rules alongside org rules", () => {
    const messages = buildRepairMessages(
      "src/api/client.ts",
      "const x = 1;",
      [FINDING_BASE],
      AXIOS_CUSTOM_RULES
    );
    const systemPrompt = messages[0]!.content;
    expect(systemPrompt).toContain("Fix ONLY the reported vulnerabilities");
    expect(systemPrompt).toContain("ORGANIZATION COMPLIANCE RULES");
  });
});
