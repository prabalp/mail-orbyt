/**
 * Deterministic, dependency-free lexicon scoring — not an LLM call. Used
 * only to compute a coarse sentiment signal for the policy engine's
 * escalation rule (a negative-sentiment reply always escalates to human
 * review, see @mail-orbyt/social-policy's decideEscalation). This is
 * intentionally crude; it only ever needs to catch the obvious cases, since
 * anything it misses simply falls through as "neutral" — an under-escalation
 * risk, not an over-escalation one, that a real classifier could tighten up
 * later without changing the policy engine's contract.
 */

const NEGATIVE_WORDS = [
  "hate",
  "terrible",
  "awful",
  "worst",
  "scam",
  "fraud",
  "furious",
  "disgusted",
  "unacceptable",
  "refund",
  "lawsuit",
  "sue",
  "broken",
  "disappointed",
  "angry",
  "horrible",
  "never again",
];

const POSITIVE_WORDS = [
  "love",
  "great",
  "awesome",
  "amazing",
  "thanks",
  "thank you",
  "excellent",
  "fantastic",
  "helpful",
  "impressed",
];

export type Sentiment = "positive" | "neutral" | "negative" | "unknown";

export function computeSentiment(text: string): Sentiment {
  const normalized = text.trim().toLowerCase();
  if (normalized.length === 0) return "unknown";

  const hasNegative = NEGATIVE_WORDS.some((word) => normalized.includes(word));
  if (hasNegative) return "negative";

  const hasPositive = POSITIVE_WORDS.some((word) => normalized.includes(word));
  if (hasPositive) return "positive";

  return "neutral";
}
