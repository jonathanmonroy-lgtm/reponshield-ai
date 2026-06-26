import { DiffAnalyzer } from "@/services/audit/DiffAnalyzer";
import { AuditAIEngine } from "@/services/audit/AuditAIEngine";
import type {
  IAIProvider,
  AICompletionOptions,
  AICompletionResult,
} from "@/infrastructure/ai/IAIProvider";
import type { AuditFinding } from "@/core/entities/PullRequestAudit";
import {
  computeSecurityScore,
  computeTotalDebt,
} from "@/core/entities/PullRequestAudit";

// ─── ANSI palette ──────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  white: "\x1b[97m",
} as const;

// ─── Box-drawing helpers ───────────────────────────────────────────────────

const W = 74; // total box width including border chars

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function row(content: string): string {
  const visible = stripAnsi(content);
  const inner = W - 4; // "│ " content " │"
  const pad = Math.max(0, inner - visible.length);
  return `│ ${content}${" ".repeat(pad)} │`;
}

function blank(): string {
  return row("");
}

function top(): string {
  return `┌${"─".repeat(W - 2)}┐`;
}

function bot(): string {
  return `└${"─".repeat(W - 2)}┘`;
}

function div(): string {
  return `├${"─".repeat(W - 2)}┤`;
}

function sectionTop(label: string): string {
  const fill = Math.max(1, W - 5 - label.length);
  return `┌─ ${label} ${"─".repeat(fill)}┐`;
}

