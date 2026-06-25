import { describe, it, expect, beforeEach } from "vitest";
import { ASTParser } from "./ASTParser";

const JS_SAMPLE = `
const express = require('express');
const _ = require('lodash');

var counter = 0;
let name = 'hello';

function greet(user) {
  var msg = 'Hello ' + user;
  if (!user) return 'stranger';
  if (user.length > 10 && user.startsWith('admin')) return 'admin';
  return msg;
}

const fetchData = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('fetch failed');
  return response.json();
};

class UserService {
  constructor(db) {
    this.db = db;
  }

  async findById(id) {
    if (!id) throw new Error('id required');
    return this.db.query('SELECT * FROM users WHERE id = ?', [id]);
  }

  delete(id) {
    return this.db.query('DELETE FROM users WHERE id = ?', [id]);
  }
}

parsed.exports = { greet, UserService };
`.trim();

const PY_SAMPLE = `
import os
import json
from pathlib import Path
from flask import Flask, request

app = Flask(__name__)

def process_data(data):
    result = []
    for item in data:
        if item > 0:
            result.append(item * 2)
    return result
`.trim();

describe("ASTParser", () => {
  let parser: ASTParser;

  beforeEach(() => {
    parser = new ASTParser();
  });

  describe("JavaScript parsing", () => {
    it("extracts require() imports", () => {
      const parsed = parser.parse("index.js", JS_SAMPLE, "javascript");
      expect(parsed.imports).toContain("express");
      expect(parsed.imports).toContain("lodash");
    });

    it("extracts functions", () => {
      const parsed = parser.parse("index.js", JS_SAMPLE, "javascript");
      const names = parsed.functions.map((f) => f.name);
      expect(names).toContain("greet");
      expect(names).toContain("fetchData");
    });

    it("detects async functions", () => {
      const parsed = parser.parse("index.js", JS_SAMPLE, "javascript");
      const fetchFn = parsed.functions.find((f) => f.name === "fetchData");
      expect(fetchFn?.isAsync).toBe(true);
    });

    it("detects arrow functions", () => {
      const parsed = parser.parse("index.js", JS_SAMPLE, "javascript");
      const arrowFn = parsed.functions.find((f) => f.isArrow);
      expect(arrowFn).toBeDefined();
    });

    it("extracts classes", () => {
      const parsed = parser.parse("index.js", JS_SAMPLE, "javascript");
      expect(parsed.classes.map((c) => c.name)).toContain("UserService");
    });

    it("detects var declarations", () => {
      const parsed = parser.parse("index.js", JS_SAMPLE, "javascript");
      const varDecls = parsed.variables.filter((v) => v.kind === "var");
      expect(varDecls.length).toBeGreaterThan(0);
    });

    it("filters out local imports from dependencies", () => {
      const parsed = parser.parse("index.js", JS_SAMPLE, "javascript");
      parsed.dependencies.forEach((dep) => {
        expect(dep).not.toMatch(/^\./);
      });
    });

    it("computes a positive complexity score", () => {
      const parsed = parser.parse("index.js", JS_SAMPLE, "javascript");
      expect(parsed.complexity).toBeGreaterThan(1);
    });
  });

  describe("Python parsing", () => {
    it("extracts Python imports", () => {
      const parsed = parser.parse("app.py", PY_SAMPLE, "python");
      expect(parsed.imports).toContain("os");
      expect(parsed.imports).toContain("flask");
    });

    it("returns empty exports for Python", () => {
      const parsed = parser.parse("app.py", PY_SAMPLE, "python");
      expect(parsed.exports).toHaveLength(0);
    });
  });

  describe("Edge cases", () => {
    it("handles empty file", () => {
      const parsed = parser.parse("empty.js", "", "javascript");
      expect(parsed.functions).toHaveLength(0);
      expect(parsed.classes).toHaveLength(0);
      expect(parsed.imports).toHaveLength(0);
    });

    it("handles file with only comments", () => {
      const content = "// This file is intentionally left blank\n/* no code */";
      const parsed = parser.parse("comments.js", content, "javascript");
      expect(parsed.complexity).toBe(1);
    });
  });
});
