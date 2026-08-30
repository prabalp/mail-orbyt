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
  kind: "GEMINI" | "OPENAI_COMPATIBLE";
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxOutputTokens: number;
}

/**
 * Per-organisation overrides, resolved by @mail-orbyt/ai-settings from the
 * organisation's saved settings. Each field independently takes precedence
 * over the environment default; anything omitted falls back to it. This is
 * the ONLY way a caller can influence which key/model is used — no caller
 * outside this module ever reads AI_PROVIDER_API_KEY itself.
 */
export interface AiConfigOverride {
  apiKey?: string;
  model?: string;
  /** Which provider protocol apiKey/model are for. Omitted means GEMINI. */
  kind?: "GEMINI" | "OPENAI_COMPATIBLE";
  /** Base URL for a custom OpenAI-compatible endpoint. Required (with apiKey) when kind is OPENAI_COMPATIBLE — there is no environment fallback for a custom endpoint. */
  baseUrl?: string;
}

function getAiConfig(override?: AiConfigOverride): AiConfig | undefined {
  const env = loadEnv();

  if (override?.kind === "OPENAI_COMPATIBLE") {
    if (!override.apiKey || !override.model || !override.baseUrl) return undefined;
    return {
      kind: "OPENAI_COMPATIBLE",
      apiKey: override.apiKey,
      model: override.model,
      baseUrl: override.baseUrl,
      maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    };
  }

  const apiKey = override?.apiKey || env.AI_PROVIDER_API_KEY;
  if (!apiKey) return undefined;
  return {
    kind: "GEMINI",
    apiKey,
    model: override?.model || env.AI_PROVIDER_MODEL,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
  };
}

/** True when this organisation can make AI calls — via its own key, or the deployment's. */
export function isAiConfigured(override?: AiConfigOverride): boolean {
  return getAiConfig(override) !== undefined;
}

/**
 * What the deployment falls back to when an organisation brings no key or
 * model of its own. Exposed so the Settings UI can say "Default (…)" without
 * reading AI_PROVIDER_API_KEY itself — the key's VALUE never leaves this
 * module, only whether one exists.
 */
export function getEnvironmentAiDefaults(): { keyAvailable: boolean; model: string } {
  const env = loadEnv();
  return { keyAvailable: Boolean(env.AI_PROVIDER_API_KEY), model: env.AI_PROVIDER_MODEL };
}

// Keyed by API key, not a bare singleton: organisations bring their own keys,
// and a single cached client would pin whichever key happened to be used
// first and silently bill/authenticate every other organisation as that one.
const clientCache = new Map<string, GoogleGenAI>();

function getGeminiClient(apiKey: string): GoogleGenAI {
  const cached = clientCache.get(apiKey);
  if (cached) return cached;
  const client = new GoogleGenAI({ apiKey });
  clientCache.set(apiKey, client);
  return client;
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
          // Gemini 2.5 models spend output tokens on internal "thinking"
          // before the visible response by default, which can burn the
          // whole maxOutputTokens budget and truncate the JSON mid-object.
          // This call needs deterministic structured output, not reasoning.
          thinkingConfig: { thinkingBudget: 0 },
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

/**
 * A generator for any provider that speaks the OpenAI Chat Completions wire
 * format (POST {baseUrl}/chat/completions, Bearer auth, {model, messages,
 * response_format}) — the de facto common denominator most hosted vendors,
 * gateways, and self-hosted stacks (vLLM, Ollama, LM Studio, OpenRouter,
 * Azure OpenAI, ...) speak natively or via a compatibility shim. Built on
 * plain fetch, not a vendor SDK, so this stays outside the AI-SDK boundary
 * enforced by tests/architecture/ai-boundary.test.ts.
 */
class OpenAiCompatibleEmailGenerator implements AiEmailGenerator {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly maxOutputTokens: number,
  ) {}

  async complete(params: { system: string; user: string }): Promise<GeneratedEmail> {
    const content = await callOpenAiCompatible(
      this.baseUrl,
      this.apiKey,
      this.model,
      this.maxOutputTokens,
      [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
    );

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch (error) {
      throw new AiGenerationFailedError(error);
    }

    return generatedEmailSchema.parse(parsedJson);
  }
}

/** Strips a trailing slash so callers can save a base URL either way. */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/**
 * The shared HTTP call behind both OpenAiCompatibleEmailGenerator and the
 * verifyAiCredentials custom-provider path — returns the assistant message's
 * raw text content, or throws AiGenerationFailedError with the provider's
 * own error text on any non-2xx or malformed response.
 */
async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  messages: { role: "system" | "user"; content: string }[],
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
      }),
    });
  } catch (error) {
    throw new AiGenerationFailedError(error);
  }

  const bodyText = await response.text();
  if (!response.ok) {
    throw new AiGenerationFailedError(
      new Error(describeOpenAiCompatibleError(response.status, bodyText)),
    );
  }

  let parsed: { choices?: { message?: { content?: string } }[] };
  try {
    parsed = JSON.parse(bodyText) as typeof parsed;
  } catch (error) {
    throw new AiGenerationFailedError(error);
  }

  const content = parsed.choices?.[0]?.message?.content;
  if (!content) {
    throw new AiGenerationFailedError(
      new Error("AI provider response did not include the expected structured output."),
    );
  }
  return content;
}

