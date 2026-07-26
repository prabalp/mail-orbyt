import Anthropic from "@anthropic-ai/sdk";

/**
 * This is the ONLY module in the monorepo permitted to import an AI provider
 * SDK. Enforced by tests/architecture/ai-boundary.test.ts. Do not import
 * `@anthropic-ai/sdk` (or any other AI provider SDK) anywhere else — route
 * all generation through this package's public API instead.
 *
 * Generation prompts, structured output schema, fact-input construction, and
 * the deterministic post-generation validator are built in Phase 5.
 */
export function createAiClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}
