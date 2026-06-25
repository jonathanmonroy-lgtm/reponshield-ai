import type { SupabaseServiceClient } from "@/infrastructure/database/supabase/client";
import type {
  IAuditRepository,
  AuditAnalytics,
} from "@/core/repositories/IAuditRepository";
import type {
  PullRequestAudit,
  AuditFinding,
  CreateAuditInput,
} from "@/core/entities/PullRequestAudit";
import {
  computeSecurityScore,
  computeMaintainabilityScore,
  computeTotalDebt,
} from "@/core/entities/PullRequestAudit";
import { ok, err } from "@/lib/types";
import type { Result } from "@/lib/types";
import { randomUUID } from "crypto";
import type { Database } from "@/infrastructure/database/supabase/database.types";

type Row = Database["public"]["Tables"]["pull_request_audits"]["Row"];

function toEntity(row: Row): PullRequestAudit {
  const findings = (row.findings as AuditFinding[]) ?? [];
  return {
    id: row.id,
    repositoryId: row.repository_id,
    prNumber: row.pr_number,
    prTitle: row.pr_title,
    prAuthor: row.pr_author,
    headSha: row.head_sha,
    baseSha: row.base_sha,
    findings,
    totalDebtMinutes: row.total_debt_minutes,
    securityScore: row.security_score,
    maintainabilityScore: row.maintainability_score,
    githubCommentIds: row.github_comment_ids ?? [],
    aiProvider: row.ai_provider,
    aiModel: row.ai_model,
    processingMs: row.processing_ms,
    createdAt: new Date(row.created_at),
  };
}

export class SupabaseAuditRepository implements IAuditRepository {
  constructor(private readonly db: SupabaseServiceClient) {}

  async findById(id: string): Promise<Result<PullRequestAudit | null>> {
    const { data, error } = await this.db
      .from("pull_request_audits")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return err(new Error(error.message));
    return ok(data ? toEntity(data) : null);
  }

  async findByRepositoryId(
    repoId: string,
    limit = 20,
    offset = 0
  ): Promise<Result<PullRequestAudit[]>> {
    const { data, error } = await this.db
      .from("pull_request_audits")
      .select("*")
      .eq("repository_id", repoId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return err(new Error(error.message));
    return ok((data ?? []).map(toEntity));
  }

  async findByOrganizationId(
    orgId: string,
    limit = 50
  ): Promise<Result<PullRequestAudit[]>> {
    const { data: reposData, error: reposError } = await this.db
      .from("repositories")
      .select("id")
      .eq("organization_id", orgId);
    if (reposError) return err(new Error(reposError.message));

    const repoIds = (reposData ?? []).map((r) => r.id);
    if (repoIds.length === 0) return ok([]);

    const { data, error } = await this.db
      .from("pull_request_audits")
      .select("*")
      .in("repository_id", repoIds)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return err(new Error(error.message));
    return ok((data ?? []).map(toEntity));
  }

  async create(input: CreateAuditInput): Promise<Result<PullRequestAudit>> {
    const findings: AuditFinding[] = input.findings.map((f) => ({
      ...f,
      id: randomUUID(),
    }));

    const totalDebtMinutes = computeTotalDebt(findings);
    const securityScore = computeSecurityScore(findings);
    const maintainabilityScore = computeMaintainabilityScore(findings);

    const insertData: Database["public"]["Tables"]["pull_request_audits"]["Insert"] =
      {
        repository_id: input.repositoryId,
        pr_number: input.prNumber,
        pr_title: input.prTitle,
        pr_author: input.prAuthor,
        head_sha: input.headSha,
        base_sha: input.baseSha,
        findings: findings as unknown,
        total_debt_minutes: totalDebtMinutes,
        security_score: securityScore,
        maintainability_score: maintainabilityScore,
        github_comment_ids: [],
        ai_provider: input.aiProvider,
        ai_model: input.aiModel,
        processing_ms: input.processingMs,
      };

    const { data, error } = await this.db
      .from("pull_request_audits")
      .insert(insertData)
      .select()
      .single();

    if (error) return err(new Error(error.message));
    return ok(toEntity(data));
  }

  async getAnalytics(
    orgId: string,
    days = 30
  ): Promise<Result<AuditAnalytics>> {
    const since = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: reposData, error: reposError } = await this.db
      .from("repositories")
      .select("id")
      .eq("organization_id", orgId);
    if (reposError) return err(new Error(reposError.message));

    const repoIds = (reposData ?? []).map((r) => r.id);
    if (repoIds.length === 0) {
      return ok({
        totalAudits: 0,
        totalFindingsBySeverity: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
        },
        totalDebtMinutes: 0,
        avgSecurityScore: 100,
        avgMaintainabilityScore: 100,
        auditsByDay: [],
      });
    }

    const { data, error } = await this.db
      .from("pull_request_audits")
      .select("*")
      .in("repository_id", repoIds)
      .gte("created_at", since);

    if (error) return err(new Error(error.message));

    const audits = (data ?? []).map(toEntity);

    const totalFindingsBySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    let totalDebtMinutes = 0;
    let totalSecurityScore = 0;
    let totalMaintainabilityScore = 0;
    const countByDay: Record<string, number> = {};

    for (const audit of audits) {
      for (const finding of audit.findings) {
        totalFindingsBySeverity[finding.severity] =
          (totalFindingsBySeverity[finding.severity] ?? 0) + 1;
      }
      totalDebtMinutes += audit.totalDebtMinutes;
      totalSecurityScore += audit.securityScore;
      totalMaintainabilityScore += audit.maintainabilityScore;

      const day = audit.createdAt.toISOString().split("T")[0]!;
      countByDay[day] = (countByDay[day] ?? 0) + 1;
    }

    const count = audits.length;

    return ok({
      totalAudits: count,
      totalFindingsBySeverity,
      totalDebtMinutes,
      avgSecurityScore:
        count > 0 ? Math.round(totalSecurityScore / count) : 100,
      avgMaintainabilityScore:
        count > 0 ? Math.round(totalMaintainabilityScore / count) : 100,
      auditsByDay: Object.entries(countByDay)
        .map(([date, cnt]) => ({ date, count: cnt }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
  }
}
