import { beforeEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn();
/** Records which API keys the SDK client was constructed with, so the per-key client cache can be asserted. */
const constructedWithKeys: string[] = [];

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
    constructor(options: { apiKey: string }) {
      constructedWithKeys.push(options.apiKey);
    }
  },
  Type: { OBJECT: "OBJECT", STRING: "STRING" },
}));

let envOverride: { AI_PROVIDER_API_KEY?: string } = {};
vi.mock("@mail-orbyt/config", () => ({
  loadEnv: () => ({
    AI_PROVIDER_MODEL: "test-model",
    AI_MAX_OUTPUT_TOKENS: 600,
    ...envOverride,
  }),
}));

describe("isAiConfigured / getAiEmailGenerator", () => {
  beforeEach(() => {
    vi.resetModules();
    generateContentMock.mockReset();
    envOverride = {};
  });

  it("reports not configured and throws AiNotConfiguredError when no API key is set", async () => {
    envOverride = {};
    const { isAiConfigured, getAiEmailGenerator, AiNotConfiguredError } = await import("./client");
    expect(isAiConfigured()).toBe(false);
    expect(() => getAiEmailGenerator()).toThrow(AiNotConfiguredError);
  });

  it("reports configured when an API key is set", async () => {
    envOverride = { AI_PROVIDER_API_KEY: "test-key" };
    const { isAiConfigured } = await import("./client");
    expect(isAiConfigured()).toBe(true);
  });

  it("returns parsed subject/body from a successful structured-output response", async () => {
    envOverride = { AI_PROVIDER_API_KEY: "test-key" };
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ subject: "Hi", body: "Body text" }),
    });
    const { getAiEmailGenerator } = await import("./client");
    const generator = getAiEmailGenerator();
    const result = await generator.complete({ system: "sys", user: "usr" });
    expect(result).toEqual({ subject: "Hi", body: "Body text" });
  });

  it("wraps a rejected provider call in AiGenerationFailedError", async () => {
    envOverride = { AI_PROVIDER_API_KEY: "test-key" };
    generateContentMock.mockRejectedValueOnce(new Error("network down"));
    const { getAiEmailGenerator, AiGenerationFailedError } = await import("./client");
    const generator = getAiEmailGenerator();
    await expect(generator.complete({ system: "sys", user: "usr" })).rejects.toBeInstanceOf(
      AiGenerationFailedError,
    );
  });

  it("wraps a missing/empty response text in AiGenerationFailedError", async () => {
    envOverride = { AI_PROVIDER_API_KEY: "test-key" };
    generateContentMock.mockResolvedValueOnce({ text: undefined });
    const { getAiEmailGenerator, AiGenerationFailedError } = await import("./client");
    const generator = getAiEmailGenerator();
    await expect(generator.complete({ system: "sys", user: "usr" })).rejects.toBeInstanceOf(
      AiGenerationFailedError,
    );
  });

  it("wraps malformed JSON in AiGenerationFailedError", async () => {
    envOverride = { AI_PROVIDER_API_KEY: "test-key" };
    generateContentMock.mockResolvedValueOnce({ text: "not json" });
    const { getAiEmailGenerator, AiGenerationFailedError } = await import("./client");
    const generator = getAiEmailGenerator();
    await expect(generator.complete({ system: "sys", user: "usr" })).rejects.toBeInstanceOf(
      AiGenerationFailedError,
    );
  });
});

