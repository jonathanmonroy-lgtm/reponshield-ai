import type { IGitHubClient } from "@/core/repositories/IGitHubClient";
import type { RulesProfile } from "@/lib/types";

const RULES_FILE_PATH = ".reposhield/rules.md";

const DEFAULT_RULES_MARKDOWN = `# RepoShield Default Coding Standards

## Security
- Never hardcode secrets, API keys, passwords, or tokens in source code.
- Always use parameterized queries or prepared statements for database operations.
- Sanitize and validate all user input before processing or rendering.
- Use HTTPS for all external communications.

## Dependencies
- Keep third-party dependencies up-to-date and audited for known vulnerabilities.
- Avoid importing libraries that are unmaintained or have known CVEs.

## Code Quality
- Functions must have a single responsibility and remain under 50 lines.
- Avoid deep nesting beyond 3 levels and cyclomatic complexity above 10.
- Remove all dead code, commented-out blocks, and debug statements before merging.

## Data Handling
- Never log sensitive user data, credentials, or PII.
- Encrypt sensitive data at rest and in transit.`;

export class ContextEngine {
  constructor(private readonly githubClient: IGitHubClient) {}

  async fetchRulesProfile(
    repoFullName: string,
    ref: string,
    token: string
  ): Promise<RulesProfile> {
    const result = await this.githubClient.getFileContent(
      repoFullName,
      RULES_FILE_PATH,
      ref,
      token
    );

    if (result.success) {
      return { source: "custom", rulesMarkdown: result.data.content };
    }

    return { source: "default", rulesMarkdown: DEFAULT_RULES_MARKDOWN };
  }
}
