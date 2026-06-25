import type { ApiKey } from "@/core/entities/ApiKey";
import type { AIProvider, Result } from "@/lib/types";

export interface IApiKeyRepository {
  findByOrganizationAndProvider(
    orgId: string,
    provider: AIProvider
  ): Promise<Result<ApiKey | null>>;
  findAllByOrganization(orgId: string): Promise<Result<ApiKey[]>>;
  upsert(
    orgId: string,
    provider: AIProvider,
    encryptedKey: string,
    keyHint: string
  ): Promise<Result<ApiKey>>;
  deactivate(id: string): Promise<Result<void>>;
  delete(id: string): Promise<Result<void>>;
}
