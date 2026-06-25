import type { Result } from "@/lib/types";
import type { AuditFinding } from "@/core/entities/PullRequestAudit";

export interface PullRequestDiff {
  rawDiff: string;
  prTitle: string;
  prAuthor: string;
  headSha: string;
  baseSha: string;
}

export interface IGitHubClient {
  getInstallationToken(installationId: string): Promise<Result<string>>;

  getPullRequestDiff(
    repoFullName: string,
    prNumber: number,
    token: string
  ): Promise<Result<PullRequestDiff>>;

  postReviewComments(
    repoFullName: string,
    prNumber: number,
    headSha: string,
    findings: AuditFinding[],
    token: string
  ): Promise<Result<number[]>>;
}
