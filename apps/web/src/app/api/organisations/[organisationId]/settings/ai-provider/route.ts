import { encryptSecret, maskSecret, resolveOrgAiConfig } from "@mail-orbyt/ai-settings";
import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { getEnvironmentAiDefaults, verifyAiCredentials } from "@mail-orbyt/email-generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

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
});

/** The shape both GET and PATCH return. Deliberately carries a masked hint rather than the key — nothing here is secret. */
async function settingsPayload(organisationId: string) {
  const config = await resolveOrgAiConfig(prisma, organisationId);
  const environment = getEnvironmentAiDefaults();
  return {
    apiKeyHint: config.apiKey ? maskSecret(config.apiKey) : null,
    keyDecryptionFailed: config.decryptionFailed ?? false,
    model: config.model ?? null,
    usingEnvironmentKey: !config.apiKey,
    environmentKeyAvailable: environment.keyAvailable,
    environmentModel: environment.model,
  };
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId } = await params;

  try {
    await requireOrganisationMembership(prisma, { userId: session.user.id, organisationId });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  return NextResponse.json(await settingsPayload(organisationId));
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId } = await params;

  try {
    await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "campaigns:manage",
    });
  } catch (error) {
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
  // An omitted apiKey means "keep what's stored"; "" means "clear it".
  const clearingKey = parsed.data.apiKey === "";
  const newKey = parsed.data.apiKey?.trim() || undefined;
  const effectiveKey = clearingKey ? undefined : (newKey ?? existing.apiKey);

  // Verify the exact pair that will actually be used — including the case
  // where only the model changed and the key came from the environment, since
  // a model can be valid for one key's plan and not another's.
  const verification = await verifyAiCredentials({ apiKey: effectiveKey, model });
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
    },
  });

  return NextResponse.json(await settingsPayload(organisationId));
}
