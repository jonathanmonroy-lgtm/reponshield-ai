"use client";

import type { PullRequestAudit } from "@/core/entities/PullRequestAudit";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";
import { GitPullRequest, Clock, Shield } from "lucide-react";

interface AuditTableProps {
  audits: PullRequestAudit[];
  onRowClick?: (audit: PullRequestAudit) => void;
}

function scoreColor(score: number): string {
  if (score >= 85) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

export function AuditTable({ audits, onRowClick }: AuditTableProps) {
  if (audits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16">
        <GitPullRequest className="h-12 w-12 text-gray-300" />
        <p className="mt-4 text-base font-medium text-gray-500">
          No audits yet
        </p>
        <p className="mt-1 text-sm text-gray-400">
          Open a Pull Request in a connected repository to trigger an audit.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Pull Request
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Findings
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Security
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Debt
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              AI Model
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              When
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {audits.map((audit) => {
            const criticalCount = audit.findings.filter(
              (f) => f.severity === "critical"
            ).length;
            const highCount = audit.findings.filter(
              (f) => f.severity === "high"
            ).length;

            return (
              <tr
                key={audit.id}
                onClick={() => onRowClick?.(audit)}
                className="cursor-pointer transition-colors hover:bg-gray-50"
              >
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-gray-900 line-clamp-1">
                      {audit.prTitle}
                    </span>
                    <span className="text-xs text-gray-500">
                      #{audit.prNumber} by {audit.prAuthor}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {criticalCount > 0 && (
                      <Badge variant="critical">{criticalCount} critical</Badge>
                    )}
                    {highCount > 0 && (
                      <Badge variant="high">{highCount} high</Badge>
                    )}
                    {criticalCount === 0 && highCount === 0 && (
                      <Badge variant="success">{audit.findings.length} findings</Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-gray-400" />
                    <span
                      className={`font-semibold ${scoreColor(audit.securityScore)}`}
                    >
                      {audit.securityScore}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span>
                      {audit.totalDebtMinutes >= 60
                        ? `${Math.round(audit.totalDebtMinutes / 60)}h`
                        : `${audit.totalDebtMinutes}m`}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-600">
                    {audit.aiModel}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {formatRelativeTime(audit.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
