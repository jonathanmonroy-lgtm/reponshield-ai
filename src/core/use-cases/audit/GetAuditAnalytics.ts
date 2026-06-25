import type { IAuditRepository, AuditAnalytics } from "@/core/repositories/IAuditRepository";
import type { Result } from "@/lib/types";

export class GetAuditAnalyticsUseCase {
  constructor(private readonly auditRepo: IAuditRepository) {}

  async execute(
    orgId: string,
    days = 30
  ): Promise<Result<AuditAnalytics>> {
    return this.auditRepo.getAnalytics(orgId, days);
  }
}
