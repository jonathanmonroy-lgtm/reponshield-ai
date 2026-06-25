import type { AIProvider } from "@/lib/types";

export interface ApiKey {
  id: string;
  organizationId: string;
  provider: AIProvider;
  encryptedKey: string;
  keyHint: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreApiKeyInput {
  organizationId: string;
  provider: AIProvider;
  plaintextKey: string;
}

export class ApiKeyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyValidationError";
  }
}

export function validateApiKeyInput(
  input: StoreApiKeyInput
): ApiKeyValidationError | null {
  if (!input.plaintextKey.trim()) {
    return new ApiKeyValidationError("API key cannot be empty");
  }
  if (input.provider === "openai" && !input.plaintextKey.startsWith("sk-")) {
    return new ApiKeyValidationError(
      "OpenAI API key must start with 'sk-'"
    );
  }
  if (
    input.provider === "anthropic" &&
    !input.plaintextKey.startsWith("sk-ant-")
  ) {
    return new ApiKeyValidationError(
      "Anthropic API key must start with 'sk-ant-'"
    );
  }
  return null;
}

export function buildKeyHint(plaintextKey: string): string {
  if (plaintextKey.length <= 8) return "****";
  return `${plaintextKey.slice(0, 7)}...${plaintextKey.slice(-4)}`;
}