function center(text: string): string {
  const visible = stripAnsi(text);
  const inner = W - 4;
  const lp = Math.floor((inner - visible.length) / 2);
  const rp = Math.max(0, inner - visible.length - lp);
  return `│ ${" ".repeat(lp)}${text}${" ".repeat(rp)} │`;
}

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    if (cur.length === 0) {
      cur = word;
    } else if (cur.length + 1 + word.length <= maxWidth) {
      cur += " " + word;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

// ─── Severity badge ────────────────────────────────────────────────────────

function badge(severity: string): string {
  switch (severity) {
    case "critical":
      return `${C.bold}${C.red}◈ CRITICAL${C.reset}`;
    case "high":
      return `${C.bold}${C.yellow}◈ HIGH${C.reset}`;
    case "medium":
      return `${C.bold}${C.cyan}◈ MEDIUM${C.reset}`;
    case "low":
      return `${C.bold}${C.gray}◈ LOW${C.reset}`;
    default:
      return `${C.bold}◈ INFO${C.reset}`;
  }
}

// ─── Score bar ─────────────────────────────────────────────────────────────

function scoreBar(score: number, barLen = 20): string {
  const filled = Math.round((score / 100) * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  const color = score <= 40 ? C.red : score <= 70 ? C.yellow : C.green;
  return `${color}${bar}${C.reset}`;
}

// ─── Diff colorizer ────────────────────────────────────────────────────────

function colorDiffLine(line: string): string {
  if (line.startsWith("+"))
    return `${C.green}${line}${C.reset}`;
  if (line.startsWith("-"))
    return `${C.red}${line}${C.reset}`;
  if (line.startsWith("@@"))
    return `${C.cyan}${line}${C.reset}`;
  if (
    line.startsWith("diff") ||
    line.startsWith("index") ||
    line.startsWith("---") ||
    line.startsWith("+++")
  )
    return `${C.gray}${line}${C.reset}`;
  return `${C.dim}${line}${C.reset}`;
}

// ─── GitHub PR comment formatter ───────────────────────────────────────────

function buildGitHubComment(f: Omit<AuditFinding, "id">): string {
  const lvl = f.severity.toUpperCase();
  const owasp = f.owaspReference ? ` · ${f.owaspReference}` : "";
  return [
    `**[${lvl}] ${f.title}**`,
    ``,
    `📍 \`${f.filePath}\` · Lines ${f.lineStart}–${f.lineEnd}${owasp}`,
    ``,
    f.description,
    ``,
    `**Suggested fix:** ${f.suggestion}`,
    ``,
    `> _RepoShield AI — automated security review_`,
  ].join("\n");
}

// ─── Mock data ─────────────────────────────────────────────────────────────

const MOCK_DIFF = `diff --git a/userController.js b/userController.js
index 0000000..1234abc 100644
--- a/userController.js
+++ b/userController.js
@@ -1,3 +1,15 @@
+const AWS_SECRET_KEY = "AKIAIOSFODNN7EXAMPLE/wJalrXUtnFEMI/K7MDENG";
+
 const db = require('./db');

+async function getUser(req, res) {
+  const userId = req.params.id;
+  const role   = req.query.role;
+
+  const query = "SELECT * FROM users WHERE id = " + userId +
+                " AND role = '" + role + "'";
+
+  const result = await db.query(query);
+  res.json(result.rows);
+}
+
 module.exports = { getUser };`;

const MOCK_AI_RESPONSE = JSON.stringify({
  findings: [
    {
      filePath: "userController.js",
      lineStart: 8,
      lineEnd: 10,
      category: "security",
      severity: "critical",
      title: "SQL Injection via String Concatenation",
      description:
        "User-controlled values `userId` and `role` are concatenated directly into a SQL query string. An attacker can craft malicious input to bypass authentication, exfiltrate the entire database, or delete records.",
      suggestion:
        "Replace concatenation with parameterized queries: db.query('SELECT * FROM users WHERE id = $1 AND role = $2', [userId, role])",
      owaspReference: "A03:2021 - Injection",
      debtMinutes: 45,
    },
    {
      filePath: "userController.js",
      lineStart: 1,
      lineEnd: 1,
      category: "security",
      severity: "critical",
      title: "Hardcoded AWS Secret Key Exposed in Source",
      description:
        "An AWS secret access key is committed in plaintext. Any developer or CI runner with repository read access can use this credential to exfiltrate data, spin up infrastructure, or incur unbounded charges.",
      suggestion:
        "Remove and rotate this key immediately via the AWS console. Inject credentials at runtime via process.env.AWS_SECRET_ACCESS_KEY or use AWS Secrets Manager.",
      owaspReference: "A02:2021 - Cryptographic Failures",
      debtMinutes: 30,
    },
  ],
  summary:
    "Two critical vulnerabilities detected: SQL injection enabling full database compromise and a plaintext AWS credential enabling cloud resource takeover. Neither should merge.",
});

const mockProvider: IAIProvider = {
  providerName: "anthropic",
  async complete(_opts: AICompletionOptions): Promise<AICompletionResult> {
    // Simulate realistic AI round-trip latency
    await new Promise<void>((resolve) => setTimeout(resolve, 680));
    return {
      content: MOCK_AI_RESPONSE,
      inputTokens: 312,
      outputTokens: 189,
      model: "claude-sonnet-4-6",
    };
  },
};

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const REPO = "acme-corp/backend";
  const PR_TITLE = "feat: add user authentication endpoint";
  const PR_NUM = 42;
  const INNER = W - 4; // 70 chars of usable inner content

  process.stdout.write("\n");

  // ── Header block ──────────────────────────────────────────────────────────
  console.log(top());
  console.log(blank());
  console.log(
    center(
      `${C.bold}${C.cyan}🛡  REPOSHIELD AI  —  SECURITY AUDIT REPORT${C.reset}`
    )
  );
  console.log(blank());
  console.log(div());
  console.log(
    row(
      `  ${C.bold}Repository   :${C.reset}  ${C.cyan}${REPO}${C.reset}`
    )
  );
  console.log(
    row(
      `  ${C.bold}Pull Request :${C.reset}  #${PR_NUM} · ${PR_TITLE}`
    )
  );
  console.log(row(`  ${C.bold}File         :${C.reset}  userController.js`));
  console.log(
    row(
      `  ${C.bold}Engine       :${C.reset}  anthropic / claude-sonnet-4-6`
    )
  );
  console.log(blank());
  console.log(bot());
  process.stdout.write("\n");

  // ── Spinner lines ─────────────────────────────────────────────────────────
  process.stdout.write(`${C.gray}  ▸ Parsing unified diff...${C.reset}\n`);

  const analyzer = new DiffAnalyzer();
  const parsed = analyzer.parse(MOCK_DIFF);
  const engine = new AuditAIEngine(mockProvider, "claude-sonnet-4-6");

  process.stdout.write(
    `${C.gray}  ▸ Sending diff to AI engine (${parsed.files.length} file, ${parsed.files[0]?.chunks[0]?.lines.length ?? 0} lines)...${C.reset}\n`
  );

  const t0 = Date.now();
  const result = await engine.analyzeDiff(parsed, REPO);
  const elapsedMs = Date.now() - t0;

  if (!result.success) {
    process.stderr.write(
      `\n${C.red}${C.bold}Engine error:${C.reset} ${result.error.message}\n\n`
    );
    process.exit(1);
  }

  const findings = result.data;
  process.stdout.write(
    `${C.green}  ✔ Analysis complete — ${findings.length} finding(s) in ${elapsedMs}ms${C.reset}\n`
  );
  process.stdout.write("\n");

  // ── Code analyzed ─────────────────────────────────────────────────────────
  console.log(sectionTop("CODE ANALYZED  ·  userController.js  (git diff)"));
  console.log(blank());
  for (const line of MOCK_DIFF.split("\n")) {
    const raw = line.length > INNER ? line.slice(0, INNER - 1) + "…" : line;
    console.log(row(colorDiffLine(raw)));
  }
  console.log(blank());
  console.log(bot());
  process.stdout.write("\n");

  // ── Findings ──────────────────────────────────────────────────────────────
  const critCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;

  console.log(
    sectionTop(
      `AUDIT FINDINGS  ·  ${critCount} CRITICAL  ${highCount} HIGH  detected`
    )
  );

  findings.forEach((finding, idx) => {
    if (idx > 0) console.log(div());
    console.log(blank());

    // Finding headline
    const bdg = badge(finding.severity);
    const titleLine = `  ${bdg}  ${C.bold}${finding.title}${C.reset}`;
    console.log(row(titleLine));

    // Meta: file, lines, OWASP
    const owasp = finding.owaspReference
      ? `  ·  ${finding.owaspReference}`
      : "";
    console.log(
      row(
        `  ${C.gray}${finding.filePath}  ·  Lines ${finding.lineStart}–${finding.lineEnd}${owasp}${C.reset}`
      )
    );
    console.log(blank());

    // Description (word-wrapped)
    const descLines = wrapText(finding.description, INNER - 4);
    for (const dl of descLines) {
      console.log(row(`    ${dl}`));
    }
    console.log(blank());

    // Fix suggestion (word-wrapped)
    const fixFull = `✦ Fix: ${finding.suggestion}`;
    const fixLines = wrapText(fixFull, INNER - 2);
    for (const fl of fixLines) {
      console.log(row(`  ${C.cyan}${fl}${C.reset}`));
    }
    console.log(blank());

    // GitHub PR comment preview
    console.log(
      row(
        `  ${C.dim}── GitHub PR Comment (Markdown) ${"─".repeat(INNER - 36)}${C.reset}`
      )
    );
    console.log(blank());
    const ghComment = buildGitHubComment(finding);
    for (const ghLine of ghComment.split("\n")) {
      const display =
        ghLine.length > INNER - 4
          ? ghLine.slice(0, INNER - 5) + "…"
          : ghLine;
      console.log(row(`    ${C.gray}${display}${C.reset}`));
    }
    console.log(blank());
  });

  console.log(bot());
  process.stdout.write("\n");

  // ── Metrics ───────────────────────────────────────────────────────────────
  const findingsWithIds: AuditFinding[] = findings.map((f, i) => ({
    ...f,
    id: String(i + 1),
  }));
  const secScore = computeSecurityScore(findingsWithIds);
  const totalDebt = computeTotalDebt(findingsWithIds);

  const manualReviewMin = 240; // typical manual review: 4 hours
  const savedMin = Math.max(0, manualReviewMin - Math.ceil(elapsedMs / 1000 / 60));
  const savedPct = Math.round((savedMin / manualReviewMin) * 100);
  const scoreColor = secScore <= 40 ? C.red : secScore <= 70 ? C.yellow : C.green;

  console.log(sectionTop("METRICS  ·  Case Study Results"));
  console.log(blank());
  console.log(
    row(
      `  ${C.bold}Security Score     :${C.reset}  ${scoreColor}${C.bold}${secScore} / 100${C.reset}  ${scoreBar(secScore)}  ${scoreColor}${C.bold}CRITICAL RISK${C.reset}`
    )
  );
  console.log(blank());
  console.log(
    row(
      `  ${C.bold}Vulnerabilities    :${C.reset}  ${C.red}${critCount} CRITICAL${C.reset}   ${highCount} HIGH   0 MEDIUM   0 LOW`
    )
  );
  console.log(
    row(`  ${C.bold}OWASP Categories  :${C.reset}  A02 Cryptographic Failures  ·  A03 Injection`)
  );
  console.log(
    row(`  ${C.bold}Estimated Fix Time :${C.reset}  ${totalDebt} min`)
  );
  console.log(
    row(`  ${C.bold}AI Processing Time :${C.reset}  ${elapsedMs}ms`)
  );
  console.log(blank());
  console.log(div());
  console.log(blank());
  console.log(
    row(
      `  ${C.green}${C.bold}Review Time Saved  :  ~${savedMin} min  (${savedPct}% faster than manual review)${C.reset}`
    )
  );
  console.log(blank());
  console.log(
    row(
      `  ${C.gray}This PR carried 2 critical vulnerabilities that would have shipped${C.reset}`
    )
  );
  console.log(
    row(
      `  ${C.gray}undetected without an automated gate. RepoShield caught both in${C.reset}`
    )
  );
  console.log(
    row(
      `  ${C.gray}${elapsedMs}ms — before a single line reached production.${C.reset}`
    )
  );
  console.log(blank());
  console.log(bot());
  process.stdout.write("\n");
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\n${C.red}${C.bold}Fatal:${C.reset} ${msg}\n\n`);
  process.exit(1);
});
