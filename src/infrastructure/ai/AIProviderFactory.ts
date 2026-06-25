import type { IAIProvider } from "@/infrastructure/ai/IAIProvider";
import { OpenAIProvider } from "@/infrastructure/ai/providers/OpenAIProvider";
import { AnthropicProvider } from "@/infrastructure/ai/providers/AnthropicProvider";
import type { AIProvider } from "@/lib/types";

export class AIProviderFactory {
  static create(provider: AIProvider, apiKey: string): IAIProvider {
    switch (provider) {
      case "openai":
        return new OpenAIProvider(apiKey);
      case "anthropic":
        return new AnthropicProvider(apiKey);
      default: {
        const _exhaustive: never = provider;
        throw new Error(`Unsupported AI provider: ${String(_exhaustive)}`);
      }
    }
  }
}
