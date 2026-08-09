/**
 * Importable on its own as "@mail-orbyt/ai-settings/models" — deliberately
 * free of any Node built-in so a client component can render the model picker
 * without the package barrel dragging node:crypto into the browser bundle.
 *
 * The models offered in Settings → AI provider. This list is a convenience,
 * not a whitelist: the settings API accepts any non-empty model ID so a model
 * released after this list was written can be used without a code change (the
 * UI exposes that via a "Custom…" option). Saving is still gated on a live
 * verification call, so a bad ID is rejected at save time either way.
 */
/**
 * Every entry here was checked against a live key: it exists, is still
 * offered to new keys, and accepts the `thinkingBudget: 0` this pipeline
 * sends (some models reject that outright — see describeProviderError in
 * packages/email-generation/src/client.ts). Retired IDs must be removed
 * rather than left as dead options: the provider answers a retired model
 * with a bare 404 that reads like the user mistyped it.
 */
export const AI_MODEL_CHOICES = [
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash — recommended" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite — cheapest, lowest latency" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash — previous generation" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro — previous generation, highest quality" },
] as const;

export type AiModelChoice = (typeof AI_MODEL_CHOICES)[number]["value"];
