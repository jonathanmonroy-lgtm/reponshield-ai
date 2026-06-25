import { describe, it, expect } from "vitest";
import { buildAuditMessages, parseAuditResponse } from "./AuditPromptBuilder";
import type { ParsedDiff } from "@/core/use-cases/audit/ProcessPullRequestAudit";

const SAMPLE_DIFF: ParsedDiff = {
  files: [
    {
      path: "src/db.ts",
      additions: 3,
      deletions: 1,
      chunks: [
        {
          oldStart: 10,
          newStart: 10,
          lines: [
            { type: "del", content: "  return db.query(sql)", newLine: null },
            {
              type: "add",
              content: `  return db.query("SELECT * FROM users WHERE id=" + userId)`,
              newLine: 10,
            },
          ],
        },
      ],
    },
  ],
};

const VALID_AI_RESPONSE = JSON.stringify({
  findings: [
    {
      filePath: "src/db.ts",
      lineStart: 10,
      lineEnd: 10,
      category: "security",
      severity: "critical",
      title: "SQL Injection via string concatenation",
      description: "User input concatenated into SQL query without sanitization.",
      suggestion: "Use parameterized queries: db.query('SELECT * FROM users WHERE id = $1', [userId])",
      owaspReference: "A03:2021 - Injection",
      debtMinutes: 45,
    },
  ],
  summary: "Critical SQL injection vulnerability detected.",
});

describe("AuditPromptBuilder", () => {
  it("builds messages with system and user roles", () => {
    const messages = buildAuditMessages(SAMPLE_DIFF, "acme/backend");
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");
  });

  it("includes repo name in user message", () => {
    const messages = buildAuditMessages(SAMPLE_DIFF, "acme/backend");
    expect(messages[1]?.content).toContain("acme/backend");
  });

  it("includes OWASP reference in system message", () => {
    const messages = buildAuditMessages(SAMPLE_DIFF, "acme/backend");
    expect(messages[0]?.content).toContain("OWASP");
  });

  it("parses a valid AI JSON response into findings", () => {
    const findings = parseAuditResponse(VALID_AI_RESPONSE);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("critical");
    expect(findings[0]?.category).toBe("security");
    expect(findings[0]?.owaspReference).toBe("A03:2021 - Injection");
  });

  it("parses AI response wrapped in markdown code fences", () => {
    const wrapped = "```json\n" + VALID_AI_RESPONSE + "\n```";
    const findings = parseAuditResponse(wrapped);
    expect(findings).toHaveLength(1);
  });

  it("throws on completely invalid response", () => {
    expect(() => parseAuditResponse("I cannot analyze this code.")).toThrow();
  });

  it("returns empty array for zero findings", () => {
    const response = JSON.stringify({
      findings: [],
      summary: "No issues found.",
    });
    const findings = parseAuditResponse(response);
    expect(findings).toHaveLength(0);
  });

  it("sets debtMinutes to 0 when missing from response", () => {
    const response = JSON.stringify({
      findings: [
        {
          filePath: "foo.ts",
          lineStart: 1,
          lineEnd: 1,
          category: "technical_debt",
          severity: "low",
          title: "Missing type",
          description: "...",
          suggestion: "...",
          owaspReference: null,
        },
      ],
      summary: "Minor issue.",
    });
    const findings = parseAuditResponse(response);
    expect(findings[0]?.debtMinutes).toBe(0);
  });
});
