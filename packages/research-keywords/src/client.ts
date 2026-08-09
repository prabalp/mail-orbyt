import { GoogleGenAI, Type } from "@google/genai";
import { loadEnv } from "@mail-orbyt/config";
import type { KeywordCandidate } from "./deterministic";

/**
 * This is the second module in the monorepo permitted to import an AI
 * provider SDK or read the AI provider API key — packages/email-generation
 * is the other. Enforced by tests/architecture/ai-boundary.test.ts. See
 * docs/ai-boundaries.md for why this exception exists and what it's bounded
 * to: this call only ever sees text already fetched and saved deterministically
 * by packages/research (never live browsing), and only runs when an operator
 * has explicitly opted in via KEYWORD_EXTRACTION_MODE=ai.
 */

export class AiNotConfiguredError extends Error {
  constructor() {
    super("No AI_PROVIDER_API_KEY is configured — AI keyword extraction is unavailable.");
    this.name = "AiNotConfiguredError";
  }
}

export class AiKeywordExtractionFailedError extends Error {
  constructor(cause: unknown) {
    super(`AI provider request failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "AiKeywordExtractionFailedError";
  }
}

interface AiConfig {
  apiKey: string;
  model: string;
  maxOutputTokens: number;
}

/** Per-organisation key/model overrides — see the identically-named type in packages/email-generation/src/client.ts. */
export interface AiConfigOverride {
  apiKey?: string;
  model?: string;
}

function getAiConfig(override?: AiConfigOverride): AiConfig | undefined {
  const env = loadEnv();
  const apiKey = override?.apiKey || env.AI_PROVIDER_API_KEY;
  if (!apiKey) return undefined;
  return {
    apiKey,
    model: override?.model || env.AI_PROVIDER_MODEL,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
  };
}

export function isAiConfigured(override?: AiConfigOverride): boolean {
  return getAiConfig(override) !== undefined;
}

// Keyed by API key — a bare singleton would pin the first organisation's key
// and use it for every other organisation's extraction too.
const clientCache = new Map<string, GoogleGenAI>();

function getGeminiClient(apiKey: string): GoogleGenAI {
  const cached = clientCache.get(apiKey);
  if (cached) return cached;
  const client = new GoogleGenAI({ apiKey });
  clientCache.set(apiKey, client);
  return client;
}

const SYSTEM_INSTRUCTION =
  "Extract the most relevant keywords or short phrases from the given webpage " +
  "text. Only return terms that appear, verbatim or as a clear inflection, in " +
  "the provided text — never invent a term that isn't grounded in it. Return " +
  "between 5 and 15 terms, most relevant first.";

async function callGemini(
  client: GoogleGenAI,
  model: string,
  maxOutputTokens: number,
  text: string,
): Promise<string[]> {
  const response = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      maxOutputTokens,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["keywords"],
      },
    },
  });

  if (!response.text) {
    throw new Error("AI provider response did not include the expected structured output.");
  }
  const parsed = JSON.parse(response.text) as { keywords?: unknown };
  if (!Array.isArray(parsed.keywords)) {
    throw new Error("AI provider response was missing a keywords array.");
  }
  return parsed.keywords.filter((k): k is string => typeof k === "string");
}

/**
 * Calls Gemini to extract keywords from already-saved page text. Only
 * keywords that literally occur in `text` (case-insensitive) are kept —
 * everything else is dropped rather than trusted, so a fact this produces
 * can still be traced to a deterministic slice of the saved source text.
 */
export async function extractKeywordsWithAi(
  text: string,
  override?: AiConfigOverride,
): Promise<KeywordCandidate[]> {
  const config = getAiConfig(override);
  if (!config) throw new AiNotConfiguredError();

  let keywords: string[];
  try {
    const client = getGeminiClient(config.apiKey);
    keywords = await callGemini(client, config.model, config.maxOutputTokens, text);
  } catch (error) {
    throw new AiKeywordExtractionFailedError(error);
  }

  const lowerText = text.toLowerCase();
  const grounded = keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0 && lowerText.includes(keyword.toLowerCase()));

  return grounded.map((keyword, index) => ({
    keyword,
    score: 1 - index / Math.max(grounded.length, 1) / 2,
  }));
}
