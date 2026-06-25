import type { IApiKeyRepository } from "@/core/repositories/IApiKeyRepository";
import type { AIProvider, Result } from "@/lib/types";
import { err, ok } from "@/lib/types";

export interface IApiKeyDecryptor {
  decrypt(ciphertext: string): Promise<string>;
}

export class GetDecryptedApiKeyUseCase {
  constructor(
    private readonly apiKeyRepo: IApiKeyRepository,
    private readonly decryptor: IApiKeyDecryptor
  ) {}

  async execute(
    orgId: string,
    provider: AIProvider
  ): Promise<Result<string>> {
    const result = await this.apiKeyRepo.findByOrganizationAndProvider(
      orgId,
      provider
    );
    if (!result.success) return result;
    if (!result.data) {
      return err(
        new Error(
          `No active ${provider} API key found for organization`
        )
      );
    }
    if (!result.data.isActive) {
      return err(new Error(`${provider} API key is deactivated`));
    }

    const plaintext = await this.decryptor.decrypt(result.data.encryptedKey);
    return ok(plaintext);
  }
}
