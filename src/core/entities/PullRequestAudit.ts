import type { SeverityLevel, AuditCategory } from "@/lib/types";

export interface AuditFinding {
  id: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  category: AuditCategory;
  severity: SeverityLevel;
  title: string;
  description: string;
  suggestion: string;
  owaspReference: string | null;
  debtMinutes: number;
}

export interface PullRequestAudit {
  id: string;
  repositoryId: string;
  prNumber: number;
  prTitle: string;
  prAuthor: string;
  headSha: string;
  baseSha: string;
  findings: AuditFinding[];
  totalDebtMinutes: number;
  securityScore: number;
  maintainabilityScore: number;
  githubCommentIds: number[];
  aiProvider: string;
  aiModel: string;
  processingMs: number;
  createdAt: Date;
}

export interface CreateAuditInput {
  repositoryId: string;
  prNumber: number;
  prTitle: string;
  prAuthor: string;
  headSha: string;
  baseSha: string;
  findings: Omit<AuditFinding, "id">[];
  aiProvider: string;
  aiModel: string;
  processingMs: number;
}

export function computeSecurityScore(findings: AuditFinding[]): number {
  const securityFindings = findings.filter(
    (f) => f.category === "security"
  );
  if (securityFindings.length === 0) return 100;

  const penalty = securityFindings.reduce((acc, f) => {
    const weights: Record<SeverityLevel, number> = {
      critical: 25,
      high: 15,
      medium: 8,
      low: 3,
      info: 0,
    };
    return acc + (weights[f.severity] ?? 0);
  }, 0);

  return Math.max(0, 100 - penalty);
}

export function computeMaintainabilityScore(findings: AuditFinding[]): number {
  const debtFindings = findings.filter(
    (f) => f.category === "technical_debt" || f.category === "maintainability"
  );
  if (debtFindings.length === 0) return 100;

  const totalDebt = debtFindings.reduce((acc, f) => acc + f.debtMinutes, 0);
  const penalty = Math.min(100, Math.floor(totalDebt / 10));

  return Math.max(0, 100 - penalty);
}

export function computeTotalDebt(findings: AuditFinding[]): number {
  return findings.reduce((acc, f) => acc + f.debtMinutes, 0);
}
