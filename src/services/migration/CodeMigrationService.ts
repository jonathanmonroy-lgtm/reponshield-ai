import type { IAIProvider } from "@/infrastructure/ai/IAIProvider";
import type { IMigrationRepository } from "@/core/repositories/IMigrationRepository";
import type { MigrationJob, MigrationFile } from "@/core/entities/MigrationJob";
import { ASTParser } from "@/services/migration/ASTParser";
import {
  buildMigrationMessages,
  parseMigrationResponse,
} from "@/services/migration/MigrationPromptBuilder";
import { ok, err } from "@/lib/types";
import type { Result } from "@/lib/types";
import { chunkArray } from "@/lib/utils";

const CONCURRENCY = 3;

export class CodeMigrationService {
  private readonly astParser = new ASTParser();

  constructor(
    private readonly provider: IAIProvider,
    private readonly model: string,
    private readonly migrationRepo: IMigrationRepository
  ) {}

  async processJob(jobId: string): Promise<Result<MigrationJob>> {
    const jobResult = await this.migrationRepo.findById(jobId);
    if (!jobResult.success) return jobResult;
    if (!jobResult.data) return err(new Error(`Job ${jobId} not found`));

    const job = jobResult.data;
    await this.migrationRepo.updateStatus(jobId, "processing");

    const processedFiles: MigrationFile[] = [];

    const chunks = chunkArray(job.files, CONCURRENCY);

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map((file) => this.migrateFile(file, job))
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i]!;
        const originalFile = chunk[i]!;

        if (result.status === "fulfilled" && result.value.success) {
          processedFiles.push(result.value.data);
        } else {
          processedFiles.push({
            ...originalFile,
            migratedContent: null,
            testContent: null,
          });
        }
      }

      await this.migrationRepo.updateProgress(
        jobId,
        processedFiles.length,
        processedFiles
      );
    }

    return this.migrationRepo.markCompleted(jobId, processedFiles);
  }

  private async migrateFile(
    file: MigrationFile,
    job: MigrationJob
  ): Promise<Result<MigrationFile>> {
    try {
      const parsed = this.astParser.parse(
        file.originalPath,
        file.originalContent,
        job.sourceLanguage
      );

      const messages = buildMigrationMessages(
        file.originalPath,
        file.originalContent,
        job.sourceLanguage,
        parsed
      );

      const aiResult = await this.provider.complete({
        model: this.model,
        messages,
        maxTokens: 8192,
        temperature: 0.05,
        responseFormat: "json_object",
      });

      const migrationData = parseMigrationResponse(aiResult.content);

      return ok({
        originalPath: file.originalPath,
        originalContent: file.originalContent,
        migratedContent: migrationData.migratedCode,
        testContent: migrationData.testCode,
        dependencies: migrationData.detectedDependencies,
        linesChanged: migrationData.linesChanged,
      });
    } catch (error) {
      return err(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}
