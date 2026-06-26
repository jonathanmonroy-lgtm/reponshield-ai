import { describe, it, expect, beforeEach } from "vitest";
import { DiffAnalyzer } from "./DiffAnalyzer";
import { MAX_DIFF_SIZE_BYTES } from "@/lib/constants";

describe("DiffAnalyzer — edge cases & security hardening", () => {
  let analyzer: DiffAnalyzer;

  beforeEach(() => {
    analyzer = new DiffAnalyzer();
  });

  // ── safeParse() ─────────────────────────────────────────────────────────────

  describe("safeParse()", () => {
    it("returns err when diff payload exceeds MAX_DIFF_SIZE_BYTES", () => {
      const oversized = "x".repeat(MAX_DIFF_SIZE_BYTES + 1);
      const result = analyzer.safeParse(oversized);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("limit");
      }
    });

    it("returns ok({ files: [] }) for an empty string", () => {
      const result = analyzer.safeParse("");
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.files).toHaveLength(0);
    });

    it("returns ok at exactly MAX_DIFF_SIZE_BYTES (boundary — not over)", () => {
      const atLimit = "x".repeat(MAX_DIFF_SIZE_BYTES);
      const result = analyzer.safeParse(atLimit);
      // Junk content has no diff headers, so files=[] but success=true
      expect(result.success).toBe(true);
    });

    it("correctly parses a Windows CRLF diff (normalises line endings)", () => {
      const crlfDiff = [
        "diff --git a/src/file.ts b/src/file.ts",
        "index abc..def 100644",
        "--- a/src/file.ts",
        "+++ b/src/file.ts",
        "@@ -1 +1 @@",
        "-old line",
        "+new line",
      ].join("\r\n");

      const result = analyzer.safeParse(crlfDiff);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.files).toHaveLength(1);
        expect(result.data.files[0]?.path).toBe("src/file.ts");
        expect(result.data.files[0]?.additions).toBe(1);
        expect(result.data.files[0]?.deletions).toBe(1);
      }
    });

    it("returns ok({ files: [] }) for a diff that only contains binary file markers", () => {
      const binaryDiff = [
        "diff --git a/assets/logo.png b/assets/logo.png",
        "index abc..def 100644",
        "Binary files a/assets/logo.png and b/assets/logo.png differ",
      ].join("\n");

      const result = analyzer.safeParse(binaryDiff);
      expect(result.success).toBe(true);
      if (result.success) {
        // Binary files have no hunks, so they are filtered out
        expect(result.data.files).toHaveLength(0);
      }
    });

    it("handles a diff with mixed CR-only line endings (old Mac format)", () => {
      const crOnlyDiff =
        "diff --git a/a.ts b/a.ts\r" +
        "index abc..def 100644\r" +
        "--- a/a.ts\r" +
        "+++ b/a.ts\r" +
        "@@ -1 +1 @@\r" +
        "-removed\r" +
        "+added\r";

      const result = analyzer.safeParse(crOnlyDiff);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.files).toHaveLength(1);
        expect(result.data.files[0]?.deletions).toBe(1);
        expect(result.data.files[0]?.additions).toBe(1);
      }
    });
  });

  // ── parse() defensive behaviour ─────────────────────────────────────────────

  describe("parse() defensive behaviour", () => {
    it("returns empty files array for completely non-diff text", () => {
      const garbage = "This is not a diff at all — just random prose.\nNo headers.";
      expect(analyzer.parse(garbage).files).toHaveLength(0);
    });

    it("handles a hunk with only context lines (zero additions, zero deletions)", () => {
      const contextOnly = [
        "diff --git a/src/a.ts b/src/a.ts",
        "index abc..def 100644",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1,2 +1,2 @@",
        " unchanged line 1",
        " unchanged line 2",
      ].join("\n");

      const parsed = analyzer.parse(contextOnly);
      expect(parsed.files).toHaveLength(1);
      expect(parsed.files[0]?.additions).toBe(0);
      expect(parsed.files[0]?.deletions).toBe(0);
    });

    it("handles a diff with multiple hunks in a single file correctly", () => {
      const multiHunk = [
        "diff --git a/src/x.ts b/src/x.ts",
        "index abc..def 100644",
        "--- a/src/x.ts",
        "+++ b/src/x.ts",
        "@@ -1 +1 @@",
        "-line1",
        "+LINE1",
        "@@ -10 +10 @@",
        "-line10",
        "+LINE10",
      ].join("\n");

      const parsed = analyzer.parse(multiHunk);
      expect(parsed.files).toHaveLength(1);
      expect(parsed.files[0]?.chunks).toHaveLength(2);
      expect(parsed.files[0]?.additions).toBe(2);
      expect(parsed.files[0]?.deletions).toBe(2);
    });

    it("assigns monotonically increasing newLine counters to added lines across hunks", () => {
      const diff = [
        "diff --git a/src/y.ts b/src/y.ts",
        "index abc..def 100644",
        "--- a/src/y.ts",
        "+++ b/src/y.ts",
        "@@ -1 +1 @@",
        "+first added",
        "@@ -5 +5 @@",
        "+second added",
      ].join("\n");

      const parsed = analyzer.parse(diff);
      const added = analyzer.getAddedLines(parsed);
      expect(added).toHaveLength(2);
      expect(added[0]!.line).toBeLessThan(added[1]!.line);
    });
  });
});
