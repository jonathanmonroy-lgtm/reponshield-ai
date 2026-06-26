import type { IAIProvider, AICompletionOptions, AICompletionResult } from "@/infrastructure/ai/IAIProvider";
import { AI_REQUEST_TIMEOUT_MS } from "@/lib/constants";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiPart[] };
  generationConfig: {
    maxOutputTokens: number;
    temperature: number;
    responseMimeType: string;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: { parts: GeminiPart[]; role: string };
    finishReason: string;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
  };
  modelVersion: string;
}

export class GeminiAIProvider implements IAIProvider {
  readonly providerName = "gemini";

  constructor(private readonly apiKey: string) {}

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const systemMessage = options.messages.find((m) => m.role === "system");
    const conversationMessages = options.messages.filter((m) => m.role !== "system");

    if (conversationMessages.length === 0) {
      throw new Error("Gemini requires at least one user message");
    }

    const contents: GeminiContent[] = conversationMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const body: GeminiRequest = {
      contents,
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.1,
        responseMimeType:
          options.responseFormat === "json_object" ? "application/json" : "text/plain",
      },
    };

    if (systemMessage) {
      body.systemInstruction = { parts: [{ text: systemMessage.content }] };
    }

    const url = `${GEMINI_API_BASE}/${options.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(`Gemini API error ${response.status}: ${errorText}`);
      (error as Error & { status: number }).status = response.status;
      throw error;
    }

    const data = (await response.json()) as GeminiResponse;

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini returned no text content");
    }

    return {
      content: text,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      model: data.modelVersion ?? options.model,
    };
  }
}
