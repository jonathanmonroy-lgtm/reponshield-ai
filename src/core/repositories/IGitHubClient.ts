import type { Result } from "@/lib/types";
import type { AuditFinding } from "@/core/entities/PullRequestAudit";

export interface PullRequestDiff {
  rawDiff: string;
  prTitle: string;
  prAuthor: string;
  headSha: string;
  baseSha: string;
}

export interface FileContent {
  content: string;
  sha: string;
}

export interface CommitResult {
  commitSha: string;
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

  getFileContent(
    repoFullName: string,
    filePath: string,
    ref: string,
    token: string
  ): Promise<Result<FileContent>>;

  createBranch(
    repoFullName: string,
    branchName: string,
    fromSha: string,
    token: string
  ): Promise<Result<void>>;

  createOrUpdateFile(
    repoFullName: string,
    filePath: string,
    content: string,
    commitMessage: string,
    branchName: string,
    currentFileSha: string | null,
    token: string
  ): Promise<Result<CommitResult>>;

  createPullRequest(
    repoFullName: string,
    title: string,
    body: string,
    headBranch: string,
    baseBranch: string,
    token: string
  ): Promise<Result<number>>;
}
