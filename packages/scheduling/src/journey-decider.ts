import { loadEnv } from "@mail-orbyt/config";

/**
 * Client for the external decision model that picks a journey outcome from the
 * options a lead's own email graph defines. It is a plain HTTP call — no AI SDK
 * lives in this repo — and it is advisory: any failure, timeout, low-confidence
 * answer or "none of the above" returns null so the caller falls back to the
 * deterministic rules. It can only ever choose among the supplied options.
 */

export interface DeciderInput {
  /** Everything the model may reason over: the lead, the email just sent, and the reply. */
  state: Record<string, unknown>;
  /** outcome id -> plain-language description of when it applies. */
  options: Record<string, string>;
}

export interface DeciderResult {
  outcome: string;
  confidence: number;
}

export interface JourneyDecider {
  decide(input: DeciderInput): Promise<DeciderResult | null>;
}

export interface HttpDeciderConfig {
  apiKey: string;
  url: string;
  model: string;
  minConfidence: number;
  timeoutMs: number;
}

const NONE_OF_THE_ABOVE = "none_of_the_above";

export function createHttpDecider(
  config: HttpDeciderConfig,
  fetchImpl: typeof fetch = fetch,
): JourneyDecider {
  return {
    async decide({ state, options }) {
      if (Object.keys(options).length === 0) return null;
      try {
        const response = await fetchImpl(config.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(config.timeoutMs),
          body: JSON.stringify({
            model: config.model,
            state,
            questions: {
              outcome: {
                type: "choice",
                instructions:
                  "Given the email we sent (`sent_email`) and the lead's reply (`reply`), which outcome best describes what the lead's reply means?",
                criteria: {
                  ...options,
                  [NONE_OF_THE_ABOVE]:
                    "The reply fits none of the other outcomes, or it is unclear.",
                },
              },
            },
          }),
        });
        if (!response.ok) return null;
        const body = (await response.json()) as Record<string, unknown>;
        const answer = (body["outcome"] ??
          (body["answers"] as Record<string, unknown> | undefined)?.["outcome"]) as
          { choice?: unknown; confidence?: unknown } | undefined;
        if (typeof answer?.choice !== "string" || typeof answer.confidence !== "number")
          return null;
        if (answer.choice === NONE_OF_THE_ABOVE || !(answer.choice in options)) return null;
        if (answer.confidence < config.minConfidence) return null;
        return { outcome: answer.choice, confidence: answer.confidence };
      } catch {
        return null;
      }
    },
  };
}

/** The decider configured by JOURNEY_DECIDER_* env vars, or undefined when no API key is set (rules only). */
export function getJourneyDeciderFromEnv(): JourneyDecider | undefined {
  const env = loadEnv();
  if (!env.JOURNEY_DECIDER_API_KEY) return undefined;
  return createHttpDecider({
    apiKey: env.JOURNEY_DECIDER_API_KEY,
    url: env.JOURNEY_DECIDER_URL,
    model: env.JOURNEY_DECIDER_MODEL,
    minConfidence: env.JOURNEY_DECIDER_MIN_CONFIDENCE,
    timeoutMs: env.JOURNEY_DECIDER_TIMEOUT_MS,
  });
}
