import { describe, it, expect, vi } from "vitest";
import { RetryableAIProvider } from "@/infrastructure/ai/RetryableAIProvider";
import type {
  IAIProvider,
  AICompletionOptions,
  AICompletionResult,
} from "@/infrastructure/ai/IAIProvider";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUCCESS_RESULT: AICompletionResult = {
  content: '{"findings":[]}',
  inputTokens: 100,
  outputTokens: 50,
  model: "gpt-4o",
};

const DUMMY_OPTIONS: AICompletionOptions = {
  model: "gpt-4o",
  messages: [{ role: "user", content: "analyze this diff" }],
};

// Injecting a no-op sleep avoids real delays in tests.
const noSleep = () => Promise.resolve();

// ── Error factories ───────────────────────────────────────────────────────────

function makeRateLimitError(): Error {
  const e = new Error("Rate limit exceeded — 429 Too Many Requests");
  (e as Error & { status: number }).status = 429;
  return e;
}

function makeTimeoutError(): Error {
  return new Error("Request timed out after 60000ms");
}

function makeNetworkError(): Error {
  return new Error("fetch failed: ECONNRESET");
}

function makeAuthError(): Error {
  const e = new Error("Invalid API key: Unauthorized");
  (e as Error & { status: number }).status = 401;
  return e;
}

// ── Mock inner provider ───────────────────────────────────────────────────────
// Each element in `calls` is either a result value (resolves) or an Error (rejects).

function makeInner(calls: Array<Error | AICompletionResult>): IAIProvider {
  let i = 0;
  const mock = vi.fn().mockImplementation(() => {
    const item = calls[i++];
    if (item instanceof Error) return Promise.reject(item);
    return Promise.resolve(item ?? SUCCESS_RESULT);
  });
  return { providerName: "openai", complete: mock };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RetryableAIProvider — successful calls", () => {
  it("returns the inner provider result on the first attempt", async () => {
    const inner = makeInner([SUCCESS_RESULT]);
    const provider = new RetryableAIProvider(inner, 3, noSleep);
    const result = await provider.complete(DUMMY_OPTIONS);
    expect(result).toEqual(SUCCESS_RESULT);
    expect(vi.mocked(inner.complete)).toHaveBeenCalledOnce();
  });

  it("inherits providerName from the inner provider", () => {
    const inner = makeInner([SUCCESS_RESULT]);
    expect(new RetryableAIProvider(inner, 3, noSleep).providerName).toBe("openai");
  });
});

describe("RetryableAIProvider — retry on transient errors", () => {
  it("retries on rate-limit (429) and succeeds on the second attempt", async () => {
    const inner = makeInner([makeRateLimitError(), SUCCESS_RESULT]);
    const provider = new RetryableAIProvider(inner, 3, noSleep);
    const result = await provider.complete(DUMMY_OPTIONS);
    expect(result).toEqual(SUCCESS_RESULT);
    expect(vi.mocked(inner.complete)).toHaveBeenCalledTimes(2);
  });

  it("retries on timeout error and succeeds on the third attempt", async () => {
    const inner = makeInner([
      makeTimeoutError(),
      makeTimeoutError(),
      SUCCESS_RESULT,
    ]);
    const provider = new RetryableAIProvider(inner, 3, noSleep);
    const result = await provider.complete(DUMMY_OPTIONS);
    expect(result).toEqual(SUCCESS_RESULT);
    expect(vi.mocked(inner.complete)).toHaveBeenCalledTimes(3);
  });

  it("retries on network error (ECONNRESET)", async () => {
    const inner = makeInner([makeNetworkError(), SUCCESS_RESULT]);
    const provider = new RetryableAIProvider(inner, 3, noSleep);
    const result = await provider.complete(DUMMY_OPTIONS);
    expect(result).toEqual(SUCCESS_RESULT);
    expect(vi.mocked(inner.complete)).toHaveBeenCalledTimes(2);
  });

  it("calls the sleep function between retry attempts", async () => {
    const sleepSpy = vi.fn(() => Promise.resolve());
    const inner = makeInner([makeRateLimitError(), SUCCESS_RESULT]);
    const provider = new RetryableAIProvider(inner, 3, sleepSpy);
    await provider.complete(DUMMY_OPTIONS);
    expect(sleepSpy).toHaveBeenCalledOnce();
  });

  it("calls sleep N times for N retries before a successful attempt", async () => {
    const sleepSpy = vi.fn(() => Promise.resolve());
    const inner = makeInner([
      makeRateLimitError(),
      makeRateLimitError(),
      SUCCESS_RESULT,
    ]);
    const provider = new RetryableAIProvider(inner, 3, sleepSpy);
    await provider.complete(DUMMY_OPTIONS);
    expect(sleepSpy).toHaveBeenCalledTimes(2);
  });
});

describe("RetryableAIProvider — non-retryable errors", () => {
  it("does NOT retry on auth error (401) and throws immediately", async () => {
    const inner = makeInner([makeAuthError()]);
    const provider = new RetryableAIProvider(inner, 3, noSleep);
    await expect(provider.complete(DUMMY_OPTIONS)).rejects.toThrow("Invalid API key");
    expect(vi.mocked(inner.complete)).toHaveBeenCalledOnce();
  });

  it("does NOT retry on a generic model error (no status, no network keywords)", async () => {
    const inner = makeInner([new Error("Model context length exceeded")]);
    const provider = new RetryableAIProvider(inner, 3, noSleep);
    await expect(provider.complete(DUMMY_OPTIONS)).rejects.toThrow("context length");
    expect(vi.mocked(inner.complete)).toHaveBeenCalledOnce();
  });
});

describe("RetryableAIProvider — exhausting retries", () => {
  it("throws the last error after 1 original + 3 retry attempts (4 total)", async () => {
    const inner = makeInner([
      makeRateLimitError(),
      makeRateLimitError(),
      makeRateLimitError(),
      makeRateLimitError(),
    ]);
    const provider = new RetryableAIProvider(inner, 3, noSleep);
    await expect(provider.complete(DUMMY_OPTIONS)).rejects.toThrow("429");
    expect(vi.mocked(inner.complete)).toHaveBeenCalledTimes(4);
  });

  it("respects maxRetries=0: throws on the very first failure without sleeping", async () => {
    const sleepSpy = vi.fn(() => Promise.resolve());
    const inner = makeInner([makeRateLimitError()]);
    const provider = new RetryableAIProvider(inner, 0, sleepSpy);
    await expect(provider.complete(DUMMY_OPTIONS)).rejects.toThrow("429");
    expect(vi.mocked(inner.complete)).toHaveBeenCalledOnce();
    expect(sleepSpy).not.toHaveBeenCalled();
  });

  it("retries on 502/503 status codes (upstream gateway errors)", async () => {
    const gatewayError = new Error("Bad Gateway");
    (gatewayError as Error & { status: number }).status = 502;
    const inner = makeInner([gatewayError, SUCCESS_RESULT]);
    const provider = new RetryableAIProvider(inner, 3, noSleep);
    const result = await provider.complete(DUMMY_OPTIONS);
    expect(result).toEqual(SUCCESS_RESULT);
    expect(vi.mocked(inner.complete)).toHaveBeenCalledTimes(2);
  });
});
