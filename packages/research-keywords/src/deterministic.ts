/**
 * Default keyword-extraction mode (KEYWORD_EXTRACTION_MODE=deterministic).
 * Plain stopword-filtered word-frequency scoring — no AI SDK import, no
 * external service call. Kept intentionally simple: this is the mode that
 * ships on by default, so it needs to be auditable at a glance.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "than", "so", "as",
  "of", "at", "by", "for", "with", "about", "against", "between", "into",
  "through", "during", "before", "after", "above", "below", "to", "from",
  "up", "down", "in", "out", "on", "off", "over", "under", "again",
  "further", "once", "here", "there", "when", "where", "why", "how", "all",
  "any", "both", "each", "few", "more", "most", "other", "some", "such",
  "no", "nor", "not", "only", "own", "same", "too", "very", "can", "will",
  "just", "should", "now", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "having", "do", "does", "did", "doing",
  "it", "its", "this", "that", "these", "those", "i", "you", "he", "she",
  "we", "they", "them", "their", "our", "your", "his", "her", "us", "me",
  "which", "who", "whom", "what",
]);

export interface KeywordCandidate {
  keyword: string;
  score: number;
}

/**
 * Tokenizes, strips stopwords/short tokens, and scores by raw frequency
 * normalized against the most frequent surviving token. Ties break
 * alphabetically so results are deterministic across runs of the same text.
 */
export function extractKeywordsDeterministic(
  text: string,
  options: { maxKeywords?: number } = {},
): KeywordCandidate[] {
  const maxKeywords = options.maxKeywords ?? 15;
  const counts = new Map<string, number>();

  const tokens = text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*[a-z0-9]|[a-z0-9]/g) ?? [];
  for (const token of tokens) {
    if (token.length < 3 || STOPWORDS.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const maxCount = Math.max(1, ...counts.values());

  return [...counts.entries()]
    .sort(([wordA, countA], [wordB, countB]) => countB - countA || wordA.localeCompare(wordB))
    .slice(0, maxKeywords)
    .map(([keyword, count]) => ({ keyword, score: count / maxCount }));
}
