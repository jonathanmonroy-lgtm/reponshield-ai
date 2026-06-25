import type { SupabaseServiceClient } from "@/infrastructure/database/supabase/client";
import type { IApiKeyRepository } from "@/core/repositories/IApiKeyRepository";
import type { ApiKey } from "@/core/entities/ApiKey";
import { ok, err } from "@/lib/types";
import type { AIProvider, Result } from "@/lib/types";
import type { Database } from "@/infrastructure/database/supabase/database.types";

type Row = Database["public"]["Tables"]["api_keys"]["Row"];

function toEntity(row: Row): ApiKey {
  return {
    id: row.id,
    organizationId: row.organization_id,
    provider: row.provider as AIProvider,
    encryptedKey: row.encrypted_key,
    keyHint: row.key_hint,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class SupabaseApiKeyRepository implements IApiKeyRepository {
  constructor(private readonly db: SupabaseServiceClient) {}

  async findByOrganizationAndProvider(
    orgId: string,
    provider: AIProvider
  ): Promise<Result<ApiKey | null>> {
    const { data, error } = await this.db
      .from("api_keys")
      .select("*")
      .eq("organization_id", orgId)
      .eq("provider", provider)
      .eq("is_active", true)
      .maybeSingle();
    if (error) return err(new Error(error.message));
    return ok(data ? toEntity(data) : null);
  }

  async findAllByOrganization(orgId: string): Promise<Result<ApiKey[]>> {
    const { data, error } = await this.db
      .from("api_keys")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) return err(new Error(error.message));
    return ok((data ?? []).map(toEntity));
  }

  async upsert(
    orgId: string,
    provider: AIProvider,
    encryptedKey: string,
    keyHint: string
  ): Promise<Result<ApiKey>> {
    const upsertData: Database["public"]["Tables"]["api_keys"]["Insert"] = {
      organization_id: orgId,
      provider,
      encrypted_key: encryptedKey,
      key_hint: keyHint,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.db
      .from("api_keys")
      .upsert(upsertData, { onConflict: "organization_id,provider" })
      .select()
      .single();

    if (error) return err(new Error(error.message));
    return ok(toEntity(data));
  }

  async deactivate(id: string): Promise<Result<void>> {
    const updateData: Database["public"]["Tables"]["api_keys"]["Update"] = {
      is_active: false,
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.db
      .from("api_keys")
      .update(updateData)
      .eq("id", id);
    if (error) return err(new Error(error.message));
    return ok(undefined);
  }

  async delete(id: string): Promise<Result<void>> {
    const { error } = await this.db.from("api_keys").delete().eq("id", id);
    if (error) return err(new Error(error.message));
    return ok(undefined);
  }
}
