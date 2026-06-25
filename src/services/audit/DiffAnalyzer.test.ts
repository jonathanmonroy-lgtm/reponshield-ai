import { describe, it, expect, beforeEach } from "vitest";
import { DiffAnalyzer } from "./DiffAnalyzer";

const SAMPLE_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index abc1234..def5678 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,7 +10,10 @@ import { db } from './database';
 const JWT_EXPIRY = '24h';

 export function createToken(userId: string): string {
-  return jwt.sign({ userId }, 'hardcoded-secret');
+  const secret = process.env.JWT_SECRET;
+  if (!secret) throw new Error('JWT_SECRET not configured');
+  return jwt.sign({ userId, iat: Date.now() }, secret, {
+    expiresIn: JWT_EXPIRY,
+  });
 }

diff --git a/src/utils.ts b/src/utils.ts
index 111aaaa..222bbbb 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,4 +1,6 @@
+import { logger } from './logger';
+
 export function sanitize(input: string): string {
-  return input;
+  logger.debug('sanitizing input');
+  return input.replace(/<[^>]*>/g, '');
 }`;

describe("DiffAnalyzer", () => {
  let analyzer: DiffAnalyzer;

  beforeEach(() => {
    analyzer = new DiffAnalyzer();
  });

  it("parses two files from a diff", () => {
    const parsed = analyzer.parse(SAMPLE_DIFF);
    expect(parsed.files).toHaveLength(2);
  });

  it("correctly identifies file paths", () => {
    const parsed = analyzer.parse(SAMPLE_DIFF);
    expect(parsed.files[0]?.path).toBe("src/auth.ts");
    expect(parsed.files[1]?.path).toBe("src/utils.ts");
  });

  it("counts additions correctly", () => {
    const parsed = analyzer.parse(SAMPLE_DIFF);
    expect(parsed.files[0]?.additions).toBe(5);
    expect(parsed.files[1]?.additions).toBe(4);
  });

  it("counts deletions correctly", () => {
    const parsed = analyzer.parse(SAMPLE_DIFF);
    expect(parsed.files[0]?.deletions).toBe(1);
    expect(parsed.files[1]?.deletions).toBe(1);
  });

  it("assigns correct line numbers to added lines", () => {
    const parsed = analyzer.parse(SAMPLE_DIFF);
    const addedLines = analyzer.getAddedLines(parsed);
    expect(addedLines.length).toBeGreaterThan(0);
    addedLines.forEach((l) => {
      expect(l.line).toBeGreaterThan(0);
    });
  });

  it("returns empty files for empty diff", () => {
    const parsed = analyzer.parse("");
    expect(parsed.files).toHaveLength(0);
  });

  it("returns empty files for non-diff text", () => {
    const parsed = analyzer.parse("This is not a diff");
    expect(parsed.files).toHaveLength(0);
  });

  it("serializes diff back to readable format", () => {
    const parsed = analyzer.parse(SAMPLE_DIFF);
    const serialized = analyzer.serialize(parsed);
    expect(serialized).toContain("src/auth.ts");
    expect(serialized).toContain("src/utils.ts");
    expect(serialized).toContain("+");
  });

  it("truncates diff that exceeds token limit", () => {
    const hugeDiff = Array.from({ length: 100 }, (_, i) =>
      `diff --git a/file${i}.ts b/file${i}.ts\nindex abc..def 100644\n--- a/file${i}.ts\n+++ b/file${i}.ts\n@@ -1 +1 @@\n-old\n+${"new content ".repeat(500)}`
    ).join("\n");
    const parsed = analyzer.parse(hugeDiff);
    const truncated = analyzer.truncateForTokenLimit(parsed);
    expect(truncated.files.length).toBeLessThan(parsed.files.length);
  });
});