/**
 * Returns the generator for these overrides — Gemini (the organisation's own
 * key/model where set, the environment's otherwise) or a custom
 * OpenAI-compatible endpoint (organisation-only; there is no environment
 * fallback for a custom base URL) — or throws AiNotConfiguredError if
 * neither resolves.
 */
export function getAiEmailGenerator(override?: AiConfigOverride): AiEmailGenerator {
  const config = getAiConfig(override);
  if (!config) throw new AiNotConfiguredError();
  if (config.kind === "OPENAI_COMPATIBLE") {
    return new OpenAiCompatibleEmailGenerator(
      config.baseUrl!,
      config.apiKey,
      config.model,
      config.maxOutputTokens,
    );
  }
  const client = getGeminiClient(config.apiKey);
  return new GeminiEmailGenerator(client, config.model, config.maxOutputTokens);
}

/**
 * Makes the smallest possible real call against a key/model pair so Settings
 * can reject credentials at save time rather than letting them surface later
 * as an opaque 502 mid-campaign. Returns the provider's own message on
 * failure (unknown model, bad key, exhausted quota) — that text is the whole
 * point, since it is what actually tells the user which of those it is.
 */
export async function verifyAiCredentials(
  override: AiConfigOverride,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const config = getAiConfig(override);
  if (!config) {
    return {
      ok: false,
      message:
        override?.kind === "OPENAI_COMPATIBLE"
          ? "An API key, base URL, and model are all required for a custom provider."
          : "No API key was provided.",
    };
  }

  if (config.kind === "OPENAI_COMPATIBLE") {
    try {
      const content = await callOpenAiCompatible(config.baseUrl!, config.apiKey, config.model, 8, [
        { role: "user", content: "Reply with the single word: ok" },
      ]);
      if (!content) {
        return { ok: false, message: "The provider accepted the request but returned no output." };
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  try {
    const response = await getGeminiClient(config.apiKey).models.generateContent({
      model: config.model,
      contents: [{ role: "user", parts: [{ text: "Reply with the single word: ok" }] }],
      config: { maxOutputTokens: 8, thinkingConfig: { thinkingBudget: 0 } },
    });
    if (!response.text) {
      return { ok: false, message: "The provider accepted the request but returned no output." };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describeProviderError(error) };
  }
}

/**
 * Turns a raw HTTP failure from a custom OpenAI-compatible endpoint into
 * plain wording, the same job describeProviderError does for Gemini's
 * SDK-shaped errors below — but keyed off the HTTP status, since a custom
 * endpoint's response body has no fixed shape to pattern-match on.
 */
function describeOpenAiCompatibleError(status: number, bodyText: string): string {
  if (status === 401 || status === 403) {
    return "That API key was rejected by the provider. Check it was copied in full.";
  }
  if (status === 404) {
    return "The provider returned 404 — check the base URL and that the model ID exists on it.";
  }
  if (status === 429) {
    return "This key's quota is exhausted or being rate-limited. It's valid, but the provider is refusing requests right now.";
  }
  const trimmed = bodyText.trim();
  return trimmed
    ? `The provider returned ${status}: ${trimmed.slice(0, 300)}`
    : `The provider returned ${status} with no further detail.`;
}

/**
 * Turns a raw provider error into something a settings form can show. The
 * SDK stringifies its errors as a JSON blob containing the real status and
 * message, which is unreadable in a form field — the common, actionable
 * cases get plain wording and anything else falls back to the raw text.
 */
function describeProviderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/API_KEY_INVALID|API key not valid/i.test(raw)) {
    return "That API key was rejected by the provider. Check it was copied in full.";
  }
  if (/RESOURCE_EXHAUSTED|"code":\s*429/.test(raw)) {
    return "This key's quota is exhausted. It's valid, but the provider is refusing requests until the quota resets — check your plan and billing details.";
  }
  if (/no longer available/i.test(raw)) {
    return "That model has been retired by the provider and is no longer available to new keys. Pick a current model.";
  }
  if (/NOT_FOUND|"code":\s*404/.test(raw)) {
    return "That model wasn't found for this API key. Check the model ID, or whether your plan has access to it.";
  }
  // Every call this package makes sets thinkingBudget: 0 (see
  // GeminiEmailGenerator.complete for why). Models that cannot have thinking
  // disabled reject the whole request with a bare "invalid argument", which
  // is otherwise impossible to act on.
  if (/INVALID_ARGUMENT|"code":\s*400/.test(raw)) {
    return "The provider rejected the request for that model. It most likely doesn't support running with reasoning disabled, which this app requires — pick a different model.";
  }
  if (/PERMISSION_DENIED|"code":\s*403/.test(raw)) {
    return "That API key doesn't have permission to use the Generative Language API.";
  }
  return raw;
}
