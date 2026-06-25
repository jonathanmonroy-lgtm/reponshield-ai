import { describe, it, expect } from "vitest";
import { buildMigrationMessages, parseMigrationResponse } from "./MigrationPromptBuilder";
import type { ParsedModule } from "./ASTParser";

const SAMPLE_MODULE: ParsedModule = {
  language: "javascript",
  filePath: "index.js",
  imports: ["express", "lodash"],
  exports: ["handler"],
  functions: [
    { name: "handler", isAsync: true, isArrow: false, params: ["req", "res"], startLine: 5, endLine: 8 },
  ],
  classes: [],
  variables: [{ name: "app", kind: "const", startLine: 1 }],
  dependencies: ["express", "lodash"],
  complexity: 3,
};

const JS_SOURCE = `
const express = require('express');
const _ = require('lodash');
function handler(req, res) {
  const users = _.map(req.body.users, u => u.name);
  res.json({ users });
}
`.trim();

const VALID_MIGRATION_RESPONSE = JSON.stringify({
  migratedCode: `import express from 'express';\nimport _ from 'lodash';\nexport function handler(req: express.Request, res: express.Response): void {\n  const users: string[] = _.map(req.body.users as { name: string }[], (u) => u.name);\n  res.json({ users });\n}`,
  testCode: `import { describe, it, expect } from 'vitest';\ndescribe('handler', () => { it('returns users', () => { expect(true).toBe(true); }); });`,
  summary: "Converted CommonJS to ESM, added TypeScript types.",
  linesChanged: 6,
  detectedDependencies: ["express", "lodash"],
});

describe("MigrationPromptBuilder - buildMigrationMessages", () => {
  it("returns system + user messages", () => {
    const msgs = buildMigrationMessages("index.js", JS_SOURCE, "javascript", SAMPLE_MODULE);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe("system");
    expect(msgs[1]?.role).toBe("user");
  });

  it("includes file path in user message", () => {
    const msgs = buildMigrationMessages("src/handler.js", JS_SOURCE, "javascript", SAMPLE_MODULE);
    expect(msgs[1]?.content).toContain("src/handler.js");
  });

  it("includes JavaScript language context for javascript source", () => {
    const msgs = buildMigrationMessages("index.js", JS_SOURCE, "javascript", SAMPLE_MODULE);
    expect(msgs[1]?.content).toContain("JavaScript");
  });

  it("includes Python language context for python source", () => {
    const msgs = buildMigrationMessages("app.py", "def foo(): pass", "python", {
      ...SAMPLE_MODULE,
      imports: [],
      dependencies: [],
    });
    expect(msgs[1]?.content).toContain("Python");
  });

  it("includes PHP language context for php source", () => {
    const msgs = buildMigrationMessages("index.php", "<?php echo 'hi';", "php", {
      ...SAMPLE_MODULE,
      imports: [],
      dependencies: [],
    });
    expect(msgs[1]?.content).toContain("PHP");
  });

  it("includes detected function names", () => {
    const msgs = buildMigrationMessages("index.js", JS_SOURCE, "javascript", SAMPLE_MODULE);
    expect(msgs[1]?.content).toContain("handler");
  });

  it("includes external dependencies", () => {
    const msgs = buildMigrationMessages("index.js", JS_SOURCE, "javascript", SAMPLE_MODULE);
    expect(msgs[1]?.content).toContain("express");
    expect(msgs[1]?.content).toContain("lodash");
  });

  it("includes original source code in user message", () => {
    const msgs = buildMigrationMessages("index.js", JS_SOURCE, "javascript", SAMPLE_MODULE);
    expect(msgs[1]?.content).toContain("require('express')");
  });

  it("system prompt instructs to return strict JSON", () => {
    const msgs = buildMigrationMessages("index.js", JS_SOURCE, "javascript", SAMPLE_MODULE);
    expect(msgs[0]?.content).toContain("JSON");
  });
});

describe("MigrationPromptBuilder - parseMigrationResponse", () => {
  it("parses a valid JSON response", () => {
    const result = parseMigrationResponse(VALID_MIGRATION_RESPONSE);
    expect(result.migratedCode).toContain("express.Request");
    expect(result.testCode).toContain("vitest");
    expect(result.linesChanged).toBe(6);
    expect(result.detectedDependencies).toContain("express");
    expect(result.detectedDependencies).toContain("lodash");
    expect(result.summary).toContain("Converted");
  });

  it("parses response wrapped in markdown code fences", () => {
    const fenced = "```json\n" + VALID_MIGRATION_RESPONSE + "\n```";
    const result = parseMigrationResponse(fenced);
    expect(result.linesChanged).toBe(6);
  });

  it("defaults linesChanged to 0 when missing", () => {
    const partial = JSON.stringify({
      migratedCode: "export const x = 1;",
      testCode: "",
      summary: "Done",
      detectedDependencies: [],
    });
    const result = parseMigrationResponse(partial);
    expect(result.linesChanged).toBe(0);
  });

  it("defaults detectedDependencies to empty array when missing", () => {
    const partial = JSON.stringify({
      migratedCode: "export const x = 1;",
      testCode: "",
      summary: "Done",
      linesChanged: 10,
    });
    const result = parseMigrationResponse(partial);
    expect(result.detectedDependencies).toEqual([]);
  });

  it("casts all string fields to string safely", () => {
    const partial = JSON.stringify({
      migratedCode: 42,
      testCode: null,
      summary: true,
      linesChanged: 1,
      detectedDependencies: [],
    });
    const result = parseMigrationResponse(partial);
    expect(typeof result.migratedCode).toBe("string");
    expect(typeof result.testCode).toBe("string");
    expect(typeof result.summary).toBe("string");
  });

  it("throws on completely invalid response", () => {
    expect(() => parseMigrationResponse("I cannot migrate this file.")).toThrow();
  });

  it("throws when response is not an object", () => {
    expect(() => parseMigrationResponse(JSON.stringify([1, 2, 3]))).toThrow();
  });
});
