export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AICompletionOptions {
  model: string;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "text" | "json_object";
}

export interface AICompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface IAIProvider {
  readonly providerName: string;
  complete(options: AICompletionOptions): Promise<AICompletionResult>;
}
