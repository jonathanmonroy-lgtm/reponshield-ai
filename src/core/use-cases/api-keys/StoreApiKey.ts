import type { IApiKeyRepository } from "@/core/repositories/IApiKeyRepository";
import { validateApiKeyInput, buildKeyHint } from "@/core/entities/ApiKey";
import type { ApiKey, StoreApiKeyInput } from "@/core/entities/ApiKey";
import { err } from "@/lib/types";
import type { Result } from "@/lib/types";

export interface IApiKeyEncryptor {
  encrypt(plaintext: string): Promise<string>;
}

export class StoreApiKeyUseCase {
  constructor(
    private readonly apiKeyRepo: IApiKeyRepository,
    private readonly encryptor: IApiKeyEncryptor
  ) {}

  async execute(input: StoreApiKeyInput): Promise<Result<ApiKey>> {
    const validationError = validateApiKeyInput(input);
    if (validationError) return err(validationError);

    const encryptedKey = await this.encryptor.encrypt(input.plaintextKey);
    const keyHint = buildKeyHint(input.plaintextKey);

    return this.apiKeyRepo.upsert(
      input.organizationId,
      input.provider,
      encryptedKey,
      keyHint
    );
  }
}
