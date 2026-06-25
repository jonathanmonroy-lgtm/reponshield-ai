import { GITHUB_API_BASE, MAX_AI_RETRIES } from "@/lib/constants";
import type { AuditFinding } from "@/core/entities/PullRequestAudit";
import { ok, err } from "@/lib/types";
import type { Result } from "@/lib/types";
import type { IGitHubClient, PullRequestDiff } from "@/core/repositories/IGitHubClient";

interface GitHubInstallationTokenResponse {
  token: string;
  expires_at: string;
}

export class GitHubApiClient implements IGitHubClient {
  private tokenCache = new Map<
    string,
    { token: string; expiresAt: Date }
  >();

  constructor(
    private readonly githubAppId: string,
    private readonly githubPrivateKey: string
  ) {}

  async getInstallationToken(
    installationId: string
  ): Promise<Result<string>> {
    const cached = this.tokenCache.get(installationId);
    if (cached && cached.expiresAt > new Date(Date.now() + 60_000)) {
      return ok(cached.token);
    }

    let lastError: Error = new Error("Unknown error");
    for (let attempt = 0; attempt < MAX_AI_RETRIES; attempt++) {
      try {
        const jwt = await this.createJWT();
        const response = await fetch(
          `${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${jwt}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
          }
        );

        if (!response.ok) {
          const body = await response.text();
          throw new Error(
            `GitHub API error ${response.status}: ${body}`
          );
        }

        const data =
          (await response.json()) as GitHubInstallationTokenResponse;
        this.tokenCache.set(installationId, {
          token: data.token,
          expiresAt: new Date(data.expires_at),
        });
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
      const [prResponse, diffResponse] = await Promise.all([
        fetch(`${GITHUB_API_BASE}/repos/${repoFullName}/pulls/${prNumber}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }),
        fetch(`${GITHUB_API_BASE}/repos/${repoFullName}/pulls/${prNumber}`, {
          headers: {
            Authorization: `Bearer ${token}`,
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
      return err(
        error instanceof Error ? error : new Error(String(error))
      );
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
    const postableFindings = findings.filter(
      (f) => f.severity === "critical" || f.severity === "high" || f.severity === "medium"
    );

    for (const finding of postableFindings) {
      try {
        const body = this.buildCommentBody(finding);
        const response = await fetch(
          `${GITHUB_API_BASE}/repos/${repoFullName}/pulls/${prNumber}/comments`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
            body: JSON.stringify({
              body,
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

  private buildCommentBody(finding: AuditFinding): string {
    const severityEmoji: Record<string, string> = {
      critical: "🚨",
      high: "🔴",
      medium: "🟡",
      low: "🔵",
      info: "ℹ️",
    };

    const emoji = severityEmoji[finding.severity] ?? "⚠️";

    let body = `## ${emoji} RepoShield AI — ${finding.title}\n\n`;
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
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = { iat: now - 60, exp: now + 600, iss: this.githubAppId };

    const encode = (obj: object) =>
      Buffer.from(JSON.stringify(obj)).toString("base64url");

    const headerB64 = encode(header);
    const payloadB64 = encode(payload);
    const unsigned = `${headerB64}.${payloadB64}`;

    const { createSign } = await import("crypto");
    const sign = createSign("RSA-SHA256");
    sign.update(unsigned);
    const signature = sign.sign(this.githubPrivateKey, "base64url");

    return `${unsigned}.${signature}`;
  }
}