// An organisation can bring its own key and/or pin its own model in Settings;
// anything it leaves unset must still come from the deployment's environment.
describe("per-organisation key/model overrides", () => {
  beforeEach(() => {
    vi.resetModules();
    generateContentMock.mockReset();
    constructedWithKeys.length = 0;
    envOverride = {};
  });

  it("is configured on an organisation key even when the environment has none", async () => {
    envOverride = {};
    const { isAiConfigured } = await import("./client");
    expect(isAiConfigured()).toBe(false);
    expect(isAiConfigured({ apiKey: "org-key" })).toBe(true);
  });

  it("prefers the organisation's key and model over the environment's", async () => {
    envOverride = { AI_PROVIDER_API_KEY: "env-key" };
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ subject: "Hi", body: "Body" }),
    });
    const { getAiEmailGenerator } = await import("./client");
    await getAiEmailGenerator({ apiKey: "org-key", model: "org-model" }).complete({
      system: "sys",
      user: "usr",
    });
    expect(constructedWithKeys).toEqual(["org-key"]);
    expect(generateContentMock.mock.calls[0]?.[0]).toMatchObject({ model: "org-model" });
  });

  it("falls back per-field: an organisation model with no organisation key uses the environment key", async () => {
    envOverride = { AI_PROVIDER_API_KEY: "env-key" };
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ subject: "Hi", body: "Body" }),
    });
    const { getAiEmailGenerator } = await import("./client");
    await getAiEmailGenerator({ model: "org-model" }).complete({ system: "sys", user: "usr" });
    expect(constructedWithKeys).toEqual(["env-key"]);
    expect(generateContentMock.mock.calls[0]?.[0]).toMatchObject({ model: "org-model" });
  });

  // The bug a bare singleton client would cause: whichever organisation
  // generated first would silently authenticate and bill every other one.
  it("builds a separate SDK client per API key, and reuses it for the same key", async () => {
    envOverride = { AI_PROVIDER_API_KEY: "env-key" };
    const { getAiEmailGenerator } = await import("./client");
    getAiEmailGenerator({ apiKey: "org-a" });
    getAiEmailGenerator({ apiKey: "org-b" });
    getAiEmailGenerator({ apiKey: "org-a" });
    expect(constructedWithKeys).toEqual(["org-a", "org-b"]);
  });
});

describe("verifyAiCredentials", () => {
  beforeEach(() => {
    vi.resetModules();
    generateContentMock.mockReset();
    constructedWithKeys.length = 0;
    envOverride = {};
  });

  it("reports ok when the provider answers", async () => {
    generateContentMock.mockResolvedValueOnce({ text: "ok" });
    const { verifyAiCredentials } = await import("./client");
    expect(await verifyAiCredentials({ apiKey: "org-key" })).toEqual({ ok: true });
  });

  it("fails without making a call when no key is available anywhere", async () => {
    const { verifyAiCredentials } = await import("./client");
    const result = await verifyAiCredentials({});
    expect(result.ok).toBe(false);
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  // Settings shows this text verbatim, so an exhausted quota has to read as
  // "your key works, the quota doesn't" rather than "your key is bad".
  it("explains an exhausted quota distinctly from a rejected key", async () => {
    generateContentMock.mockRejectedValueOnce(
      new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'),
    );
    const { verifyAiCredentials } = await import("./client");
    const quota = await verifyAiCredentials({ apiKey: "org-key" });
    expect(quota).toMatchObject({ ok: false });
    expect(quota.ok === false && quota.message).toMatch(/quota is exhausted/i);

    generateContentMock.mockRejectedValueOnce(
      new Error('{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"API_KEY_INVALID"}}'),
    );
    const badKey = await verifyAiCredentials({ apiKey: "nope" });
    expect(badKey.ok === false && badKey.message).toMatch(/rejected by the provider/i);
  });

  it("explains an unknown model", async () => {
    generateContentMock.mockRejectedValueOnce(
      new Error('{"error":{"code":404,"status":"NOT_FOUND"}}'),
    );
    const { verifyAiCredentials } = await import("./client");
    const result = await verifyAiCredentials({ apiKey: "org-key", model: "gemini-nonexistent" });
    expect(result.ok === false && result.message).toMatch(/model wasn't found/i);
  });

  // A retired model 404s with wording that otherwise reads as "you mistyped
  // it", sending the user off to check a model ID that was in fact correct.
  it("distinguishes a retired model from a mistyped one", async () => {
    generateContentMock.mockRejectedValueOnce(
      new Error(
        '{"error":{"code":404,"message":"This model models/gemini-2.5-flash-lite is no longer available to new users.","status":"NOT_FOUND"}}',
      ),
    );
    const { verifyAiCredentials } = await import("./client");
    const result = await verifyAiCredentials({ apiKey: "org-key", model: "gemini-2.5-flash-lite" });
    expect(result.ok === false && result.message).toMatch(/retired by the provider/i);
  });

  // Models that can't disable reasoning reject this pipeline's
  // thinkingBudget: 0 with a bare "Request contains an invalid argument".
  it("explains a model that rejects running with reasoning disabled", async () => {
    generateContentMock.mockRejectedValueOnce(
      new Error(
        '{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}',
      ),
    );
    const { verifyAiCredentials } = await import("./client");
    const result = await verifyAiCredentials({ apiKey: "org-key", model: "gemini-flash-latest" });
    expect(result.ok === false && result.message).toMatch(/reasoning disabled/i);
  });
});
