import Anthropic from "@anthropic-ai/sdk";
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

const EMAIL_TOOL_NAME = "write_email";

let cachedClient: Anthropic | undefined;

function getAnthropicClient(apiKey: string): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}

class AnthropicEmailGenerator implements AiEmailGenerator {
  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
    private readonly maxOutputTokens: number,
  ) {}

  async complete(params: { system: string; user: string }): Promise<GeneratedEmail> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxOutputTokens,
        system: params.system,
        messages: [{ role: "user", content: params.user }],
        tools: [
          {
            name: EMAIL_TOOL_NAME,
            description: "Return the generated email as structured subject/body fields.",
            input_schema: {
              type: "object",
              properties: {
                subject: { type: "string" },
                body: { type: "string" },
              },
              required: ["subject", "body"],
            },
          },
        ],
        tool_choice: { type: "tool", name: EMAIL_TOOL_NAME },
      });
    } catch (error) {
      throw new AiGenerationFailedError(error);
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      throw new AiGenerationFailedError(
        new Error("AI provider response did not include the expected structured tool call."),
      );
    }

    return generatedEmailSchema.parse(toolUse.input);
  }
}

/** Returns the configured Anthropic-backed generator, or throws AiNotConfiguredError if no API key is set. */
export function getAiEmailGenerator(): AiEmailGenerator {
  const config = getAiConfig();
  if (!config) throw new AiNotConfiguredError();
  const client = getAnthropicClient(config.apiKey);
  return new AnthropicEmailGenerator(client, config.model, config.maxOutputTokens);
}
