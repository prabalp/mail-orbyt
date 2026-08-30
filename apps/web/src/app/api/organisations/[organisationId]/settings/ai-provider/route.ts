import { encryptSecret, maskSecret, resolveOrgAiConfig } from "@mail-orbyt/ai-settings";
import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { getEnvironmentAiDefaults, verifyAiCredentials } from "@mail-orbyt/email-generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

/**
 * `apiKey` is three-valued on purpose: omitted leaves the stored key alone
 * (so the user can change only the model without re-entering it), an empty
 * string clears it back to the environment default, and a non-empty string
 * replaces it. The key is never echoed back in any response.
 */
const bodySchema = z.object({
  apiKey: z.string().max(400).optional(),
  model: z.string().max(200).optional(),
  kind: z.enum(["GEMINI", "OPENAI_COMPATIBLE"]).optional(),
  baseUrl: z.union([z.string().url().max(500), z.literal("")]).optional(),
});

/** The shape both GET and PATCH return. Deliberately carries a masked hint rather than the key — nothing here is secret. */
async function settingsPayload(organisationId: string) {
  const config = await resolveOrgAiConfig(prisma, organisationId);
  const environment = getEnvironmentAiDefaults();
  return {
    apiKeyHint: config.apiKey ? maskSecret(config.apiKey) : null,
    keyDecryptionFailed: config.decryptionFailed ?? false,
    model: config.model ?? null,
    kind: config.kind ?? "GEMINI",
    baseUrl: config.baseUrl ?? null,
    usingEnvironmentKey: !config.apiKey,
    environmentKeyAvailable: environment.keyAvailable,
    environmentModel: environment.model,
  };
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  try {
    await authenticateOrganisationRequest(request, { organisationId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  return NextResponse.json(await settingsPayload(organisationId));
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "campaigns:manage",
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const existing = await resolveOrgAiConfig(prisma, organisationId);
  const model = parsed.data.model?.trim() || undefined;
  const kind = parsed.data.kind ?? existing.kind ?? "GEMINI";
  // An omitted apiKey means "keep what's stored"; "" means "clear it".
  const clearingKey = parsed.data.apiKey === "";
  const newKey = parsed.data.apiKey?.trim() || undefined;
  const effectiveKey = clearingKey ? undefined : (newKey ?? existing.apiKey);
  // baseUrl follows the same three-valued convention as apiKey, but it's not
  // secret, so "existing" is simply what GET already returned to the form.
  const clearingBaseUrl = parsed.data.baseUrl === "";
  const newBaseUrl = parsed.data.baseUrl?.trim() || undefined;
  const effectiveBaseUrl =
    kind === "OPENAI_COMPATIBLE"
      ? clearingBaseUrl
        ? undefined
        : (newBaseUrl ?? existing.baseUrl)
      : undefined;

  if (kind === "OPENAI_COMPATIBLE" && !effectiveBaseUrl) {
    return NextResponse.json(
      { error: "A base URL is required for a custom OpenAI-compatible provider." },
      { status: 400 },
    );
  }

  // Verify the exact pair that will actually be used — including the case
  // where only the model changed and the key came from the environment, since
  // a model can be valid for one key's plan and not another's.
  const verification = await verifyAiCredentials({
    apiKey: effectiveKey,
    model,
    kind,
    baseUrl: effectiveBaseUrl,
  });
  if (!verification.ok) {
    return NextResponse.json({ error: verification.message }, { status: 400 });
  }

  await prisma.organisation.update({
    where: { id: organisationId },
    data: {
      ...(parsed.data.apiKey === undefined
        ? {}
        : { aiProviderApiKey: newKey ? encryptSecret(newKey) : null }),
      aiProviderModel: model ?? null,
      aiProviderKind: kind,
      aiProviderBaseUrl: kind === "OPENAI_COMPATIBLE" ? (effectiveBaseUrl ?? null) : null,
    },
  });

  return NextResponse.json(await settingsPayload(organisationId));
}
