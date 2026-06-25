import type { SupabaseServiceClient } from "@/infrastructure/database/supabase/client";
import type { IRepositoryRepository } from "@/core/repositories/IRepositoryRepository";
import type {
  Repository,
  CreateRepositoryInput,
} from "@/core/entities/Repository";
import { ok, err } from "@/lib/types";
import type { Result } from "@/lib/types";
import type { Database } from "@/infrastructure/database/supabase/database.types";

type Row = Database["public"]["Tables"]["repositories"]["Row"];

function toEntity(row: Row): Repository {
  return {
    id: row.id,
    organizationId: row.organization_id,
    githubRepoId: row.github_repo_id,
    fullName: row.full_name,
    defaultBranch: row.default_branch,
    isPrivate: row.is_private,
    webhookId: row.webhook_id,
    webhookActive: row.webhook_active,
    auditEnabled: row.audit_enabled,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class SupabaseRepositoryRepository implements IRepositoryRepository {
  constructor(private readonly db: SupabaseServiceClient) {}

  async findById(id: string): Promise<Result<Repository | null>> {
    const { data, error } = await this.db
      .from("repositories")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return err(new Error(error.message));
    return ok(data ? toEntity(data) : null);
  }

  async findByOrganizationId(orgId: string): Promise<Result<Repository[]>> {
    const { data, error } = await this.db
      .from("repositories")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) return err(new Error(error.message));
    return ok((data ?? []).map(toEntity));
  }

  async findByGithubRepoId(
    githubRepoId: number
  ): Promise<Result<Repository | null>> {
    const { data, error } = await this.db
      .from("repositories")
      .select("*")
      .eq("github_repo_id", githubRepoId)
      .maybeSingle();
    if (error) return err(new Error(error.message));
    return ok(data ? toEntity(data) : null);
  }

  async create(input: CreateRepositoryInput): Promise<Result<Repository>> {
    const insertData: Database["public"]["Tables"]["repositories"]["Insert"] = {
      organization_id: input.organizationId,
      github_repo_id: input.githubRepoId,
      full_name: input.fullName,
      default_branch: input.defaultBranch,
      is_private: input.isPrivate,
    };
    const { data, error } = await this.db
      .from("repositories")
      .insert(insertData)
      .select()
      .single();
    if (error) return err(new Error(error.message));
    return ok(toEntity(data));
  }

  async update(
    id: string,
    data: Partial<
      Pick<
        Repository,
        "webhookId" | "webhookActive" | "auditEnabled" | "defaultBranch"
      >
    >
  ): Promise<Result<Repository>> {
    const updatePayload: Database["public"]["Tables"]["repositories"]["Update"] =
      { updated_at: new Date().toISOString() };
    if (data.webhookId !== undefined) updatePayload.webhook_id = data.webhookId;
    if (data.webhookActive !== undefined)
      updatePayload.webhook_active = data.webhookActive;
    if (data.auditEnabled !== undefined)
      updatePayload.audit_enabled = data.auditEnabled;
    if (data.defaultBranch !== undefined)
      updatePayload.default_branch = data.defaultBranch;

    const { data: updated, error } = await this.db
      .from("repositories")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();
    if (error) return err(new Error(error.message));
    return ok(toEntity(updated));
  }

  async delete(id: string): Promise<Result<void>> {
    const { error } = await this.db
      .from("repositories")
      .delete()
      .eq("id", id);
    if (error) return err(new Error(error.message));
    return ok(undefined);
  }
}
