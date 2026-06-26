import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GeminiAIProvider } from "@/infrastructure/ai/providers/GeminiAIProvider";
import type { AICompletionOptions } from "@/infrastructure/ai/IAIProvider";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const API_KEY = "test-gemini-key";

const BASE_OPTIONS: AICompletionOptions = {
  model: "gemini-2.5-flash",
  messages: [{ role: "user", content: "Analyze this diff" }],
};

const OPTIONS_WITH_SYSTEM: AICompletionOptions = {
  model: "gemini-2.5-flash",
  messages: [
    { role: "system", content: "You are a code reviewer." },
    { role: "user", content: "Analyze this diff" },
  ],
};

const OPTIONS_WITH_HISTORY: AICompletionOptions = {
  model: "gemini-2.5-flash",
  messages: [
    { role: "user", content: "First question" },
    { role: "assistant", content: "First answer" },
    { role: "user", content: "Follow-up question" },
  ],
};

const GEMINI_SUCCESS_RESPONSE = {
  candidates: [
    {
      content: {
        parts: [{ text: '{"findings":[]}' }],
        role: "model",
      },
      finishReason: "STOP",
    },
  ],
  usageMetadata: {
    promptTokenCount: 120,
    candidatesTokenCount: 45,
  },
  modelVersion: "gemini-2.5-flash-001",
};

function makeOkFetch(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

function makeErrorFetch(status: number, errorBody: string): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(errorBody),
    json: () => Promise.resolve({ error: errorBody }),
  } as Response);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal("fetch", makeOkFetch(GEMINI_SUCCESS_RESPONSE));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GeminiAIProvider — providerName", () => {
  it('exposes providerName as "gemini"', () => {
    expect(new GeminiAIProvider(API_KEY).providerName).toBe("gemini");
  });
});

describe("GeminiAIProvider — successful completions", () => {
  it("returns parsed content with token counts from usageMetadata", async () => {
    const provider = new GeminiAIProvider(API_KEY);
    const result = await provider.complete(BASE_OPTIONS);

    expect(result.content).toBe('{"findings":[]}');
    expect(result.inputTokens).toBe(120);
    expect(result.outputTokens).toBe(45);
    expect(result.model).toBe("gemini-2.5-flash-001");
  });

  it("calls the correct Gemini endpoint with the model and API key", async () => {
    const fetchSpy = makeOkFetch(GEMINI_SUCCESS_RESPONSE);
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new GeminiAIProvider(API_KEY);
    await provider.complete(BASE_OPTIONS);

    const [url] = vi.mocked(fetchSpy).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("gemini-2.5-flash:generateContent");
    expect(url).toContain(`key=${API_KEY}`);
  });

  it("sends Content-Type: application/json header", async () => {
    const fetchSpy = makeOkFetch(GEMINI_SUCCESS_RESPONSE);
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new GeminiAIProvider(API_KEY);
    await provider.complete(BASE_OPTIONS);

    const [, init] = vi.mocked(fetchSpy).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("maps system message to systemInstruction and excludes it from contents", async () => {
    const fetchSpy = makeOkFetch(GEMINI_SUCCESS_RESPONSE);
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new GeminiAIProvider(API_KEY);
    await provider.complete(OPTIONS_WITH_SYSTEM);

    const [, init] = vi.mocked(fetchSpy).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      contents: unknown[];
      systemInstruction: { parts: [{ text: string }] };
    };

    expect(body.systemInstruction?.parts[0]?.text).toBe("You are a code reviewer.");
    expect(body.contents).toHaveLength(1);
  });

  it('maps assistant role to "model" role in contents', async () => {
    const fetchSpy = makeOkFetch(GEMINI_SUCCESS_RESPONSE);
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new GeminiAIProvider(API_KEY);
    await provider.complete(OPTIONS_WITH_HISTORY);

    const [, init] = vi.mocked(fetchSpy).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      contents: Array<{ role: string; parts: unknown[] }>;
    };

    expect(body.contents[1].role).toBe("model");
  });

  it('uses "text/plain" responseMimeType by default', async () => {
    const fetchSpy = makeOkFetch(GEMINI_SUCCESS_RESPONSE);
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new GeminiAIProvider(API_KEY);
    await provider.complete(BASE_OPTIONS);

    const [, init] = vi.mocked(fetchSpy).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      generationConfig: { responseMimeType: string };
    };

    expect(body.generationConfig.responseMimeType).toBe("text/plain");
  });

  it('uses "application/json" responseMimeType when responseFormat is json_object', async () => {
    const fetchSpy = makeOkFetch(GEMINI_SUCCESS_RESPONSE);
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new GeminiAIProvider(API_KEY);
    await provider.complete({ ...BASE_OPTIONS, responseFormat: "json_object" });

    const [, init] = vi.mocked(fetchSpy).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      generationConfig: { responseMimeType: string };
    };

    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("passes maxTokens and temperature to generationConfig", async () => {
    const fetchSpy = makeOkFetch(GEMINI_SUCCESS_RESPONSE);
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new GeminiAIProvider(API_KEY);
    await provider.complete({ ...BASE_OPTIONS, maxTokens: 2048, temperature: 0.5 });

    const [, init] = vi.mocked(fetchSpy).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      generationConfig: { maxOutputTokens: number; temperature: number };
    };

    expect(body.generationConfig.maxOutputTokens).toBe(2048);
    expect(body.generationConfig.temperature).toBe(0.5);
  });

  it("falls back to options.model when modelVersion is absent in response", async () => {
    const responseWithoutVersion = {
      ...GEMINI_SUCCESS_RESPONSE,
      modelVersion: undefined,
    };
    vi.stubGlobal("fetch", makeOkFetch(responseWithoutVersion));

    const provider = new GeminiAIProvider(API_KEY);
    const result = await provider.complete(BASE_OPTIONS);

    expect(result.model).toBe("gemini-2.5-flash");
  });
});

describe("GeminiAIProvider — error handling", () => {
  it("throws with status code on non-2xx HTTP response", async () => {
    vi.stubGlobal("fetch", makeErrorFetch(429, "Rate limit exceeded"));

    const provider = new GeminiAIProvider(API_KEY);
    const error = await provider.complete(BASE_OPTIONS).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("429");
    expect((error as Error & { status: number }).status).toBe(429);
  });

  it("throws on 401 unauthorized", async () => {
    vi.stubGlobal("fetch", makeErrorFetch(401, "API key not valid"));

    const provider = new GeminiAIProvider(API_KEY);
    await expect(provider.complete(BASE_OPTIONS)).rejects.toThrow("401");
  });

  it("throws when candidates array is empty", async () => {
    vi.stubGlobal(
      "fetch",
      makeOkFetch({ ...GEMINI_SUCCESS_RESPONSE, candidates: [] })
    );

    const provider = new GeminiAIProvider(API_KEY);
    await expect(provider.complete(BASE_OPTIONS)).rejects.toThrow(
      "Gemini returned no text content"
    );
  });

  it("throws when message list has only system messages", async () => {
    const provider = new GeminiAIProvider(API_KEY);
    await expect(
      provider.complete({
        ...BASE_OPTIONS,
        messages: [{ role: "system", content: "system only" }],
      })
    ).rejects.toThrow("Gemini requires at least one user message");
  });
});

describe("GeminiAIProvider — AIProviderFactory integration", () => {
  it('is instantiated by AIProviderFactory for provider "gemini"', async () => {
    const { AIProviderFactory } = await import("@/infrastructure/ai/AIProviderFactory");
    const provider = AIProviderFactory.create("gemini", API_KEY);
    expect(provider.providerName).toBe("gemini");
  });
});
