import type { AIMessage } from "@/infrastructure/ai/IAIProvider";
import type { ParsedModule } from "@/services/migration/ASTParser";
import type { SourceLanguage } from "@/core/entities/MigrationJob";

const SYSTEM_PROMPT = `You are RepoShield AI Migration Engine — an expert TypeScript architect.
Your task: migrate legacy code to modern, strict TypeScript with full type safety.

Rules:
1. Preserve ALL business logic exactly. Never change behavior.
2. Add explicit TypeScript types to every function parameter, return value, and variable.
3. Replace var with const/let appropriately.
4. Convert callbacks to async/await where applicable.
5. Replace require() with ES6 import statements.
6. Add proper error handling with typed error classes.
7. Generate a comprehensive unit test suite using Vitest.
8. Return ONLY valid JSON, no markdown fences.`;

export interface MigrationResponseSchema {
  migratedCode: string;
  testCode: string;
  summary: string;
  linesChanged: number;
  detectedDependencies: string[];
}

export function buildMigrationMessages(
  filePath: string,
  content: string,
  language: SourceLanguage,
  parsedModule: ParsedModule
): AIMessage[] {
  const languageContext = {
    javascript: "JavaScript ES5/ES6 (CommonJS/callbacks)",
    python: "Python 2/3 (untyped)",
    php: "PHP 5/7 (legacy)",
  }[language];

  const userMessage = `Migrate this ${languageContext} file to modern TypeScript (strict mode).

File path: \`${filePath}\`
Detected functions: ${parsedModule.functions.map((f) => f.name).join(", ") || "none"}
Detected classes: ${parsedModule.classes.map((c) => c.name).join(", ") || "none"}
External dependencies: ${parsedModule.dependencies.join(", ") || "none"}
Cyclomatic complexity: ${parsedModule.complexity}

Return a JSON object:
{
  "migratedCode": "// complete TypeScript file content",
  "testCode": "// complete Vitest test file",
  "summary": "What was changed and why",
  "linesChanged": 42,
  "detectedDependencies": ["express", "lodash"]
}

ORIGINAL CODE:
\`\`\`${language}
${content}
\`\`\``;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];
}

export function parseMigrationResponse(
  content: string
): MigrationResponseSchema {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Migration AI response contained no valid JSON");
    }
    parsed = JSON.parse(jsonMatch[0]);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Migration AI response was not an object");
  }

  const obj = parsed as Record<string, unknown>;

  return {
    migratedCode: String(obj.migratedCode ?? ""),
    testCode: String(obj.testCode ?? ""),
    summary: String(obj.summary ?? ""),
    linesChanged: Number(obj.linesChanged) || 0,
    detectedDependencies: Array.isArray(obj.detectedDependencies)
      ? (obj.detectedDependencies as unknown[]).map(String)
      : [],
  };
}
