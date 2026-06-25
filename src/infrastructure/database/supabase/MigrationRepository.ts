import type { SupabaseServiceClient } from "@/infrastructure/database/supabase/client";
import type { IMigrationRepository } from "@/core/repositories/IMigrationRepository";
import type {
  MigrationJob,
  MigrationFile,
  CreateMigrationJobInput,
} from "@/core/entities/MigrationJob";
import { ok, err } from "@/lib/types";
import type { MigrationStatus, Result } from "@/lib/types";
import type { Database } from "@/infrastructure/database/supabase/database.types";

type Row = Database["public"]["Tables"]["migration_jobs"]["Row"];

function toEntity(row: Row): MigrationJob {
  return {
    id: row.id,
    organizationId: row.organization_id,
    status: row.status as MigrationStatus,
    sourceLanguage: row.source_language as MigrationJob["sourceLanguage"],
    files: (row.files as MigrationFile[]) ?? [],
    totalFiles: row.total_files,
    processedFiles: row.processed_files,
    aiProvider: row.ai_provider,
    aiModel: row.ai_model,
    errorMessage: row.error_message,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    createdAt: new Date(row.created_at),
  };
}

export class SupabaseMigrationRepository implements IMigrationRepository {
  constructor(private readonly db: SupabaseServiceClient) {}

  async findById(id: string): Promise<Result<MigrationJob | null>> {
    const { data, error } = await this.db
      .from("migration_jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return err(new Error(error.message));
    return ok(data ? toEntity(data) : null);
  }

  async findByOrganizationId(orgId: string): Promise<Result<MigrationJob[]>> {
    const { data, error } = await this.db
      .from("migration_jobs")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) return err(new Error(error.message));
    return ok((data ?? []).map(toEntity));
  }

  async create(
    input: CreateMigrationJobInput
  ): Promise<Result<MigrationJob>> {
    const files: MigrationFile[] = input.files.map((f) => ({
      originalPath: f.path,
      originalContent: f.content,
      migratedContent: null,
      testContent: null,
      dependencies: [],
      linesChanged: 0,
    }));

    const insertData: Database["public"]["Tables"]["migration_jobs"]["Insert"] =
      {
        organization_id: input.organizationId,
        status: "pending",
        source_language: input.sourceLanguage,
        files: files as unknown,
        total_files: input.files.length,
        processed_files: 0,
        ai_provider: input.aiProvider,
        ai_model: input.aiModel,
      };

    const { data, error } = await this.db
      .from("migration_jobs")
      .insert(insertData)
      .select()
      .single();
    if (error) return err(new Error(error.message));
    return ok(toEntity(data));
  }

  async updateStatus(
    id: string,
    status: MigrationStatus,
    errorMessage?: string
  ): Promise<Result<void>> {
    const updatePayload: Database["public"]["Tables"]["migration_jobs"]["Update"] =
      { status };
    if (errorMessage) updatePayload.error_message = errorMessage;
    if (status === "processing")
      updatePayload.started_at = new Date().toISOString();

    const { error } = await this.db
      .from("migration_jobs")
      .update(updatePayload)
      .eq("id", id);
    if (error) return err(new Error(error.message));
    return ok(undefined);
  }

  async updateProgress(
    id: string,
    processedFiles: number,
    files: MigrationFile[]
  ): Promise<Result<void>> {
    const updatePayload: Database["public"]["Tables"]["migration_jobs"]["Update"] =
      {
        processed_files: processedFiles,
        files: files as unknown,
      };
    const { error } = await this.db
      .from("migration_jobs")
      .update(updatePayload)
      .eq("id", id);
    if (error) return err(new Error(error.message));
    return ok(undefined);
  }

  async markCompleted(
    id: string,
    files: MigrationFile[]
  ): Promise<Result<MigrationJob>> {
    const updatePayload: Database["public"]["Tables"]["migration_jobs"]["Update"] =
      {
        status: "completed",
        files: files as unknown,
        processed_files: files.length,
        completed_at: new Date().toISOString(),
      };
    const { data, error } = await this.db
      .from("migration_jobs")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();
    if (error) return err(new Error(error.message));
    return ok(toEntity(data));
  }
}
