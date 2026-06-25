import type { MigrationStatus } from "@/lib/types";

export type SourceLanguage = "javascript" | "python" | "php";

export interface MigrationFile {
  originalPath: string;
  originalContent: string;
  migratedContent: string | null;
  testContent: string | null;
  dependencies: string[];
  linesChanged: number;
}

export interface MigrationJob {
  id: string;
  organizationId: string;
  status: MigrationStatus;
  sourceLanguage: SourceLanguage;
  files: MigrationFile[];
  totalFiles: number;
  processedFiles: number;
  aiProvider: string;
  aiModel: string;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface CreateMigrationJobInput {
  organizationId: string;
  sourceLanguage: SourceLanguage;
  files: Array<{ path: string; content: string }>;
  aiProvider: string;
  aiModel: string;
}

export class MigrationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationValidationError";
  }
}

export function validateMigrationInput(
  input: CreateMigrationJobInput
): MigrationValidationError | null {
  if (input.files.length === 0) {
    return new MigrationValidationError("At least one file is required");
  }
  if (input.files.length > 50) {
    return new MigrationValidationError(
      "Maximum 50 files per migration job"
    );
  }

  const oversized = input.files.find(
    (f) => f.content.length > 500_000
  );
  if (oversized) {
    return new MigrationValidationError(
      `File ${oversized.path} exceeds 500KB limit`
    );
  }

  return null;
}

export function migrationProgress(job: MigrationJob): number {
  if (job.totalFiles === 0) return 0;
  return Math.round((job.processedFiles / job.totalFiles) * 100);
}
