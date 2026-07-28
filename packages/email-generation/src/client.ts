import { GoogleGenAI, Type } from "@google/genai";
import { loadEnv } from "@mail-orbyt/config";
import { generatedEmailSchema, type GeneratedEmail } from "./types";

/**
 * This is the ONLY module in the monorepo permitted to import an AI provider
 * SDK or read the AI provider API key. Enforced by
 * tests/architecture/ai-boundary.test.ts. Every other package/app must go
 * through generate.ts's public functions and must never read
 * AI_PROVIDER_API_KEY itself — that's the whole point of the boundary:
 * nothing outside this file even has the ability to construct an AI call.
 */

export class AiNotConfiguredError extends Error {
  constructor() {
    super("No AI_PROVIDER_API_KEY is configured — AI email generation is unavailable.");
    this.name = "AiNotConfiguredError";
  }
}

/** Wraps any failure from the underlying AI provider call (network error, auth failure, rate limit, malformed response) into a domain error callers outside this package can catch without importing the AI SDK. */
export class AiGenerationFailedError extends Error {
  constructor(cause: unknown) {
    super(`AI provider request failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "AiGenerationFailedError";
  }
}

export interface AiEmailGenerator {
  complete(params: { system: string; user: string }): Promise<GeneratedEmail>;
}

interface AiConfig {
  apiKey: string;
  model: string;
  maxOutputTokens: number;
}

function getAiConfig(): AiConfig | undefined {
  const env = loadEnv();
  if (!env.AI_PROVIDER_API_KEY) return undefined;
  return {
    apiKey: env.AI_PROVIDER_API_KEY,
    model: env.AI_PROVIDER_MODEL,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
  };
}

export function isAiConfigured(): boolean {
  return getAiConfig() !== undefined;
}

let cachedClient: GoogleGenAI | undefined;

function getGeminiClient(apiKey: string): GoogleGenAI {
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

class GeminiEmailGenerator implements AiEmailGenerator {
  constructor(
    private readonly client: GoogleGenAI,
    private readonly model: string,
    private readonly maxOutputTokens: number,
  ) {}

  async complete(params: { system: string; user: string }): Promise<GeneratedEmail> {
    let responseText: string | undefined;
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: "user", parts: [{ text: params.user }] }],
        config: {
          systemInstruction: params.system,
          maxOutputTokens: this.maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING },
              body: { type: Type.STRING },
            },
            required: ["subject", "body"],
          },
        },
      });
      responseText = response.text;
    } catch (error) {
      throw new AiGenerationFailedError(error);
    }

    if (!responseText) {
      throw new AiGenerationFailedError(
        new Error("AI provider response did not include the expected structured output."),
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(responseText);
    } catch (error) {
      throw new AiGenerationFailedError(error);
    }

    return generatedEmailSchema.parse(parsedJson);
  }
}

/** Returns the configured Gemini-backed generator, or throws AiNotConfiguredError if no API key is set. */
export function getAiEmailGenerator(): AiEmailGenerator {
  const config = getAiConfig();
  if (!config) throw new AiNotConfiguredError();
  const client = getGeminiClient(config.apiKey);
  return new GeminiEmailGenerator(client, config.model, config.maxOutputTokens);
}
