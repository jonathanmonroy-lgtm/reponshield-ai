import type { ParsedDiff } from "@/core/use-cases/audit/ProcessPullRequestAudit";
import type { AuditFinding } from "@/core/entities/PullRequestAudit";
import type { AIMessage } from "@/infrastructure/ai/IAIProvider";
import { OWASP_TOP_10, TECHNICAL_DEBT_CATEGORIES } from "@/lib/constants";
import { DiffAnalyzer } from "@/services/audit/DiffAnalyzer";
import type { SeverityLevel, AuditCategory } from "@/lib/types";

const diffAnalyzer = new DiffAnalyzer();

const SYSTEM_PROMPT = `You are RepoShield AI, an expert code auditor specializing in:
1. Technical debt detection (complexity, duplication, poor patterns)
2. Security vulnerabilities (OWASP Top 10)
3. Compliance issues (GDPR, HIPAA data handling, auth patterns)
4. Performance anti-patterns

You analyze Git diffs and produce structured JSON findings. Each finding targets a SPECIFIC line in the diff.

OWASP Top 10 references:
${OWASP_TOP_10.map((o, i) => `${i + 1}. ${o}`).join("\n")}

Technical debt categories: ${TECHNICAL_DEBT_CATEGORIES.join(", ")}

Rules:
- Only flag REAL issues. Do not invent problems.
- Severity: critical (data breach/RCE risk), high (significant bug/vuln), medium (maintainability/minor vuln), low (style/minor debt), info (suggestion only).
- debtMinutes: realistic estimate to fix (5-120 min).
- Always cite the exact filePath and lineEnd from the diff.
- Maximum 20 findings per diff. Prioritize by severity.
- Return ONLY valid JSON, no markdown code fences.`;

export interface RawAuditFinding {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  category: AuditCategory;
  severity: SeverityLevel;
  title: string;
  description: string;
  suggestion: string;
  owaspReference: string | null;
  debtMinutes: number;
}

export interface AuditResponseSchema {
  findings: RawAuditFinding[];
  summary: string;
}

export function buildAuditMessages(
  diff: ParsedDiff,
  repoFullName: string
): AIMessage[] {
  const truncated = diffAnalyzer.truncateForTokenLimit(diff);
  const serialized = diffAnalyzer.serialize(truncated);

  const userMessage = `Analyze this Git diff for repository \`${repoFullName}\` and return a JSON object matching this schema:

{
  "findings": [
    {
      "filePath": "path/to/file.ts",
      "lineStart": 42,
      "lineEnd": 45,
      "category": "security" | "technical_debt" | "compliance" | "performance" | "maintainability",
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "title": "Short descriptive title",
      "description": "Clear explanation of the issue",
      "suggestion": "Concrete code fix or refactoring approach",
      "owaspReference": "A03:2021 - Injection" | null,
      "debtMinutes": 30
    }
  ],
  "summary": "One-sentence overall assessment"
}

DIFF:
\`\`\`diff
${serialized}
\`\`\``;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];
}

export function parseAuditResponse(
  content: string
): Omit<AuditFinding, "id">[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI response contained no valid JSON");
    }
    parsed = JSON.parse(jsonMatch[0]);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).findings)
  ) {
    throw new Error("AI response did not match expected schema");
  }

  const schema = parsed as AuditResponseSchema;

  return schema.findings.map((f) => ({
    filePath: String(f.filePath),
    lineStart: Number(f.lineStart) || 1,
    lineEnd: Number(f.lineEnd) || Number(f.lineStart) || 1,
    category: f.category,
    severity: f.severity,
    title: String(f.title),
    description: String(f.description),
    suggestion: String(f.suggestion),
    owaspReference: f.owaspReference ?? null,
    debtMinutes: Number(f.debtMinutes) || 0,
  }));
}
