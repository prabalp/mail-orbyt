import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import {
  AiGenerationFailedError,
  AiNotConfiguredError,
  GeneratedEmailValidationError,
} from "@mail-orbyt/email-generation";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { generateDraft, isAiConfigured, listDrafts } from "@/lib/email-drafts";

interface RouteParams {
  params: Promise<{ organisationId: string; leadId: string }>;
}

const generateDraftSchema = z.object({
  generationType: z.enum(["INITIAL", "FOLLOW_UP", "CLOSE_THE_LOOP"]),
  callToAction: z.string().min(1).max(300),
  basedOnDraftId: z.string().optional(),
});

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, leadId } = await params;

  try {
    await requireOrganisationMembership(prisma, { userId: session.user.id, organisationId });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const drafts = await listDrafts(organisationId, leadId);
  return NextResponse.json({ drafts, aiConfigured: isAiConfigured() });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, leadId } = await params;

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
      createdByUserId: session.user.id,
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
      return NextResponse.json(
        { error: "The AI provider request failed. Please try again." },
        { status: 502 },
      );
    }
    throw error;
  }
}
