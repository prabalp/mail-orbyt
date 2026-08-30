import type { PrismaClient } from "@mail-orbyt/database";
import { decryptSecret, SecretDecryptionError } from "./secret-crypto";

type Prisma = Pick<PrismaClient, "organisation">;

/**
 * Per-organisation overrides for the AI provider call. Both fields are
 * optional and independent: an organisation may bring its own key and keep
 * the default model, or pin a different model while still billing to the
 * deployment-wide key. Anything left undefined falls back to the
 * environment's AI_PROVIDER_API_KEY / AI_PROVIDER_MODEL inside the two AI
 * client modules — this type never carries the environment's values itself.
 */
export interface AiConfigOverride {
  apiKey?: string;
  model?: string;
  /** Which provider protocol apiKey/model are for. Omitted means GEMINI (the historical default). */
  kind?: "GEMINI" | "OPENAI_COMPATIBLE";
  /** Base URL for a custom OpenAI-compatible endpoint. Only meaningful when kind is OPENAI_COMPATIBLE; not secret. */
  baseUrl?: string;
}

/**
 * Loads and decrypts an organisation's own AI provider settings, if it has
 * set any. Returns an empty object (never throws) when the organisation has
 * none, is missing, or its stored key cannot be decrypted — in every one of
 * those cases the caller should fall back to the environment default rather
 * than fail the generation outright.
 *
 * A key that fails to decrypt is reported via `decryptionFailed` so callers
 * that surface settings state (the settings API) can tell the user their key
 * is unreadable, while callers that just want to generate carry on with the
 * fallback.
 */
export async function resolveOrgAiConfig(
  prisma: Prisma,
  organisationId: string,
): Promise<AiConfigOverride & { decryptionFailed?: true }> {
  const organisation = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: {
      aiProviderApiKey: true,
      aiProviderModel: true,
      aiProviderKind: true,
      aiProviderBaseUrl: true,
    },
  });
  if (!organisation) return {};

  const model = organisation.aiProviderModel ?? undefined;
  const kind = organisation.aiProviderKind;
  const baseUrl = organisation.aiProviderBaseUrl ?? undefined;
  if (!organisation.aiProviderApiKey) return { model, kind, baseUrl };

  try {
    return { apiKey: decryptSecret(organisation.aiProviderApiKey), model, kind, baseUrl };
  } catch (error) {
    if (!(error instanceof SecretDecryptionError)) throw error;
    return { model, kind, baseUrl, decryptionFailed: true };
  }
}
