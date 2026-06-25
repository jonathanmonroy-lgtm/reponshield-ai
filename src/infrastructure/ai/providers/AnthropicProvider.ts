import Anthropic from "@anthropic-ai/sdk";
import type { IAIProvider, AICompletionOptions, AICompletionResult } from "@/infrastructure/ai/IAIProvider";
import { AI_REQUEST_TIMEOUT_MS } from "@/lib/constants";

export class AnthropicProvider implements IAIProvider {
  readonly providerName = "anthropic";
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({
      apiKey,
      timeout: AI_REQUEST_TIMEOUT_MS,
      maxRetries: 3,
    });
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const systemMessage = options.messages.find((m) => m.role === "system");
    const userMessages = options.messages.filter((m) => m.role !== "system");

    if (userMessages.length === 0) {
      throw new Error("Anthropic requires at least one user message");
    }

    const response = await this.client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.1,
      system: systemMessage?.content,
      messages: userMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Anthropic returned no text content");
    }

    return {
      content: textBlock.text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
    };
  }
}
