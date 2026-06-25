import {
  BarChart3,
  Clock,
  GitPullRequest,
  Shield,
} from "lucide-react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { AuditTable } from "@/components/dashboard/AuditTable";
import { VulnerabilityChart } from "@/components/dashboard/VulnerabilityChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PullRequestAudit } from "@/core/entities/PullRequestAudit";
import type { AuditAnalytics } from "@/core/repositories/IAuditRepository";

const DEMO_ANALYTICS: AuditAnalytics = {
  totalAudits: 47,
  totalFindingsBySeverity: {
    critical: 3,
    high: 12,
    medium: 28,
    low: 41,
    info: 15,
  },
  totalDebtMinutes: 1240,
  avgSecurityScore: 78,
  avgMaintainabilityScore: 82,
  auditsByDay: Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return {
      date: d.toISOString().split("T")[0]!,
      count: Math.floor(Math.random() * 6) + 1,
    };
  }),
};

const DEMO_AUDITS: PullRequestAudit[] = [
  {
    id: "1",
    repositoryId: "repo-1",
    prNumber: 142,
    prTitle: "feat: add user authentication with JWT",
    prAuthor: "alice-dev",
    headSha: "abc1234",
    baseSha: "def5678",
    findings: [
      {
        id: "f1",
        filePath: "src/auth/jwt.ts",
        lineStart: 23,
        lineEnd: 23,
        category: "security",
        severity: "critical",
        title: "JWT secret hardcoded in source",
        description: "JWT signing secret is hardcoded as a string literal.",
        suggestion: "Move to environment variable and add to .env.example.",
        owaspReference: "A02:2021 - Cryptographic Failures",
        debtMinutes: 15,
      },
      {
        id: "f2",
        filePath: "src/auth/middleware.ts",
        lineStart: 45,
        lineEnd: 47,
        category: "technical_debt",
        severity: "medium",
        title: "Missing error handling",
        description: "Token verification callback does not handle errors.",
        suggestion: "Wrap in try-catch and return 401 on failure.",
        owaspReference: null,
        debtMinutes: 10,
      },
    ],
    totalDebtMinutes: 25,
    securityScore: 62,
    maintainabilityScore: 85,
    githubCommentIds: [1001, 1002],
    aiProvider: "anthropic",
    aiModel: "claude-sonnet-4-6",
    processingMs: 4230,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: "2",
    repositoryId: "repo-1",
    prNumber: 141,
    prTitle: "refactor: migrate payment service to TypeScript",
    prAuthor: "bob-eng",
    headSha: "ghi9012",
    baseSha: "jkl3456",
    findings: [
      {
        id: "f3",
        filePath: "src/payments/stripe.ts",
        lineStart: 88,
        lineEnd: 92,
        category: "security",
        severity: "high",
        title: "SQL injection risk via string concatenation",
        description: "User input concatenated directly into a query string.",
        suggestion: "Use parameterized queries or an ORM.",
        owaspReference: "A03:2021 - Injection",
        debtMinutes: 30,
      },
    ],
    totalDebtMinutes: 30,
    securityScore: 71,
    maintainabilityScore: 90,
    githubCommentIds: [1003],
    aiProvider: "openai",
    aiModel: "gpt-4o-mini",
    processingMs: 3870,
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
  },
];

export default function DashboardOverviewPage() {
  const debtHours = Math.round(DEMO_ANALYTICS.totalDebtMinutes / 60);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">
          Last 30 days of audit activity across all repositories.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Total Audits"
          value={DEMO_ANALYTICS.totalAudits}
          icon={<GitPullRequest className="h-5 w-5" />}
          trend={{ value: 18, label: "vs last month" }}
        />
        <StatsCard
          title="Avg Security Score"
          value={`${DEMO_ANALYTICS.avgSecurityScore}/100`}
          icon={<Shield className="h-5 w-5" />}
          variant={
            DEMO_ANALYTICS.avgSecurityScore >= 80
              ? "success"
              : DEMO_ANALYTICS.avgSecurityScore >= 60
              ? "warning"
              : "danger"
          }
        />
        <StatsCard
          title="Technical Debt Saved"
          value={`${debtHours}h`}
          subtitle="Total minutes detected"
          icon={<Clock className="h-5 w-5" />}
          variant="warning"
        />
        <StatsCard
          title="Critical Findings"
          value={DEMO_ANALYTICS.totalFindingsBySeverity.critical ?? 0}
          subtitle="Needs immediate attention"
          icon={<BarChart3 className="h-5 w-5" />}
          variant={
            (DEMO_ANALYTICS.totalFindingsBySeverity.critical ?? 0) > 0
              ? "danger"
              : "success"
          }
        />
      </div>

      {/* Charts */}
      <VulnerabilityChart
        auditsByDay={DEMO_ANALYTICS.auditsByDay}
        findingsBySeverity={{
          critical: DEMO_ANALYTICS.totalFindingsBySeverity.critical ?? 0,
          high: DEMO_ANALYTICS.totalFindingsBySeverity.high ?? 0,
          medium: DEMO_ANALYTICS.totalFindingsBySeverity.medium ?? 0,
          low: DEMO_ANALYTICS.totalFindingsBySeverity.low ?? 0,
          info: DEMO_ANALYTICS.totalFindingsBySeverity.info ?? 0,
        }}
      />

      {/* Recent Audits */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Audits</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditTable audits={DEMO_AUDITS} />
        </CardContent>
      </Card>
    </div>
  );
}
