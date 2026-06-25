import { describe, it, expect } from "vitest";
import {
  computeSecurityScore,
  computeMaintainabilityScore,
  computeTotalDebt,
} from "./PullRequestAudit";
import type { AuditFinding } from "./PullRequestAudit";

const makeFindings = (
  overrides: Partial<AuditFinding>[] = []
): AuditFinding[] =>
  overrides.map((o, i) => ({
    id: `finding-${i}`,
    filePath: "src/foo.ts",
    lineStart: 1,
    lineEnd: 1,
    category: "security",
    severity: "medium",
    title: "Test finding",
    description: "Test",
    suggestion: "Fix it",
    owaspReference: null,
    debtMinutes: 10,
    ...o,
  }));

describe("computeSecurityScore", () => {
  it("returns 100 for no findings", () => {
    expect(computeSecurityScore([])).toBe(100);
  });

  it("returns 100 for non-security findings", () => {
    const findings = makeFindings([
      { category: "technical_debt", severity: "high" },
    ]);
    expect(computeSecurityScore(findings)).toBe(100);
  });

  it("reduces score for critical security finding", () => {
    const findings = makeFindings([
      { category: "security", severity: "critical" },
    ]);
    expect(computeSecurityScore(findings)).toBe(75);
  });

  it("reduces score for multiple high findings", () => {
    const findings = makeFindings([
      { category: "security", severity: "high" },
      { category: "security", severity: "high" },
    ]);
    expect(computeSecurityScore(findings)).toBe(70);
  });

  it("never returns below 0", () => {
    const findings = makeFindings(
      Array.from({ length: 10 }, () => ({
        category: "security" as const,
        severity: "critical" as const,
      }))
    );
    expect(computeSecurityScore(findings)).toBeGreaterThanOrEqual(0);
  });
});

describe("computeMaintainabilityScore", () => {
  it("returns 100 for no findings", () => {
    expect(computeMaintainabilityScore([])).toBe(100);
  });

  it("reduces score based on total debt minutes", () => {
    const findings = makeFindings([
      { category: "technical_debt", debtMinutes: 100 },
    ]);
    expect(computeMaintainabilityScore(findings)).toBeLessThan(100);
  });
});

describe("computeTotalDebt", () => {
  it("returns 0 for empty findings", () => {
    expect(computeTotalDebt([])).toBe(0);
  });

  it("sums all debt minutes", () => {
    const findings = makeFindings([
      { debtMinutes: 30 },
      { debtMinutes: 45 },
      { debtMinutes: 15 },
    ]);
    expect(computeTotalDebt(findings)).toBe(90);
  });
});
