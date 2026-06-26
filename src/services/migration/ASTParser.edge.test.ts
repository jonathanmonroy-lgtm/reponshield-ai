import { describe, it, expect, beforeEach } from "vitest";
import { ASTParser } from "./ASTParser";
import { MAX_FILE_SIZE_BYTES } from "@/lib/constants";

describe("ASTParser — edge cases & security hardening", () => {
  let parser: ASTParser;

  beforeEach(() => {
    parser = new ASTParser();
  });

  // ── safeParse() ─────────────────────────────────────────────────────────────

  describe("safeParse()", () => {
    it("returns err when file content exceeds MAX_FILE_SIZE_BYTES", () => {
      const huge = "const x = " + "1".repeat(MAX_FILE_SIZE_BYTES + 1) + ";";
      const result = parser.safeParse("big.js", huge, "javascript");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("limit");
        expect(result.error.message).toContain("big.js");
      }
    });

    it("returns ok with empty arrays for whitespace-only content", () => {
      const result = parser.safeParse("blank.js", "   \n\t\n  \n", "javascript");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.functions).toHaveLength(0);
        expect(result.data.imports).toHaveLength(0);
        expect(result.data.classes).toHaveLength(0);
      }
    });

    it("returns ok with correct language field set to 'python'", () => {
      const py = "import os\n\ndef main():\n    pass\n";
      const result = parser.safeParse("main.py", py, "python");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe("python");
        expect(result.data.imports).toContain("os");
      }
    });

    it("returns ok with correct language field set to 'php'", () => {
      const php = "<?php require_once('config.php'); ?>";
      const result = parser.safeParse("app.php", php, "php");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe("php");
        expect(result.data.imports).toContain("config.php");
      }
    });

    it("returns ok for content at exactly MAX_FILE_SIZE_BYTES (boundary — not over)", () => {
      const atLimit = "// comment\n".repeat(
        Math.ceil(MAX_FILE_SIZE_BYTES / 12)
      ).slice(0, MAX_FILE_SIZE_BYTES);
      const result = parser.safeParse("boundary.js", atLimit, "javascript");
      expect(result.success).toBe(true);
    });
  });

  // ── parse() robustness ───────────────────────────────────────────────────────

  describe("parse() robustness", () => {
    it("does not throw on code with unclosed braces (findClosingBrace falls back to EOF)", () => {
      const unclosed =
        "function broken() {\n  if (true) {\n    console.log('unclosed');\n";
      expect(() =>
        parser.parse("unclosed.js", unclosed, "javascript")
      ).not.toThrow();
    });

    it("computes complexity=1 for a file with no control-flow keywords", () => {
      const result = parser.parse("const.js", "const PI = 3.14;", "javascript");
      expect(result.complexity).toBe(1);
    });

    it("correctly extracts PHP require and include statements as imports", () => {
      const php = [
        "<?php",
        "require_once('vendor/autoload.php');",
        "include 'config.php';",
        "?>",
      ].join("\n");
      const result = parser.parse("app.php", php, "php");
      expect(result.imports).toContain("vendor/autoload.php");
      expect(result.imports).toContain("config.php");
    });

    it("deduplicates repeated imports", () => {
      const repeated = [
        "import { a } from 'lodash';",
        "import { b } from 'lodash';",
        "import { c } from 'lodash';",
      ].join("\n");
      const result = parser.parse("dup.js", repeated, "javascript");
      const lodashCount = result.imports.filter((i) => i === "lodash").length;
      expect(lodashCount).toBe(1);
    });

    it("extracts Python from-import modules correctly", () => {
      const py = "from pathlib import Path\nfrom flask import Flask, request\n";
      const result = parser.parse("app.py", py, "python");
      expect(result.imports).toContain("pathlib");
      expect(result.imports).toContain("flask");
    });

    it("filters out relative-path imports from dependencies list", () => {
      const code =
        "import { helper } from './utils';\nconst x = require('../shared/db');";
      const result = parser.parse("svc.js", code, "javascript");
      result.dependencies.forEach((dep) => {
        expect(dep).not.toMatch(/^\./);
        expect(dep).not.toMatch(/^\//);
      });
    });
  });
});
