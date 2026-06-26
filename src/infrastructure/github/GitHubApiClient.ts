import { GITHUB_API_BASE, MAX_AI_RETRIES } from "@/lib/constants";
import type { AuditFinding } from "@/core/entities/PullRequestAudit";
import { ok, err } from "@/lib/types";
import type { Result } from "@/lib/types";
import type {
  IGitHubClient,
  PullRequestDiff,
  FileContent,
  CommitResult,
} from "@/core/repositories/IGitHubClient";
import { installationTokenCache } from "@/infrastructure/github/InstallationTokenCache";

interface GitHubInstallationTokenResponse {
  token: string;
  expires_at: string;
}

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
} as const;

export class GitHubApiClient implements IGitHubClient {
  constructor(
    private readonly githubAppId: string,
    private readonly githubPrivateKey: string
  ) {}

  async getInstallationToken(
    installationId: string
  ): Promise<Result<string>> {
    const cached = installationTokenCache.get(installationId);
    if (cached) {
      return ok(cached);
    }

    let lastError: Error = new Error("Unknown error");
    for (let attempt = 0; attempt < MAX_AI_RETRIES; attempt++) {
      try {
        const jwt = await this.createJWT();
        const response = await fetch(
          `${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${jwt}`, ...GH_HEADERS },
          }
        );
        if (!response.ok) {
          throw new Error(
            `GitHub API error ${response.status}: ${await response.text()}`
          );
        }
        const data =
          (await response.json()) as GitHubInstallationTokenResponse;
        installationTokenCache.set(
          installationId,
          data.token,
          new Date(data.expires_at)
        );
        return ok(data.token);
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_AI_RETRIES - 1) {
          await new Promise((r) =>
            setTimeout(r, 1000 * Math.pow(2, attempt))
          );
        }
      }
    }
    return err(lastError);
  }

  async getPullRequestDiff(
    repoFullName: string,
    prNumber: number,
    token: string
  ): Promise<Result<PullRequestDiff>> {
    try {
      const auth = `Bearer ${token}`;
      const [prResponse, diffResponse] = await Promise.all([
        fetch(`${GITHUB_API_BASE}/repos/${repoFullName}/pulls/${prNumber}`, {
          headers: { Authorization: auth, ...GH_HEADERS },
        }),
        fetch(`${GITHUB_API_BASE}/repos/${repoFullName}/pulls/${prNumber}`, {
          headers: {
            Authorization: auth,
            Accept: "application/vnd.github.diff",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }),
      ]);

      if (!prResponse.ok || !diffResponse.ok) {
        throw new Error(
          `GitHub API error: PR=${prResponse.status}, diff=${diffResponse.status}`
        );
      }

      const prData = (await prResponse.json()) as {
        title: string;
        user: { login: string };
        head: { sha: string };
        base: { sha: string };
      };
      const rawDiff = await diffResponse.text();

      return ok({
        rawDiff,
        prTitle: prData.title,
        prAuthor: prData.user.login,
        headSha: prData.head.sha,
        baseSha: prData.base.sha,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async postReviewComments(
    repoFullName: string,
    prNumber: number,
    headSha: string,
    findings: AuditFinding[],
    token: string
  ): Promise<Result<number[]>> {
    const commentIds: number[] = [];
    const postable = findings.filter(
      (f) =>
        f.severity === "critical" ||
        f.severity === "high" ||
        f.severity === "medium"
    );

    for (const finding of postable) {
      try {
        const response = await fetch(
          `${GITHUB_API_BASE}/repos/${repoFullName}/pulls/${prNumber}/comments`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              ...GH_HEADERS,
            },
            body: JSON.stringify({
              body: this.buildCommentBody(finding),
              commit_id: headSha,
              path: finding.filePath,
              line: finding.lineEnd,
              side: "RIGHT",
            }),
          }
        );
        if (response.ok) {
          const data = (await response.json()) as { id: number };
          commentIds.push(data.id);
        }
      } catch {
        // Partial failure — continue posting remaining comments
      }
    }

    return ok(commentIds);
  }

  async getFileContent(
    repoFullName: string,
    filePath: string,
    ref: string,
    token: string
  ): Promise<Result<FileContent>> {
    try {
      const safePath = filePath.split("/").map(encodeURIComponent).join("/");
      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${repoFullName}/contents/${safePath}?ref=${encodeURIComponent(ref)}`,
        {
          headers: { Authorization: `Bearer ${token}`, ...GH_HEADERS },
        }
      );
      if (!response.ok) {
        return err(
          new Error(
            `GitHub contents API error ${response.status}: ${await response.text()}`
          )
        );
      }
      const data = (await response.json()) as {
        content: string;
        sha: string;
        encoding: string;
      };
      const decoded = Buffer.from(
        data.content.replace(/\n/g, ""),
        "base64"
      ).toString("utf-8");
      return ok({ content: decoded, sha: data.sha });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async createBranch(
    repoFullName: string,
    branchName: string,
    fromSha: string,
    token: string
  ): Promise<Result<void>> {
    try {
      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${repoFullName}/git/refs`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...GH_HEADERS,
          },
          body: JSON.stringify({
            ref: `refs/heads/${branchName}`,
            sha: fromSha,
          }),
        }
      );
      if (!response.ok) {
        return err(
          new Error(
            `Failed to create branch "${branchName}": ${response.status} ${await response.text()}`
          )
        );
      }
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async createOrUpdateFile(
    repoFullName: string,
    filePath: string,
    content: string,
    commitMessage: string,
    branchName: string,
    currentFileSha: string | null,
    token: string
  ): Promise<Result<CommitResult>> {
    try {
      const safePath = filePath.split("/").map(encodeURIComponent).join("/");
      const payload: Record<string, unknown> = {
        message: commitMessage,
        content: Buffer.from(content, "utf-8").toString("base64"),
        branch: branchName,
      };
      if (currentFileSha) payload.sha = currentFileSha;

      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${repoFullName}/contents/${safePath}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...GH_HEADERS,
          },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        return err(
          new Error(
            `Failed to write file "${filePath}": ${response.status} ${await response.text()}`
          )
        );
      }
      const data = (await response.json()) as { commit: { sha: string } };
      return ok({ commitSha: data.commit.sha });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async createPullRequest(
    repoFullName: string,
    title: string,
    body: string,
    headBranch: string,
    baseBranch: string,
    token: string
  ): Promise<Result<number>> {
    try {
      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${repoFullName}/pulls`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...GH_HEADERS,
          },
          body: JSON.stringify({
            title,
            body,
            head: headBranch,
            base: baseBranch,
          }),
        }
      );
      if (!response.ok) {
        return err(
          new Error(
            `Failed to create pull request: ${response.status} ${await response.text()}`
          )
        );
      }
      const data = (await response.json()) as { number: number };
      return ok(data.number);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private buildCommentBody(finding: AuditFinding): string {
    const emoji: Record<string, string> = {
      critical: "🚨",
      high: "🔴",
      medium: "🟡",
      low: "🔵",
      info: "ℹ️",
    };
    let body = `## ${emoji[finding.severity] ?? "⚠️"} RepoShield AI — ${finding.title}\n\n`;
    body += `**Severity:** \`${finding.severity.toUpperCase()}\` | **Category:** \`${finding.category}\`\n\n`;
    body += `${finding.description}\n\n`;
    body += `### Suggested Fix\n${finding.suggestion}\n`;
    if (finding.owaspReference) {
      body += `\n> **OWASP Reference:** ${finding.owaspReference}\n`;
    }
    if (finding.debtMinutes > 0) {
      body += `\n> **Technical Debt:** ~${finding.debtMinutes} minutes to resolve\n`;
    }
    body += `\n---\n*Powered by [RepoShield AI](https://reposhield.ai)*`;
    return body;
  }

  private async createJWT(): Promise<string> {
    return createGitHubAppJWT(this.githubAppId, this.githubPrivateKey);
  }
}

export async function createGitHubAppJWT(
  appId: string,
  privateKey: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iat: now - 60, exp: now + 600, iss: appId };
  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const unsigned = `${headerB64}.${payloadB64}`;
  const { createSign } = await import("crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const signature = sign.sign(privateKey, "base64url");
  return `${unsigned}.${signature}`;
}
