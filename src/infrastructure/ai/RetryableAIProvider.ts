import type {
  IAIProvider,
  AICompletionOptions,
  AICompletionResult,
} from "@/infrastructure/ai/IAIProvider";
import { MAX_AI_RETRIES, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS } from "@/lib/constants";

// Retryable error classes from the provider SDKs surface status codes as a
// `.status` or `.statusCode` property on the thrown Error instance.
type StatusError = Error & { status?: number; statusCode?: number };

function isRetryable(error: Error): boolean {
  const msg = error.message.toLowerCase();

  if (
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("too many requests")
  )
    return true;

  if (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("etimedout")
  )
    return true;

  if (
    msg.includes("fetch failed") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused")
  )
    return true;

  const status =
    (error as StatusError).status ?? (error as StatusError).statusCode;
  return status === 429 || status === 502 || status === 503;
}

function backoffMs(attempt: number): number {
  const base = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
  const capped = Math.min(base, RETRY_MAX_DELAY_MS);
  const jitter = (Math.random() - 0.5) * 400; // ±200 ms to prevent thundering herd
  return Math.max(0, capped + jitter);
}

export class RetryableAIProvider implements IAIProvider {
  readonly providerName: string;

  constructor(
    private readonly inner: IAIProvider,
    private readonly maxRetries: number = MAX_AI_RETRIES,
    // Injecting sleep allows tests to skip real delays without fake timers.
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms))
  ) {
    this.providerName = inner.providerName;
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    let lastError: Error = new Error("No attempts made");

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.inner.complete(options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const exhausted = attempt === this.maxRetries;
        if (!isRetryable(lastError) || exhausted) {
          throw lastError;
        }

        await this.sleep(backoffMs(attempt));
      }
    }

    // Unreachable — the loop always throws or returns before here.
    throw lastError;
  }
}
