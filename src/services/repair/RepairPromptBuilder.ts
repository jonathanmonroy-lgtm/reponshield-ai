import type { AIMessage } from "@/infrastructure/ai/IAIProvider";
import type { AuditFinding } from "@/core/entities/PullRequestAudit";
import type { RulesProfile } from "@/lib/types";

const BASE_SYSTEM_PROMPT = `You are RepoShield AutoFix, an enterprise-grade security patch generator.
Given a list of critical security vulnerabilities and the complete file content, generate minimal, surgical patches.

Rules (non-negotiable):
- Fix ONLY the reported vulnerabilities. Do not change any other code.
- Preserve the original language, code style, variable names, and business logic exactly.
- Never add imports unless the fix absolutely requires a new one.
- For SQL injection: replace string concatenation with parameterized queries or prepared statements.
- For hardcoded secrets: replace with process.env.VARIABLE_NAME and append a short inline comment.
- For XSS: escape or sanitize only the affected output point.
- Never break compilation, syntax, or existing tests.
- Return ONLY valid JSON — no markdown fences, no prose outside the JSON object.`;

function buildRepairSystemPrompt(rulesProfile?: RulesProfile): string {
  if (rulesProfile?.source !== "custom") return BASE_SYSTEM_PROMPT;

  return (
    BASE_SYSTEM_PROMPT +
    `\n\nORGANIZATION COMPLIANCE RULES:\n` +
    `The repository owner enforces these additional constraints. ` +
    `Ensure the patched code does not introduce any violation of these rules:\n\n` +
    rulesProfile.rulesMarkdown
  );
}

export interface RepairResponse {
  patchedContent: string;
  changesSummary: string;
}

export function buildRepairMessages(
  filePath: string,
  fileContent: string,
  findings: AuditFinding[],
  rulesProfile?: RulesProfile
): AIMessage[] {
  const vulnList = findings
    .map(
      (f, i) =>
        `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\n` +
        `   Lines: ${f.lineStart}–${f.lineEnd}\n` +
        `   OWASP: ${f.owaspReference ?? "N/A"}\n` +
        `   Required fix: ${f.suggestion}`
    )
    .join("\n\n");

  const userMessage =
    `Fix ${findings.length} critical vulnerability(s) in \`${filePath}\`.\n\n` +
    `Vulnerabilities to patch:\n${vulnList}\n\n` +
    `Complete file content:\n\`\`\`\n${fileContent}\n\`\`\`\n\n` +
    `Return JSON matching this schema exactly:\n` +
    `{\n` +
    `  "patchedContent": "...the complete corrected file content as a string...",\n` +
    `  "changesSummary": "...one concise sentence describing what was changed..."\n` +
    `}`;

  return [
    { role: "system", content: buildRepairSystemPrompt(rulesProfile) },
    { role: "user", content: userMessage },
  ];
}

export function parseRepairResponse(content: string): RepairResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Repair AI response contained no valid JSON object");
    }
    parsed = JSON.parse(match[0]);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).patchedContent !== "string"
  ) {
    throw new Error(
      'Repair AI response missing required field "patchedContent"'
    );
  }

  const obj = parsed as Record<string, unknown>;
  return {
    patchedContent: obj.patchedContent as string,
    changesSummary:
      typeof obj.changesSummary === "string"
        ? obj.changesSummary
        : "Security vulnerabilities patched by RepoShield AutoFix",
  };
}
