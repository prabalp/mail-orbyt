import { beforeEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
    constructor() {}
  },
  Type: { OBJECT: "OBJECT", STRING: "STRING", ARRAY: "ARRAY" },
}));

let envOverride: { AI_PROVIDER_API_KEY?: string } = {};
vi.mock("@mail-orbyt/config", () => ({
  loadEnv: () => ({
    AI_PROVIDER_MODEL: "test-model",
    AI_MAX_OUTPUT_TOKENS: 600,
    ...envOverride,
  }),
}));

const SAMPLE_TEXT = "Acme Corp builds widgets and gadgets for the modern factory floor.";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(body) } as Response;
}

describe("extractKeywordsWithAi (Gemini)", () => {
  beforeEach(() => {
    vi.resetModules();
    generateContentMock.mockReset();
    envOverride = {};
  });

  it("throws AiNotConfiguredError when no key is available", async () => {
    const { extractKeywordsWithAi, AiNotConfiguredError } = await import("./client");
    await expect(extractKeywordsWithAi(SAMPLE_TEXT)).rejects.toBeInstanceOf(AiNotConfiguredError);
  });

  it("keeps only keywords that literally occur in the source text", async () => {
    envOverride = { AI_PROVIDER_API_KEY: "env-key" };
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ keywords: ["widgets", "gadgets", "spaceships"] }),
    });
    const { extractKeywordsWithAi } = await import("./client");
    const result = await extractKeywordsWithAi(SAMPLE_TEXT);
    expect(result.map((r) => r.keyword)).toEqual(["widgets", "gadgets"]);
  });
});

describe("extractKeywordsWithAi (OpenAI-compatible custom provider)", () => {
  const OPENAI_OVERRIDE = {
    kind: "OPENAI_COMPATIBLE" as const,
    apiKey: "sk-custom",
    model: "llama-3.1-70b",
    baseUrl: "https://api.custom-llm.example/v1",
  };

  beforeEach(() => {
    vi.resetModules();
    envOverride = {};
  });

  it("is not configured without a base URL", async () => {
    const { isAiConfigured } = await import("./client");
    expect(isAiConfigured({ kind: "OPENAI_COMPATIBLE", apiKey: "sk", model: "m" })).toBe(false);
  });

  it("posts to {baseUrl}/chat/completions and grounds keywords against the source text", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        choices: [
          { message: { content: JSON.stringify({ keywords: ["widgets", "not-present"] }) } },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { extractKeywordsWithAi } = await import("./client");

    const result = await extractKeywordsWithAi(SAMPLE_TEXT, OPENAI_OVERRIDE);

    expect(result.map((r) => r.keyword)).toEqual(["widgets"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.custom-llm.example/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-custom" }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("wraps a non-2xx response in AiKeywordExtractionFailedError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({}, false, 401)));
    const { extractKeywordsWithAi, AiKeywordExtractionFailedError } = await import("./client");

    await expect(extractKeywordsWithAi(SAMPLE_TEXT, OPENAI_OVERRIDE)).rejects.toBeInstanceOf(
      AiKeywordExtractionFailedError,
    );
    vi.unstubAllGlobals();
  });
});
