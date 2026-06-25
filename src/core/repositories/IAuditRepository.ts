import type {
  PullRequestAudit,
  CreateAuditInput,
} from "@/core/entities/PullRequestAudit";
import type { Result } from "@/lib/types";

export interface AuditAnalytics {
  totalAudits: number;
  totalFindingsBySeverity: Record<string, number>;
  totalDebtMinutes: number;
  avgSecurityScore: number;
  avgMaintainabilityScore: number;
  auditsByDay: Array<{ date: string; count: number }>;
}

export interface IAuditRepository {
  findById(id: string): Promise<Result<PullRequestAudit | null>>;
  findByRepositoryId(
    repoId: string,
    limit?: number,
    offset?: number
  ): Promise<Result<PullRequestAudit[]>>;
  findByOrganizationId(
    orgId: string,
    limit?: number
  ): Promise<Result<PullRequestAudit[]>>;
  create(input: CreateAuditInput): Promise<Result<PullRequestAudit>>;
  getAnalytics(orgId: string, days?: number): Promise<Result<AuditAnalytics>>;
}
