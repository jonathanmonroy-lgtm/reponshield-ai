import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { VulnerabilityChart } from "@/components/dashboard/VulnerabilityChart";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Clock, Shield, TrendingDown } from "lucide-react";
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
  auditsByDay: Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return {
      date: d.toISOString().split("T")[0]!,
      count: Math.max(0, Math.floor(Math.random() * 5)),
    };
  }),
};

const TOP_DEBT_REPOS = [
  { name: "acme-corp/backend-api", debtMinutes: 640, score: 71 },
  { name: "acme-corp/frontend-app", debtMinutes: 380, score: 83 },
  { name: "acme-corp/legacy-monolith", debtMinutes: 220, score: 55 },
];

export default function AnalyticsPage() {
  const totalFindings = Object.values(
    DEMO_ANALYTICS.totalFindingsBySeverity
  ).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Security posture and technical debt across all repositories.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Security Score"
          value={`${DEMO_ANALYTICS.avgSecurityScore}/100`}
          icon={<Shield className="h-5 w-5" />}
          variant={DEMO_ANALYTICS.avgSecurityScore >= 80 ? "success" : "warning"}
        />
        <StatsCard
          title="Maintainability"
          value={`${DEMO_ANALYTICS.avgMaintainabilityScore}/100`}
          icon={<BarChart3 className="h-5 w-5" />}
          variant="default"
        />
        <StatsCard
          title="Debt Detected"
          value={`${Math.round(DEMO_ANALYTICS.totalDebtMinutes / 60)}h`}
          subtitle={`${DEMO_ANALYTICS.totalDebtMinutes} minutes total`}
          icon={<Clock className="h-5 w-5" />}
          variant="warning"
        />
        <StatsCard
          title="Total Findings"
          value={totalFindings}
          subtitle={`${DEMO_ANALYTICS.totalFindingsBySeverity.critical ?? 0} critical`}
          icon={<TrendingDown className="h-5 w-5" />}
          variant={
            (DEMO_ANALYTICS.totalFindingsBySeverity.critical ?? 0) > 0
              ? "danger"
              : "success"
          }
        />
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>Repositories by Technical Debt</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col divide-y divide-gray-100">
            {TOP_DEBT_REPOS.map((repo) => (
              <div
                key={repo.name}
                className="flex items-center justify-between py-4"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-gray-900">
                    {repo.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {repo.debtMinutes} minutes of detected debt
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-32 overflow-hidden rounded-full bg-gray-100 h-2">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{
                        width: `${Math.min(
                          100,
                          (repo.debtMinutes / 800) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <Badge
                    variant={
                      repo.score >= 80
                        ? "success"
                        : repo.score >= 60
                        ? "warning"
                        : "danger"
                    }
                  >
                    Score: {repo.score}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
