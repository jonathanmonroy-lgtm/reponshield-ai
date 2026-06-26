export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

export interface RulesProfile {
  source: "custom" | "default";
  rulesMarkdown: string;
}

export type AIProvider = "openai" | "anthropic";

export type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";

export type MigrationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type AuditCategory =
  | "technical_debt"
  | "security"
  | "compliance"
  | "performance"
  | "maintainability";
