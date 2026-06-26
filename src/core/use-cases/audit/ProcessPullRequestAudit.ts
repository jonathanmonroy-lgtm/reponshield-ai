import type { IAuditRepository } from "@/core/repositories/IAuditRepository";
import type { IRepositoryRepository } from "@/core/repositories/IRepositoryRepository";
import {
  computeSecurityScore,
  computeMaintainabilityScore,
  computeTotalDebt,
  type AuditFinding,
  type PullRequestAudit,
} from "@/core/entities/PullRequestAudit";
import { err } from "@/lib/types";
import type { Result, RulesProfile } from "@/lib/types";
import { randomUUID } from "crypto";

export interface ParsedDiff {
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
    chunks: Array<{
      oldStart: number;
      newStart: number;
      lines: Array<{ type: "add" | "del" | "ctx"; content: string; newLine: number | null }>;
    }>;
  }>;
}

export interface IAuditAIEngine {
  analyzeDiff(
    diff: ParsedDiff,
    repoFullName: string,
    rulesProfile?: RulesProfile
  ): Promise<Result<Omit<AuditFinding, "id">[]>>;
}

export interface IGitHubCommentPoster {
  postReviewComments(
    repoFullName: string,
    prNumber: number,
    headSha: string,
    findings: AuditFinding[],
    installationId: string
  ): Promise<Result<number[]>>;
}

export interface ProcessAuditInput {
  repositoryId: string;
  githubRepoFullName: string;
  prNumber: number;
  prTitle: string;
  prAuthor: string;
  headSha: string;
  baseSha: string;
  rawDiff: string;
  githubInstallationId: string;
  aiProvider: string;
  aiModel: string;
}

export interface IDiffParser {
  parse(rawDiff: string): ParsedDiff;
}

export class ProcessPullRequestAuditUseCase {
  constructor(
    private readonly auditRepo: IAuditRepository,
    private readonly repoRepo: IRepositoryRepository,
    private readonly aiEngine: IAuditAIEngine,
    private readonly commentPoster: IGitHubCommentPoster,
    private readonly diffParser: IDiffParser
  ) {}

  async execute(
    input: ProcessAuditInput
  ): Promise<Result<PullRequestAudit>> {
    const startTime = Date.now();

    const repoResult = await this.repoRepo.findById(input.repositoryId);
    if (!repoResult.success) return repoResult;
    if (!repoResult.data) {
      return err(new Error(`Repository ${input.repositoryId} not found`));
    }
    if (!repoResult.data.auditEnabled) {
      return err(new Error("Audit is disabled for this repository"));
    }

    const parsedDiff = this.diffParser.parse(input.rawDiff);
    if (parsedDiff.files.length === 0) {
      return err(new Error("No changed files found in diff"));
    }

    const findingsResult = await this.aiEngine.analyzeDiff(
      parsedDiff,
      input.githubRepoFullName
    );
    if (!findingsResult.success) return findingsResult;

    const findings: AuditFinding[] = findingsResult.data.map((f) => ({
      ...f,
      id: randomUUID(),
    }));

    await this.commentPoster.postReviewComments(
      input.githubRepoFullName,
      input.prNumber,
      input.headSha,
      findings,
      input.githubInstallationId
    );

    const processingMs = Date.now() - startTime;

    const findingsWithoutId = findings.map(
      ({ id: _id, ...f }) => f as Omit<AuditFinding, "id">
    );

    return this.auditRepo.create({
      repositoryId: input.repositoryId,
      prNumber: input.prNumber,
      prTitle: input.prTitle,
      prAuthor: input.prAuthor,
      headSha: input.headSha,
      baseSha: input.baseSha,
      findings: findingsWithoutId,
      aiProvider: input.aiProvider,
      aiModel: input.aiModel,
      processingMs,
    });
  }
}

export { computeSecurityScore, computeMaintainabilityScore, computeTotalDebt };
