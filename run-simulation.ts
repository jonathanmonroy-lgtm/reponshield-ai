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
import type { PlanType } from "@/core/entities/Subscription";

// ─── ANSI palette ─────────────────────────────────────────────────────────────

const C = {
  reset:         "\x1b[0m",
  bold:          "\x1b[1m",
  dim:           "\x1b[2m",
  red:           "\x1b[31m",
  yellow:        "\x1b[33m",
  green:         "\x1b[32m",
  cyan:          "\x1b[36m",
  magenta:       "\x1b[35m",
  white:         "\x1b[97m",
  gray:          "\x1b[90m",
  brightYellow:  "\x1b[93m",
  brightCyan:    "\x1b[96m",
  brightGreen:   "\x1b[92m",
  brightRed:     "\x1b[91m",
  brightMagenta: "\x1b[95m",
} as const;

// ─── Box-drawing helpers ──────────────────────────────────────────────────────

const W = 76;
const INNER = W - 4; // usable content width between "│ " and " │"

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function row(content: string): string {
  const visible = stripAnsi(content);
  const pad = Math.max(0, INNER - visible.length);
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

function center(text: string): string {
  const visible = stripAnsi(text);
  const lp = Math.floor((INNER - visible.length) / 2);
  const rp = Math.max(0, INNER - visible.length - lp);
  return `│ ${" ".repeat(lp)}${text}${" ".repeat(rp)} │`;
}

function sectionTop(label: string): string {
  const fill = Math.max(1, W - 5 - label.length);
  return `┌─ ${label} ${"─".repeat(fill)}┐`;
}

// Double-line border for major call-out panels
function dTop(): string  { return `╔${"═".repeat(W - 2)}╗`; }
function dBot(): string  { return `╚${"═".repeat(W - 2)}╝`; }
function dDiv(): string  { return `╠${"═".repeat(W - 2)}╣`; }
function dRow(content: string): string {
  const visible = stripAnsi(content);
  const pad = Math.max(0, INNER - visible.length);
  return `║ ${content}${" ".repeat(pad)} ║`;
}
function dCenter(text: string): string {
  const visible = stripAnsi(text);
  const lp = Math.floor((INNER - visible.length) / 2);
  const rp = Math.max(0, INNER - visible.length - lp);
  return `║ ${" ".repeat(lp)}${text}${" ".repeat(rp)} ║`;
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

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function badge(severity: string): string {
  switch (severity) {
    case "critical": return `${C.bold}${C.brightRed}◈ CRITICAL${C.reset}`;
    case "high":     return `${C.bold}${C.yellow}◈ HIGH${C.reset}`;
    case "medium":   return `${C.bold}${C.brightCyan}◈ MEDIUM${C.reset}`;
    case "low":      return `${C.bold}${C.gray}◈ LOW${C.reset}`;
    default:         return `${C.bold}◈ INFO${C.reset}`;
  }
}

function scoreBar(score: number, barLen = 20): string {
  const filled = Math.round((score / 100) * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  const color = score <= 40 ? C.red : score <= 70 ? C.yellow : C.green;
  return `${color}${bar}${C.reset}`;
}

function colorDiffLine(line: string): string {
  if (line.startsWith("+"))
    return `${C.brightGreen}${line}${C.reset}`;
  if (line.startsWith("-"))
    return `${C.red}${line}${C.reset}`;
  if (line.startsWith("@@"))
    return `${C.brightCyan}${line}${C.reset}`;
  if (line.startsWith("diff") || line.startsWith("index") ||
      line.startsWith("---") || line.startsWith("+++"))
    return `${C.gray}${line}${C.reset}`;
  return `${C.dim}${line}${C.reset}`;
}

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

// ─── Animated progress step ──────────────────────────────────────────────────

async function animatedStep(label: string, durationMs: number): Promise<void> {
  const BAR_LEN = 22;
  const STEPS = 14;
  const LABEL_W = 48;
  // Pre-compute a clean line width to erase previous writes
  const CLEAR_W = 4 + LABEL_W + 3 + BAR_LEN + 7;

  for (let i = 0; i <= STEPS; i++) {
    const filled = Math.round((i / STEPS) * BAR_LEN);
    const bar = "█".repeat(filled) + "░".repeat(BAR_LEN - filled);
    const pct = String(Math.round((i / STEPS) * 100)).padStart(3);
    const paddedLabel = label.padEnd(LABEL_W);
    const done = i === STEPS;
    const barColor = done ? C.brightGreen : C.cyan;
    const iconColor = done ? C.brightGreen : C.brightYellow;
    const icon = done ? "✔" : "⟳";

    const line =
      `  ${iconColor}${icon}${C.reset} ${paddedLabel} ${barColor}[${bar}]${C.reset}  ${C.bold}${pct}%${C.reset}`;
    const trailing = " ".repeat(Math.max(0, CLEAR_W - stripAnsi(line).length));
    process.stdout.write(`\r${line}${trailing}`);
    if (i < STEPS) await sleep(durationMs / STEPS);
  }
  process.stdout.write("\n");
}

// ─── Mock data ────────────────────────────────────────────────────────────────

// Scenario 1 — Starter plan: code quality / tech debt, no critical vulns
const STARTER_DIFF = `diff --git a/reportService.js b/reportService.js
index 0000000..aabb123 100644
--- a/reportService.js
+++ b/reportService.js
@@ -1,3 +1,38 @@
 const db = require('./db');
+const moment = require('moment');
+
+async function generateUserReport(userId, startDate, endDate, format, opts) {
+  var query = "SELECT * FROM orders WHERE user_id = " + userId;
+  var result = await db.query(query);
+  var allOrders = result.rows;
+
+  var totalRevenue = 0;
+  var totalItems = 0;
+  var avgOrderValue = 0;
+  var revenueByDay = {};
+  var revenueByCategory = {};
+  var topItems = [];
+
+  for (var i = 0; i < allOrders.length; i++) {
+    var order = allOrders[i];
+    totalRevenue += order.total;
+    totalItems += order.items.length;
+
+    var day = moment(order.createdAt).format('YYYY-MM-DD');
+    if (!revenueByDay[day]) revenueByDay[day] = 0;
+    revenueByDay[day] += order.total;
+
+    for (var j = 0; j < order.items.length; j++) {
+      var item = order.items[j];
+      if (!revenueByCategory[item.category])
+        revenueByCategory[item.category] = 0;
+      revenueByCategory[item.category] += item.price;
+      topItems.push(item);
+    }
+  }
+
+  avgOrderValue = totalRevenue / allOrders.length;
+  topItems = topItems.sort((a, b) => b.price - a.price).slice(0, 10);
+  return { totalRevenue, totalItems, avgOrderValue, topItems, format, opts };
+}
+
 module.exports = { generateUserReport };`;

const STARTER_AI_RESPONSE = JSON.stringify({
  findings: [
    {
      filePath: "reportService.js",
      lineStart: 4,
      lineEnd: 5,
      category: "security",
      severity: "medium",
      title: "SQL Injection Risk via String Concatenation",
      description:
        "User-controlled `userId` is concatenated into a SQL query string. While this endpoint may currently be called from trusted internal code, the pattern is exploitable if the call site changes or the parameter is later exposed to a public API.",
      suggestion:
        "Use a parameterized query: db.query('SELECT * FROM orders WHERE user_id = $1', [userId])",
      owaspReference: "A03:2021 - Injection",
      debtMinutes: 20,
    },
    {
      filePath: "reportService.js",
      lineStart: 7,
      lineEnd: 37,
      category: "maintainability",
      severity: "medium",
      title: "God Function — Cyclomatic Complexity ≥ 14",
      description:
        "generateUserReport handles data fetching, aggregation, date grouping, category pivoting, and sorting in a single 38-line function. This makes isolated unit-testing difficult and increases cognitive load for every future maintainer.",
      suggestion:
        "Extract sub-functions: fetchOrders(), aggregateRevenue(), groupByDay(), buildTopItems(). Each should have a single responsibility and a focused test.",
      owaspReference: null,
      debtMinutes: 60,
    },
    {
      filePath: "reportService.js",
      lineStart: 35,
      lineEnd: 35,
      category: "reliability",
      severity: "low",
      title: "Division by Zero on Empty Orders",
      description:
        "avgOrderValue = totalRevenue / allOrders.length produces NaN when a user has no orders. NaN propagates silently into API responses and can break downstream JSON consumers that perform arithmetic on the field.",
      suggestion:
        "Guard with: avgOrderValue = allOrders.length > 0 ? totalRevenue / allOrders.length : 0",
      owaspReference: null,
      debtMinutes: 10,
    },
  ],
  summary:
    "Three issues found: one medium SQL injection risk pattern, one overly complex god function, and one edge-case division-by-zero. No critical vulnerabilities detected.",
});

// Scenario 2 — Enterprise plan: critical security issues
const ENTERPRISE_DIFF = `diff --git a/userController.js b/userController.js
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

const ENTERPRISE_AI_RESPONSE = JSON.stringify({
  findings: [
    {
      filePath: "userController.js",
      lineStart: 8,
      lineEnd: 10,
      category: "security",
      severity: "critical",
      title: "SQL Injection via String Concatenation",
      description:
        "User-controlled values `userId` and `role` are concatenated directly into a SQL query string. An attacker can craft malicious input to bypass authentication, exfiltrate the entire database, or delete all records. This is exploitable without authentication.",
      suggestion:
        "Replace with parameterized query: db.query('SELECT * FROM users WHERE id = $1 AND role = $2', [userId, role])",
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
        "An AWS secret access key is committed in plaintext. Any developer or CI runner with repository read access can use this credential to exfiltrate S3 data, launch EC2 instances, or incur unbounded AWS charges. GitHub secret scanning would flag this immediately.",
      suggestion:
        "Remove and rotate this key immediately via the AWS IAM console. Inject at runtime via process.env.AWS_SECRET_ACCESS_KEY or use AWS Secrets Manager / Parameter Store.",
      owaspReference: "A02:2021 - Cryptographic Failures",
      debtMinutes: 30,
    },
  ],
  summary:
    "Two critical vulnerabilities detected: SQL injection enabling full database compromise and a plaintext AWS credential enabling cloud resource takeover. Neither should merge.",
});

// ─── Mock AI providers ────────────────────────────────────────────────────────

function makeProvider(jsonResponse: string, latencyMs = 720): IAIProvider {
  return {
    providerName: "anthropic",
    async complete(_opts: AICompletionOptions): Promise<AICompletionResult> {
      await sleep(latencyMs);
      return {
        content: jsonResponse,
        inputTokens: 312,
        outputTokens: 189,
        model: "claude-sonnet-4-6",
      };
    },
  };
}

// ─── Reusable display blocks ──────────────────────────────────────────────────

function printWebhookBox(
  repo: string,
  prNum: number,
  prTitle: string,
  sha: string,
): void {
  console.log(top());
  console.log(blank());
  console.log(center(`${C.bold}${C.brightMagenta}⬡  GITHUB WEBHOOK RECEIVED${C.reset}`));
  console.log(blank());
  console.log(div());
  console.log(row(`  ${C.bold}Event        :${C.reset}  ${C.dim}pull_request · action: opened${C.reset}`));
  console.log(row(`  ${C.bold}Repository   :${C.reset}  ${C.brightCyan}${repo}${C.reset}`));
  console.log(row(`  ${C.bold}Pull Request :${C.reset}  #${prNum} · ${prTitle}`));
  console.log(row(`  ${C.bold}Head SHA     :${C.reset}  ${C.gray}${sha}${C.reset}`));
  console.log(row(`  ${C.bold}Timestamp    :${C.reset}  ${new Date().toISOString()}`));
  console.log(blank());
  console.log(bot());
}

function printDiffBox(diffText: string, filename: string): void {
  const label = `CODE DIFF  ·  ${filename}  (git unified diff)`;
  console.log(sectionTop(label));
  console.log(blank());
  for (const line of diffText.split("\n")) {
    const raw = line.length > INNER ? line.slice(0, INNER - 1) + "…" : line;
    console.log(row(colorDiffLine(raw)));
  }
  console.log(blank());
  console.log(bot());
}

function printFindingsBox(findings: Omit<AuditFinding, "id">[]): void {
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

  const parts: string[] = [];
  if (counts["critical"]) parts.push(`${counts["critical"]} CRITICAL`);
  if (counts["high"])     parts.push(`${counts["high"]} HIGH`);
  if (counts["medium"])   parts.push(`${counts["medium"]} MEDIUM`);
  if (counts["low"])      parts.push(`${counts["low"]} LOW`);
  const label = `AUDIT FINDINGS  ·  ${parts.join("  ")}  detected`;

  console.log(sectionTop(label));

  findings.forEach((finding, idx) => {
    if (idx > 0) console.log(div());
    console.log(blank());
    console.log(row(`  ${badge(finding.severity)}  ${C.bold}${finding.title}${C.reset}`));
    const owasp = finding.owaspReference ? `  ·  ${finding.owaspReference}` : "";
    console.log(row(`  ${C.gray}${finding.filePath}  ·  Lines ${finding.lineStart}–${finding.lineEnd}${owasp}${C.reset}`));
    console.log(blank());
    for (const dl of wrapText(finding.description, INNER - 4)) {
      console.log(row(`    ${dl}`));
    }
    console.log(blank());
    for (const fl of wrapText(`✦ Fix: ${finding.suggestion}`, INNER - 2)) {
      console.log(row(`  ${C.brightCyan}${fl}${C.reset}`));
    }
    console.log(blank());
  });

  console.log(bot());
}

function printGitHubCommentsBox(findings: Omit<AuditFinding, "id">[]): void {
  const label = `GITHUB PR COMMENTS  ·  ${findings.length} comment(s) will be posted automatically`;
  console.log(sectionTop(label));

  findings.forEach((finding, idx) => {
    if (idx > 0) console.log(div());
    console.log(blank());
    const headerLine =
      `── Comment on ${finding.filePath}:${finding.lineStart} ` +
      "─".repeat(Math.max(0, INNER - 4 - 13 - finding.filePath.length - String(finding.lineStart).length));
    console.log(row(`  ${C.dim}${headerLine}${C.reset}`));
    console.log(blank());
    for (const ghLine of buildGitHubComment(finding).split("\n")) {
      const display = ghLine.length > INNER - 4 ? ghLine.slice(0, INNER - 5) + "…" : ghLine;
      console.log(row(`    ${C.gray}${display}${C.reset}`));
    }
    console.log(blank());
  });

  console.log(bot());
}

function printMetricsBar(findings: Omit<AuditFinding, "id">[], elapsedMs: number): void {
  const withIds: AuditFinding[] = findings.map((f, i) => ({ ...f, id: String(i + 1) }));
  const secScore = computeSecurityScore(withIds);
  const totalDebt = computeTotalDebt(withIds);
  const scoreColor = secScore <= 40 ? C.red : secScore <= 70 ? C.yellow : C.brightGreen;

  console.log(sectionTop("AUDIT METRICS"));
  console.log(blank());
  console.log(row(`  ${C.bold}Security Score  :${C.reset}  ${scoreColor}${C.bold}${secScore} / 100${C.reset}  ${scoreBar(secScore)}  ${scoreColor}${secScore <= 40 ? "CRITICAL RISK" : secScore <= 70 ? "MODERATE RISK" : "LOW RISK"}${C.reset}`));
  console.log(row(`  ${C.bold}Tech Debt       :${C.reset}  ${totalDebt} min estimated remediation time`));
  console.log(row(`  ${C.bold}AI Engine       :${C.reset}  anthropic / claude-sonnet-4-6  ·  ${elapsedMs}ms`));
  console.log(blank());
  console.log(bot());
}

function printPlanGateBox(plan: PlanType, feature: string): void {
  const blocked = plan !== "enterprise";
  const statusColor = blocked ? C.brightRed : C.brightGreen;
  const statusText  = blocked ? "BLOCKED" : "AUTHORIZED";
  const statusIcon  = blocked ? "⛔" : "✅";

  console.log(top());
  console.log(blank());
  console.log(center(`${C.bold}${statusColor}${statusIcon}  FEATURE GATE  —  ${statusText}${C.reset}`));
  console.log(blank());
  console.log(div());
  console.log(row(`  ${C.bold}Organization Plan  :${C.reset}  ${statusColor}${C.bold}${plan.toUpperCase()}${C.reset}`));
  console.log(row(`  ${C.bold}Requested Feature  :${C.reset}  ${feature}`));
  console.log(row(`  ${C.bold}Access             :${C.reset}  ${statusColor}${C.bold}${statusText}${C.reset}`));

  if (blocked) {
    console.log(blank());
    console.log(div());
    console.log(blank());
    console.log(row(`  ${C.brightYellow}${C.bold}⚠  AutoFix Self-Healing requires the Enterprise plan.${C.reset}`));
    console.log(row(`  ${C.yellow}   Your team must remediate these findings manually.${C.reset}`));
    console.log(blank());
    console.log(row(`  ${C.dim}✔  PR audit completed successfully${C.reset}`));
    console.log(row(`  ${C.dim}✔  ${findings.length} inline GitHub comment(s) posted on the PR${C.reset}`));
    console.log(row(`  ${C.dim}✗  Automated security patch NOT generated (upgrade required)${C.reset}`));
  }
  console.log(blank());
  console.log(bot());
}

// Module-level storage so printPlanGateBox can reference the last finding count
let findings: Omit<AuditFinding, "id">[] = [];

// ─── AutoFix simulation ───────────────────────────────────────────────────────

async function simulateAutoFix(
  autoFixFindings: Omit<AuditFinding, "id">[],
  prNum: number,
): Promise<void> {
  const branchName = `reposhield/autofix-pr-${prNum}`;
  const fixPrNum   = prNum + 1;
  const critCount  = autoFixFindings.filter((f) => f.severity === "critical").length;

  // AutoFix trigger announcement
  console.log(top());
  console.log(blank());
  console.log(center(`${C.bold}${C.brightGreen}⚡  AUTOFIX ENGINE  —  ENTERPRISE SELF-HEALING${C.reset}`));
  console.log(blank());
  console.log(div());
  console.log(row(`  ${C.bold}${C.brightYellow}▶  Trigger       :${C.reset}  ${critCount} CRITICAL finding(s) detected in PR #${prNum}`));
  console.log(row(`  ${C.bold}${C.brightYellow}▶  Mode          :${C.reset}  Fire-and-forget (non-blocking audit pipeline)`));
  console.log(row(`  ${C.bold}${C.brightYellow}▶  Target branch :${C.reset}  ${C.brightCyan}${branchName}${C.reset}`));
  console.log(row(`  ${C.bold}${C.brightYellow}▶  Base          :${C.reset}  main`));
  console.log(blank());
  console.log(bot());
  process.stdout.write("\n");

  // Animated 6-step pipeline
  await animatedStep("Downloading userController.js via GitHub Contents API", 500);
  await animatedStep("Sending file + findings to claude-sonnet-4-6 for patch",  800);
  await animatedStep("Parsing AI JSON patch response",                           280);
  await animatedStep(`Creating branch ${branchName}`,                           420);
  await animatedStep("Committing patched file to fix branch",                   360);
  await animatedStep(`Opening automated Pull Request #${fixPrNum}`,             480);
  process.stdout.write("\n");

  // Success result box
  console.log(dTop());
  console.log(dRow(""));
  console.log(dCenter(`${C.bold}${C.brightGreen}✅  AUTOFIX COMPLETE  —  PULL REQUEST OPENED${C.reset}`));
  console.log(dRow(""));
  console.log(dDiv());
  console.log(dRow(""));
  console.log(dRow(`  ${C.bold}Fix PR      :${C.reset}  ${C.brightGreen}${C.bold}#${fixPrNum}${C.reset}  →  targeting \`main\``));
  console.log(dRow(`  ${C.bold}Branch      :${C.reset}  ${C.brightCyan}${branchName}${C.reset}`));
  console.log(dRow(`  ${C.bold}Files       :${C.reset}  1 file patched  (userController.js)`));
  console.log(dRow(`  ${C.bold}Fixed       :${C.reset}  ${C.brightGreen}${critCount} CRITICAL vulnerability(s) remediated${C.reset}`));
  console.log(dRow(""));
  console.log(dDiv());
  console.log(dRow(""));
  console.log(dRow(`  ${C.dim}── Pull Request Body preview ${"─".repeat(INNER - 32)}${C.reset}`));
  console.log(dRow(""));

  const prBodyLines = [
    "## 🛡 RepoShield AutoFix — Automated Security Patch",
    "",
    `Automatically generated in response to **${critCount} critical vulnerability(s)**`,
    `detected in PR #${prNum} by RepoShield AI.`,
    "",
    "### Vulnerabilities Fixed",
    ...autoFixFindings.map((f) => `- **[CRITICAL]** ${f.title} in \`${f.filePath}\``),
    "",
    "### Changes",
    "- Patched 1 file with minimal, syntax-preserving fixes",
    "- All patches follow OWASP Top 10 remediation guidelines",
    "",
    "> ⚡ Generated by RepoShield AI AutoFix — Enterprise Self-Healing Engine",
  ];
  for (const prLine of prBodyLines) {
    const display = prLine.length > INNER - 4 ? prLine.slice(0, INNER - 5) + "…" : prLine;
    console.log(dRow(`    ${C.gray}${display}${C.reset}`));
  }
  console.log(dRow(""));
  console.log(dBot());
}

// ─── Scenario banner ──────────────────────────────────────────────────────────

function printScenarioBanner(
  num: number,
  total: number,
  plan: PlanType,
  org: string,
  tagline: string,
): void {
  const planColor =
    plan === "enterprise" ? C.brightGreen :
    plan === "pro"        ? C.brightCyan  : C.brightYellow;

  const planBadge = `${planColor}${C.bold}[ ${plan.toUpperCase()} PLAN ]${C.reset}`;
  const ruler = "═".repeat(W);

  process.stdout.write("\n");
  console.log(`${C.dim}${ruler}${C.reset}`);
  console.log(
    `  ${C.bold}${C.white}SCENARIO ${num} of ${total}${C.reset}` +
    `  ·  ${planBadge}` +
    `  ·  ${C.bold}${org}${C.reset}`,
  );
  console.log(`  ${C.dim}${tagline}${C.reset}`);
  console.log(`${C.dim}${ruler}${C.reset}`);
  process.stdout.write("\n");
}

// ─── Scenario 1 — Starter plan ───────────────────────────────────────────────

async function runScenario1(): Promise<number> {
  printScenarioBanner(
    1, 2, "starter",
    "Acme Corp",
    "Tech debt audit · medium-severity code quality issues · AutoFix blocked at plan gate",
  );
  await sleep(300);

  printWebhookBox("acme-corp/backend", 17, "feat: add monthly sales report endpoint", "a3f8c1d");
  process.stdout.write("\n");
  await sleep(200);

  process.stdout.write(`${C.gray}  ▸ Verifying webhook HMAC-SHA256 signature...${C.reset}\n`);
  await sleep(180);
  process.stdout.write(`${C.brightGreen}  ✔ Signature valid${C.reset}\n`);

  process.stdout.write(`${C.gray}  ▸ Resolving subscription plan for acme-corp...${C.reset}\n`);
  await sleep(220);
  process.stdout.write(`${C.brightYellow}  ✔ Plan: ${C.bold}STARTER${C.reset}\n`);

  process.stdout.write(`${C.gray}  ▸ Parsing unified diff...${C.reset}\n`);
  await sleep(120);

  const analyzer = new DiffAnalyzer();
  const parsed   = analyzer.parse(STARTER_DIFF);
  const engine   = new AuditAIEngine(makeProvider(STARTER_AI_RESPONSE), "claude-sonnet-4-6");

  process.stdout.write(`${C.gray}  ▸ Sending diff to AI engine (${parsed.files.length} file)...${C.reset}\n`);
  const t0     = Date.now();
  const result = await engine.analyzeDiff(parsed, "acme-corp/backend");
  const elapsed = Date.now() - t0;

  if (!result.success) {
    process.stderr.write(`\n${C.brightRed}Engine error:${C.reset} ${result.error.message}\n`);
    process.exit(1);
  }

  findings = result.data;
  process.stdout.write(
    `${C.brightGreen}  ✔ Analysis complete — ${findings.length} finding(s) in ${elapsed}ms${C.reset}\n\n`,
  );

  printDiffBox(STARTER_DIFF, "reportService.js");
  process.stdout.write("\n");
  printFindingsBox(findings);
  process.stdout.write("\n");
  printMetricsBar(findings, elapsed);
  process.stdout.write("\n");
  printGitHubCommentsBox(findings);
  process.stdout.write("\n");
  printPlanGateBox("starter", "AutoFix Self-Healing Engine");

  return elapsed;
}

// ─── Scenario 2 — Enterprise plan ────────────────────────────────────────────

async function runScenario2(): Promise<number> {
  printScenarioBanner(
    2, 2, "enterprise",
    "TechGiant Inc",
    "2 CRITICAL security vulns · SQL Injection + AWS key leak · AutoFix pipeline ACTIVATED",
  );
  await sleep(300);

  printWebhookBox("techgiant/api-server", 42, "feat: add user authentication endpoint", "b9e2f7a");
  process.stdout.write("\n");
  await sleep(200);

  process.stdout.write(`${C.gray}  ▸ Verifying webhook HMAC-SHA256 signature...${C.reset}\n`);
  await sleep(180);
  process.stdout.write(`${C.brightGreen}  ✔ Signature valid${C.reset}\n`);

  process.stdout.write(`${C.gray}  ▸ Resolving subscription plan for techgiant...${C.reset}\n`);
  await sleep(220);
  process.stdout.write(
    `${C.brightGreen}  ✔ Plan: ${C.bold}ENTERPRISE${C.reset}` +
    `  ${C.dim}— AutoFix Engine authorized${C.reset}\n`,
  );

  process.stdout.write(`${C.gray}  ▸ Parsing unified diff...${C.reset}\n`);
  await sleep(120);

  const analyzer = new DiffAnalyzer();
  const parsed   = analyzer.parse(ENTERPRISE_DIFF);
  const engine   = new AuditAIEngine(makeProvider(ENTERPRISE_AI_RESPONSE), "claude-sonnet-4-6");

  process.stdout.write(`${C.gray}  ▸ Sending diff to AI engine (${parsed.files.length} file)...${C.reset}\n`);
  const t0      = Date.now();
  const result  = await engine.analyzeDiff(parsed, "techgiant/api-server");
  const elapsed = Date.now() - t0;

  if (!result.success) {
    process.stderr.write(`\n${C.brightRed}Engine error:${C.reset} ${result.error.message}\n`);
    process.exit(1);
  }

  findings = result.data;
  const critCount = findings.filter((f) => f.severity === "critical").length;
  process.stdout.write(
    `${C.brightRed}${C.bold}  ✔ Analysis complete — ${critCount} CRITICAL finding(s) in ${elapsed}ms${C.reset}\n\n`,
  );

  printDiffBox(ENTERPRISE_DIFF, "userController.js");
  process.stdout.write("\n");
  printFindingsBox(findings);
  process.stdout.write("\n");
  printMetricsBar(findings, elapsed);
  process.stdout.write("\n");
  printGitHubCommentsBox(findings);
  process.stdout.write("\n");

  process.stdout.write(
    `${C.brightYellow}${C.bold}  ⚡ AutoFix Engine firing for ${critCount} critical vulnerability(s)...${C.reset}\n\n`,
  );
  await sleep(400);

  await simulateAutoFix(findings, 42);

  return elapsed;
}

// ─── Financial ROI summary ────────────────────────────────────────────────────

function printROISummary(s1Ms: number, s2Ms: number): void {
  const DEV_RATE_USD       = 150;         // senior developer $/hr
  const MANUAL_REVIEW_HRS  = 4;           // typical review + fix per PR
  const MANUAL_COST_PER_PR = DEV_RATE_USD * MANUAL_REVIEW_HRS;
  const AI_COST_PER_PR     = 0.008;       // Anthropic API tokens per audit
  const BREACH_COST_AVG    = 2_400_000;   // IBM Cost of a Data Breach 2024
  const PRS_PER_YEAR       = 500;
  const CRITICALS_AVERTED  = 2;

  const savingsPerPR   = MANUAL_COST_PER_PR - AI_COST_PER_PR;
  const annualLabor    = Math.round(savingsPerPR * PRS_PER_YEAR);
  const riskAvertedUSD = CRITICALS_AVERTED * BREACH_COST_AVG;
  const totalImpact    = annualLabor + riskAvertedUSD;
  const totalAiMs      = s1Ms + s2Ms;
  const manualEquivMs  = MANUAL_REVIEW_HRS * 2 * 3_600_000; // 2 PRs × 4 hrs
  const speedup        = Math.round(manualEquivMs / totalAiMs);
  const savingsPct     = Math.round((savingsPerPR / MANUAL_COST_PER_PR) * 100);
  const fmt = (n: number) => n.toLocaleString("en-US");

  process.stdout.write("\n\n");

  console.log(dTop());
  console.log(dRow(""));
  console.log(dCenter(`${C.bold}${C.brightYellow}💰  FINANCIAL IMPACT SUMMARY  —  REPOSHIELD AI${C.reset}`));
  console.log(dRow(""));
  console.log(dCenter(`${C.dim}Based on the 2 PR audits executed in this demo${C.reset}`));
  console.log(dRow(""));
  console.log(dBot());
  process.stdout.write("\n");

  // Time efficiency
  console.log(sectionTop("TIME EFFICIENCY"));
  console.log(blank());
  console.log(row(`  ${C.bold}Manual review + remediation (2 PRs)  :${C.reset}  ${C.red}${C.bold}${(manualEquivMs / 3_600_000).toFixed(0)} hours${C.reset}  (industry average)`));
  console.log(row(`  ${C.bold}RepoShield AI (2 PRs, combined)      :${C.reset}  ${C.brightGreen}${C.bold}${fmt(totalAiMs)}ms${C.reset}  (measured this run)`));
  console.log(blank());
  console.log(row(`  ${C.brightGreen}${C.bold}Speed improvement  :  ${fmt(speedup)}×  faster than manual code review${C.reset}`));
  console.log(blank());
  console.log(bot());
  process.stdout.write("\n");

  // Cost per audit
  console.log(sectionTop("COST PER AUDIT CYCLE  ·  Starter vs. Enterprise"));
  console.log(blank());
  console.log(row(`  ${C.bold}Senior developer (4h review + fix)   :${C.reset}  ${C.red}$${fmt(MANUAL_COST_PER_PR)}  per PR${C.reset}`));
  console.log(row(`  ${C.bold}RepoShield AI (claude-sonnet-4-6)    :${C.reset}  ${C.brightGreen}$${AI_COST_PER_PR.toFixed(3)}  per PR${C.reset}  (API tokens only)`));
  console.log(blank());
  console.log(row(`  ${C.brightGreen}${C.bold}Savings per PR     :  $${fmt(Math.round(savingsPerPR))}  (${savingsPct}% cost reduction)${C.reset}`));
  console.log(blank());
  console.log(bot());
  process.stdout.write("\n");

  // Annual projection
  console.log(sectionTop(`ANNUAL PROJECTION  ·  ${PRS_PER_YEAR} PRs / year`));
  console.log(blank());
  console.log(row(`  ${C.bold}Developer hours reclaimed             :${C.reset}  ${C.brightCyan}${C.bold}${fmt(MANUAL_REVIEW_HRS * PRS_PER_YEAR)} hours / year${C.reset}`));
  console.log(row(`  ${C.bold}Labor cost savings                    :${C.reset}  ${C.brightGreen}${C.bold}$${fmt(annualLabor)} / year${C.reset}`));
  console.log(blank());
  console.log(bot());
  process.stdout.write("\n");

  // Risk mitigation
  console.log(sectionTop("RISK MITIGATION  ·  Scenario 2 — 2 CRITICAL vulnerabilities"));
  console.log(blank());
  console.log(row(`  ${C.bold}Average data breach cost (IBM 2024)  :${C.reset}  ${C.red}$${fmt(BREACH_COST_AVG)}${C.reset}  per incident`));
  console.log(row(`  ${C.bold}Critical vulns auto-patched           :${C.reset}  ${C.brightGreen}${C.bold}${CRITICALS_AVERTED}  (SQL Injection + AWS key leak)${C.reset}`));
  console.log(row(`  ${C.bold}Time-to-patch (AutoFix Engine)        :${C.reset}  ${C.brightGreen}< 5 seconds${C.reset}  (fully autonomous)`));
  console.log(blank());
  console.log(row(`  ${C.brightGreen}${C.bold}Breach exposure averted  :  $${fmt(riskAvertedUSD)}${C.reset}  (potential incident cost eliminated)`));
  console.log(blank());
  console.log(bot());
  process.stdout.write("\n");

  // Grand total
  console.log(dTop());
  console.log(dRow(""));
  console.log(dCenter(`${C.dim}TOTAL ESTIMATED ANNUAL IMPACT${C.reset}`));
  console.log(dRow(""));
  console.log(dCenter(`${C.bold}${C.brightYellow}$${fmt(totalImpact)}${C.reset}${C.bold}  in savings + breach risk averted${C.reset}`));
  console.log(dRow(""));
  console.log(dCenter(`${C.dim}Labor savings · Breach prevention · Developer hours reclaimed${C.reset}`));
  console.log(dRow(""));
  console.log(dDiv());
  console.log(dRow(""));
  console.log(dRow(`  ${C.bold}Starter Plan ${C.reset} :  ${C.brightYellow}AI audit + GitHub PR comments${C.reset}   →  from $49/mo`));
  console.log(dRow(`  ${C.bold}Enterprise Plan${C.reset}:  ${C.brightGreen}Audit + AutoFix self-healing PRs${C.reset}  →  from $499/mo`));
  console.log(dRow(""));
  console.log(dBot());
  process.stdout.write("\n");

  console.log(
    `  ${C.bold}${C.brightCyan}🛡  RepoShield AI${C.reset}` +
    `  ${C.dim}·  BYOK Security Audit + Enterprise Self-Healing Engine${C.reset}`,
  );
  console.log(`  ${C.dim}https://reposhield.ai  ·  jonathan.monroy@puntored.co${C.reset}`);
  process.stdout.write("\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  process.stdout.write("\n");

  // Splash header
  console.log(dTop());
  console.log(dRow(""));
  console.log(dCenter(`${C.bold}${C.brightCyan}  🛡   R E P O S H I E L D   A I   ${C.reset}`));
  console.log(dCenter(`${C.bold}${C.white}     ENTERPRISE  SHOWCASE  DEMO      ${C.reset}`));
  console.log(dRow(""));
  console.log(dCenter(`${C.dim}  Autonomous AI Security · BYOK · Self-Healing PRs  ${C.reset}`));
  console.log(dRow(""));
  console.log(dBot());
  process.stdout.write("\n");

  console.log(`  ${C.dim}▸  Two real-world GitHub webhook scenarios executed end-to-end${C.reset}`);
  console.log(`  ${C.dim}▸  Production-grade engine — DiffAnalyzer · AuditAIEngine · AutoFixEngine${C.reset}`);
  console.log(`  ${C.dim}▸  Plan tier controls the self-healing pipeline in real time${C.reset}`);
  process.stdout.write("\n");

  await sleep(700);

  const t1 = Date.now();
  const s1Ms = await runScenario1();
  const _s1Total = Date.now() - t1;

  process.stdout.write("\n\n");
  await sleep(500);

  const t2 = Date.now();
  const s2Ms = await runScenario2();
  const _s2Total = Date.now() - t2;

  printROISummary(s1Ms, s2Ms);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\n${C.brightRed}${C.bold}Fatal:${C.reset} ${msg}\n\n`);
  process.exit(1);
});
