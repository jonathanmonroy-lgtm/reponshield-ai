import type { ParsedDiff } from "@/core/use-cases/audit/ProcessPullRequestAudit";
import { MAX_DIFF_TOKENS } from "@/lib/constants";

interface RawLine {
  type: "add" | "del" | "ctx";
  content: string;
  newLine: number | null;
}

interface RawChunk {
  oldStart: number;
  newStart: number;
  lines: RawLine[];
}

interface ParsedFile {
  path: string;
  additions: number;
  deletions: number;
  chunks: RawChunk[];
}

const HUNK_HEADER_RE =
  /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

const DIFF_FILE_RE = /^diff --git a\/(.+) b\/(.+)$/;

export class DiffAnalyzer {
  parse(rawDiff: string): ParsedDiff {
    const files: ParsedFile[] = [];
    let currentFile: ParsedFile | null = null;
    let currentChunk: RawChunk | null = null;
    let newLineCounter = 0;

    const lines = rawDiff.split("\n");

    for (const line of lines) {
      const fileMatch = DIFF_FILE_RE.exec(line);
      if (fileMatch) {
        if (currentFile) {
          if (currentChunk) currentFile.chunks.push(currentChunk);
          files.push(currentFile);
        }
        currentFile = {
          path: fileMatch[2]!,
          additions: 0,
          deletions: 0,
          chunks: [],
        };
        currentChunk = null;
        continue;
      }

      if (!currentFile) continue;

      if (
        line.startsWith("--- ") ||
        line.startsWith("+++ ") ||
        line.startsWith("index ") ||
        line.startsWith("new file") ||
        line.startsWith("deleted file") ||
        line.startsWith("Binary files")
      ) {
        continue;
      }

      const hunkMatch = HUNK_HEADER_RE.exec(line);
      if (hunkMatch) {
        if (currentChunk) currentFile.chunks.push(currentChunk);
        newLineCounter = parseInt(hunkMatch[2]!, 10) - 1;
        currentChunk = {
          oldStart: parseInt(hunkMatch[1]!, 10),
          newStart: parseInt(hunkMatch[2]!, 10),
          lines: [],
        };
        continue;
      }

      if (!currentChunk) continue;

      if (line.startsWith("+")) {
        newLineCounter++;
        currentChunk.lines.push({
          type: "add",
          content: line.slice(1),
          newLine: newLineCounter,
        });
        currentFile.additions++;
      } else if (line.startsWith("-")) {
        currentChunk.lines.push({
          type: "del",
          content: line.slice(1),
          newLine: null,
        });
        currentFile.deletions++;
      } else if (line.startsWith(" ") || line === "") {
        newLineCounter++;
        currentChunk.lines.push({
          type: "ctx",
          content: line.slice(1),
          newLine: newLineCounter,
        });
      }
    }

    if (currentFile) {
      if (currentChunk) currentFile.chunks.push(currentChunk);
      files.push(currentFile);
    }

    return { files: files.filter((f) => f.chunks.length > 0) };
  }

  truncateForTokenLimit(diff: ParsedDiff): ParsedDiff {
    let charCount = 0;
    const tokenEstimate = MAX_DIFF_TOKENS * 4;
    const truncatedFiles: ParsedFile[] = [];

    for (const file of diff.files) {
      const fileStr = this.serializeFile(file);
      if (charCount + fileStr.length > tokenEstimate) break;
      charCount += fileStr.length;
      truncatedFiles.push(file);
    }

    return { files: truncatedFiles };
  }

  serialize(diff: ParsedDiff): string {
    return diff.files.map((f) => this.serializeFile(f)).join("\n\n");
  }

  private serializeFile(file: ParsedFile): string {
    const lines: string[] = [`### File: ${file.path}`];
    for (const chunk of file.chunks) {
      lines.push(
        `@@ -${chunk.oldStart} +${chunk.newStart} @@`
      );
      for (const line of chunk.lines) {
        const prefix =
          line.type === "add" ? "+" : line.type === "del" ? "-" : " ";
        lines.push(`${prefix}${line.content}`);
      }
    }
    return lines.join("\n");
  }

  getAddedLines(
    diff: ParsedDiff
  ): Array<{ file: string; line: number; content: string }> {
    const result: Array<{ file: string; line: number; content: string }> = [];
    for (const file of diff.files) {
      for (const chunk of file.chunks) {
        for (const line of chunk.lines) {
          if (line.type === "add" && line.newLine !== null) {
            result.push({
              file: file.path,
              line: line.newLine,
              content: line.content,
            });
          }
        }
      }
    }
    return result;
  }
}
