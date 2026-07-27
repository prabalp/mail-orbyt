import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMock };
  },
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
    createMock.mockReset();
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

  it("returns parsed subject/body from a successful tool_use response", async () => {
    envOverride = { AI_PROVIDER_API_KEY: "test-key" };
    createMock.mockResolvedValueOnce({
      content: [{ type: "tool_use", input: { subject: "Hi", body: "Body text" } }],
    });
    const { getAiEmailGenerator } = await import("./client");
    const generator = getAiEmailGenerator();
    const result = await generator.complete({ system: "sys", user: "usr" });
    expect(result).toEqual({ subject: "Hi", body: "Body text" });
  });

  it("wraps a rejected provider call in AiGenerationFailedError", async () => {
    envOverride = { AI_PROVIDER_API_KEY: "test-key" };
    createMock.mockRejectedValueOnce(new Error("network down"));
    const { getAiEmailGenerator, AiGenerationFailedError } = await import("./client");
    const generator = getAiEmailGenerator();
    await expect(generator.complete({ system: "sys", user: "usr" })).rejects.toBeInstanceOf(
      AiGenerationFailedError,
    );
  });

  it("wraps a missing tool_use block in AiGenerationFailedError", async () => {
    envOverride = { AI_PROVIDER_API_KEY: "test-key" };
    createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "oops" }] });
    const { getAiEmailGenerator, AiGenerationFailedError } = await import("./client");
    const generator = getAiEmailGenerator();
    await expect(generator.complete({ system: "sys", user: "usr" })).rejects.toBeInstanceOf(
      AiGenerationFailedError,
    );
  });
});
