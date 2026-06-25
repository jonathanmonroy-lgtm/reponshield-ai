import type { IAIProvider } from "@/infrastructure/ai/IAIProvider";
import type { IAuditAIEngine, ParsedDiff } from "@/core/use-cases/audit/ProcessPullRequestAudit";
import type { AuditFinding } from "@/core/entities/PullRequestAudit";
import { buildAuditMessages, parseAuditResponse } from "@/services/audit/AuditPromptBuilder";
import { ok, err } from "@/lib/types";
import type { Result } from "@/lib/types";

export class AuditAIEngine implements IAuditAIEngine {
  constructor(
    private readonly provider: IAIProvider,
    private readonly model: string
  ) {}

  async analyzeDiff(
    diff: ParsedDiff,
    repoFullName: string
  ): Promise<Result<Omit<AuditFinding, "id">[]>> {
    try {
      const messages = buildAuditMessages(diff, repoFullName);
      const result = await this.provider.complete({
        model: this.model,
        messages,
        maxTokens: 4096,
        temperature: 0.1,
        responseFormat: "json_object",
      });

      const findings = parseAuditResponse(result.content);
      return ok(findings);
    } catch (error) {
      return err(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}
