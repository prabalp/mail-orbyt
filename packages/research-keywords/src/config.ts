import { loadEnv } from "@mail-orbyt/config";

export type KeywordExtractionMode = "deterministic" | "ai";

/** Defaults to "deterministic" — the AI path is an explicit, documented opt-in. See docs/ai-boundaries.md. */
export function getKeywordExtractionMode(): KeywordExtractionMode {
  return loadEnv().KEYWORD_EXTRACTION_MODE;
}
