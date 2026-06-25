import OpenAI from "openai";
import type { IAIProvider, AICompletionOptions, AICompletionResult } from "@/infrastructure/ai/IAIProvider";
import { AI_REQUEST_TIMEOUT_MS, MAX_AI_RETRIES } from "@/lib/constants";

export class OpenAIProvider implements IAIProvider {
  readonly providerName = "openai";
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      timeout: AI_REQUEST_TIMEOUT_MS,
      maxRetries: MAX_AI_RETRIES,
    });
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const response = await this.client.chat.completions.create({
      model: options.model,
      messages: options.messages,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.1,
      response_format:
        options.responseFormat === "json_object"
          ? { type: "json_object" }
          : { type: "text" },
    });

    const choice = response.choices[0];
    if (!choice?.message.content) {
      throw new Error("OpenAI returned an empty response");
    }

    return {
      content: choice.message.content,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      model: response.model,
    };
  }
}
