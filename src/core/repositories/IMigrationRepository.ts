import type {
  MigrationJob,
  CreateMigrationJobInput,
  MigrationFile,
} from "@/core/entities/MigrationJob";
import type { MigrationStatus, Result } from "@/lib/types";

export interface IMigrationRepository {
  findById(id: string): Promise<Result<MigrationJob | null>>;
  findByOrganizationId(orgId: string): Promise<Result<MigrationJob[]>>;
  create(input: CreateMigrationJobInput): Promise<Result<MigrationJob>>;
  updateStatus(
    id: string,
    status: MigrationStatus,
    errorMessage?: string
  ): Promise<Result<void>>;
  updateProgress(
    id: string,
    processedFiles: number,
    files: MigrationFile[]
  ): Promise<Result<void>>;
  markCompleted(
    id: string,
    files: MigrationFile[]
  ): Promise<Result<MigrationJob>>;
}
