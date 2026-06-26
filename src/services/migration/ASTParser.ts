import type { SourceLanguage } from "@/core/entities/MigrationJob";
import { ok, err } from "@/lib/types";
import type { Result } from "@/lib/types";
import { MAX_FILE_SIZE_BYTES } from "@/lib/constants";

export interface ASTNode {
  type: string;
  name?: string;
  value?: string;
  children: ASTNode[];
  startLine: number;
  endLine: number;
}

export interface ParsedModule {
  language: SourceLanguage;
  filePath: string;
  imports: string[];
  exports: string[];
  functions: Array<{
    name: string;
    params: string[];
    startLine: number;
    endLine: number;
    isAsync: boolean;
    isArrow: boolean;
  }>;
  classes: Array<{
    name: string;
    methods: string[];
    startLine: number;
    endLine: number;
  }>;
  variables: Array<{
    name: string;
    kind: "var" | "let" | "const" | "unknown";
    startLine: number;
  }>;
  dependencies: string[];
  complexity: number;
}

const FUNCTION_RE =
  /(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/g;

const CLASS_RE = /class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{/g;

const IMPORT_JS_RE =
  /(?:import\s.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

const IMPORT_PY_RE =
  /(?:^import\s+([\w.]+)|^from\s+([\w.]+)\s+import)/gm;

const IMPORT_PHP_RE =
  /(?:require|include|require_once|include_once)\s*\(?['"]([^'"]+)['"]\)?/g;

const VAR_RE = /\b(var|let|const)\s+(\w+)/g;

export class ASTParser {
  /**
   * Safe entry point: validates input size and wraps parse() in a try/catch so
   * malformed payloads never propagate uncaught exceptions to callers.
   */
  safeParse(
    filePath: string,
    content: string,
    language: SourceLanguage
  ): Result<ParsedModule> {
    if (typeof content !== "string") {
      return err(new Error("File content must be a string"));
    }
    if (content.length > MAX_FILE_SIZE_BYTES) {
      return err(
        new Error(
          `File ${filePath} exceeds the ${MAX_FILE_SIZE_BYTES}-byte parse limit (${content.length} chars)`
        )
      );
    }
    try {
      return ok(this.parse(filePath, content, language));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  parse(filePath: string, content: string, language: SourceLanguage): ParsedModule {
    const lines = content.split("\n");
    const lineCount = lines.length;

    return {
      language,
      filePath,
      imports: this.extractImports(content, language),
      exports: this.extractExports(content, language),
      functions: this.extractFunctions(content),
      classes: this.extractClasses(content),
      variables: this.extractVariables(content, language),
      dependencies: this.extractDependencies(content, language),
      complexity: this.estimateComplexity(content, lineCount),
    };
  }

  private extractImports(content: string, language: SourceLanguage): string[] {
    const imports: string[] = [];

    if (language === "javascript") {
      let match: RegExpExecArray | null;
      IMPORT_JS_RE.lastIndex = 0;
      while ((match = IMPORT_JS_RE.exec(content)) !== null) {
        const mod = match[1] ?? match[2];
        if (mod) imports.push(mod);
      }
    } else if (language === "python") {
      let match: RegExpExecArray | null;
      IMPORT_PY_RE.lastIndex = 0;
      while ((match = IMPORT_PY_RE.exec(content)) !== null) {
        const mod = match[1] ?? match[2];
        if (mod) imports.push(mod);
      }
    } else if (language === "php") {
      let match: RegExpExecArray | null;
      IMPORT_PHP_RE.lastIndex = 0;
      while ((match = IMPORT_PHP_RE.exec(content)) !== null) {
        if (match[1]) imports.push(match[1]);
      }
    }

    return [...new Set(imports)];
  }

  private extractExports(content: string, language: SourceLanguage): string[] {
    if (language !== "javascript") return [];

    const exports: string[] = [];
    const namedRe = /export\s+(?:function|class|const|let|var)\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = namedRe.exec(content)) !== null) {
      if (match[1]) exports.push(match[1]);
    }
    return exports;
  }

  private extractFunctions(
    content: string
  ): ParsedModule["functions"] {
    const fns: ParsedModule["functions"] = [];
    const lines = content.split("\n");

    let match: RegExpExecArray | null;
    FUNCTION_RE.lastIndex = 0;
    while ((match = FUNCTION_RE.exec(content)) !== null) {
      const name = match[1] ?? match[3] ?? "anonymous";
      const params = (match[2] ?? match[4] ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const fullMatch = match[0] ?? "";
      const isAsync =
        fullMatch.includes("async") ||
        content.slice(Math.max(0, match.index - 10), match.index).includes("async");
      const isArrow = (match[3] ?? "") !== "";

      const startLine =
        content.slice(0, match.index).split("\n").length;
      const bodyEnd = this.findClosingBrace(lines, startLine - 1);

      fns.push({ name, params, startLine, endLine: bodyEnd, isAsync, isArrow });
    }

    return fns;
  }

  private extractClasses(content: string): ParsedModule["classes"] {
    const classes: ParsedModule["classes"] = [];
    const lines = content.split("\n");

    let match: RegExpExecArray | null;
    CLASS_RE.lastIndex = 0;
    while ((match = CLASS_RE.exec(content)) !== null) {
      const name = match[1] ?? "AnonymousClass";
      const startLine = content.slice(0, match.index).split("\n").length;
      const endLine = this.findClosingBrace(lines, startLine - 1);

      const classBody = lines.slice(startLine, endLine).join("\n");
      const methodRe = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g;
      const methods: string[] = [];
      let methodMatch: RegExpExecArray | null;
      while ((methodMatch = methodRe.exec(classBody)) !== null) {
        const mName = methodMatch[1];
        if (mName && mName !== "if" && mName !== "while" && mName !== "for") {
          methods.push(mName);
        }
      }

      classes.push({ name, methods, startLine, endLine });
    }

    return classes;
  }

  private extractVariables(
    content: string,
    language: SourceLanguage
  ): ParsedModule["variables"] {
    if (language !== "javascript") return [];

    const variables: ParsedModule["variables"] = [];
    let match: RegExpExecArray | null;
    VAR_RE.lastIndex = 0;
    while ((match = VAR_RE.exec(content)) !== null) {
      const kind = match[1] as "var" | "let" | "const";
      const name = match[2]!;
      const startLine = content.slice(0, match.index).split("\n").length;
      variables.push({ name, kind, startLine });
    }
    return variables;
  }

  private extractDependencies(
    content: string,
    language: SourceLanguage
  ): string[] {
    const imports = this.extractImports(content, language);
    return imports.filter(
      (imp) => !imp.startsWith(".") && !imp.startsWith("/")
    );
  }

  private estimateComplexity(content: string, lineCount: number): number {
    const cyclomaticKeywords =
      /\b(if|else|for|while|do|switch|case|catch|&&|\|\||\?)\b/g;
    const matches = content.match(cyclomaticKeywords);
    const base = 1;
    const cyclomaticComplexity = base + (matches?.length ?? 0);
    const linesScore = Math.floor(lineCount / 50);
    return cyclomaticComplexity + linesScore;
  }

  private findClosingBrace(lines: string[], startIdx: number): number {
    let depth = 0;
    let found = false;
    for (let i = startIdx; i < lines.length; i++) {
      for (const ch of lines[i] ?? "") {
        if (ch === "{") { depth++; found = true; }
        if (ch === "}") {
          depth--;
          if (found && depth === 0) return i + 1;
        }
      }
    }
    return lines.length;
  }
}
