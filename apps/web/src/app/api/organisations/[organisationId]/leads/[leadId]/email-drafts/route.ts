import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import {
  AiGenerationFailedError,
  AiNotConfiguredError,
  GeneratedEmailValidationError,
} from "@mail-orbyt/email-generation";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { generateDraft, isAiConfiguredForOrganisation, listDrafts } from "@/lib/email-drafts";

interface RouteParams {
  params: Promise<{ organisationId: string; leadId: string }>;
}

const generateDraftSchema = z.object({
  generationType: z.enum(["INITIAL", "FOLLOW_UP", "CLOSE_THE_LOOP"]),
  callToAction: z.string().min(1).max(300),
  basedOnDraftId: z.string().optional(),
});

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, leadId } = await params;

  try {
    await authenticateOrganisationRequest(request, { organisationId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const [drafts, aiConfigured] = await Promise.all([
    listDrafts(organisationId, leadId),
    isAiConfiguredForOrganisation(organisationId),
  ]);
  return NextResponse.json({ drafts, aiConfigured });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, leadId } = await params;

  let userId: string;
  try {
    ({ userId } = await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "campaigns:manage",
    }));
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.organisationId !== organisationId) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const body = generateDraftSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const draft = await generateDraft({
      organisationId,
      leadId,
      generationType: body.data.generationType,
      callToAction: body.data.callToAction,
      basedOnDraftId: body.data.basedOnDraftId,
      createdByUserId: userId,
    });
    return NextResponse.json(draft, { status: 201 });
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof GeneratedEmailValidationError) {
      return NextResponse.json(
        {
          error: "Generated email failed safety checks, please try again.",
          violations: error.violations,
        },
        { status: 502 },
      );
    }
    if (error instanceof AiGenerationFailedError) {
      // The provider's own message is the only thing that distinguishes an
      // exhausted quota from a bad key from a network blip — without it this
      // is an unactionable 502 in the log and nothing else.
      console.error("AI generation failed", { organisationId, leadId, cause: error.message });
      const isQuota = /RESOURCE_EXHAUSTED|"code":\s*429/.test(error.message);
      return NextResponse.json(
        {
          error: isQuota
            ? "The AI provider's quota is exhausted for the key in use. Add your organisation's own API key in Settings → AI provider, or wait for the quota to reset."
            : "The AI provider request failed. Please try again.",
        },
        { status: isQuota ? 429 : 502 },
      );
    }
    throw error;
  }
}
