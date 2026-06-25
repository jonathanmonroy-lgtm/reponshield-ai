import type { SupabaseServiceClient } from "@/infrastructure/database/supabase/client";
import type { IOrganizationRepository } from "@/core/repositories/IOrganizationRepository";
import type {
  Organization,
  CreateOrganizationInput,
} from "@/core/entities/Organization";
import { ok, err } from "@/lib/types";
import type { Result } from "@/lib/types";
import type { AIProvider } from "@/lib/types";
import type { Database } from "@/infrastructure/database/supabase/database.types";

type Row = Database["public"]["Tables"]["organizations"]["Row"];
type MemberInsert = Database["public"]["Tables"]["organization_members"]["Insert"];

function toEntity(row: Row): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    githubInstallationId: row.github_installation_id,
    preferredAiProvider: row.preferred_ai_provider as AIProvider,
    preferredAiModel: row.preferred_ai_model,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class SupabaseOrganizationRepository
  implements IOrganizationRepository
{
  constructor(private readonly db: SupabaseServiceClient) {}

  async findById(id: string): Promise<Result<Organization | null>> {
    const { data, error } = await this.db
      .from("organizations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return err(new Error(error.message));
    return ok(data ? toEntity(data) : null);
  }

  async findBySlug(slug: string): Promise<Result<Organization | null>> {
    const { data, error } = await this.db
      .from("organizations")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return err(new Error(error.message));
    return ok(data ? toEntity(data) : null);
  }

  async findByUserId(userId: string): Promise<Result<Organization[]>> {
    const { data: memberData, error: memberError } = await this.db
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId);
    if (memberError) return err(new Error(memberError.message));

    const orgIds = (memberData ?? []).map((m) => m.organization_id);
    if (orgIds.length === 0) return ok([]);

    const { data, error } = await this.db
      .from("organizations")
      .select("*")
      .in("id", orgIds);
    if (error) return err(new Error(error.message));

    return ok((data ?? []).map(toEntity));
  }

  async create(
    input: CreateOrganizationInput,
    userId: string
  ): Promise<Result<Organization>> {
    const { data: org, error: orgError } = await this.db
      .from("organizations")
      .insert({
        name: input.name,
        slug: input.slug,
        preferred_ai_provider: input.preferredAiProvider ?? "openai",
        preferred_ai_model: input.preferredAiModel ?? "gpt-4o-mini",
      })
      .select()
      .single();

    if (orgError) return err(new Error(orgError.message));

    const memberInsert: MemberInsert = {
      organization_id: org.id,
      user_id: userId,
      role: "owner",
    };
    await this.db.from("organization_members").insert(memberInsert);

    return ok(toEntity(org));
  }

  async update(
    id: string,
    data: Partial<
      Pick<
        Organization,
        | "name"
        | "githubInstallationId"
        | "preferredAiProvider"
        | "preferredAiModel"
      >
    >
  ): Promise<Result<Organization>> {
    const updatePayload: Database["public"]["Tables"]["organizations"]["Update"] =
      {};
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.githubInstallationId !== undefined)
      updatePayload.github_installation_id = data.githubInstallationId;
    if (data.preferredAiProvider !== undefined)
      updatePayload.preferred_ai_provider = data.preferredAiProvider;
    if (data.preferredAiModel !== undefined)
      updatePayload.preferred_ai_model = data.preferredAiModel;
    updatePayload.updated_at = new Date().toISOString();

    const { data: updated, error } = await this.db
      .from("organizations")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) return err(new Error(error.message));
    return ok(toEntity(updated));
  }

  async delete(id: string): Promise<Result<void>> {
    const { error } = await this.db
      .from("organizations")
      .delete()
      .eq("id", id);
    if (error) return err(new Error(error.message));
    return ok(undefined);
  }
}
