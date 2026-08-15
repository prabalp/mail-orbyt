import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import {
  DEFAULT_CAMPAIGN_EMAIL_PROMPT,
  DEFAULT_GENERATION_SYSTEM_PROMPT,
  DEFAULT_REVIEW_SYSTEM_PROMPT,
} from "@mail-orbyt/email-generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

const bodySchema = z.object({
  emailPromptInstructions: z.string().max(4000).optional(),
  calendlyUrl: z.union([z.string().url(), z.literal("")]).optional(),
  generationSystemPrompt: z.string().max(8000).optional(),
  reviewSystemPrompt: z.string().max(8000).optional(),
});

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

  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: organisationId },
  });
  return NextResponse.json({
    emailPromptInstructions: organisation.emailPromptInstructions,
    calendlyUrl: organisation.calendlyUrl,
    generationSystemPrompt: organisation.generationSystemPrompt,
    reviewSystemPrompt: organisation.reviewSystemPrompt,
    defaults: {
      generationSystemPrompt: DEFAULT_GENERATION_SYSTEM_PROMPT,
      reviewSystemPrompt: DEFAULT_REVIEW_SYSTEM_PROMPT,
      campaignPrompt: DEFAULT_CAMPAIGN_EMAIL_PROMPT,
    },
  });
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

  const organisation = await prisma.organisation.update({
    where: { id: organisationId },
    data: {
      emailPromptInstructions: parsed.data.emailPromptInstructions || null,
      calendlyUrl: parsed.data.calendlyUrl || null,
      generationSystemPrompt: parsed.data.generationSystemPrompt || null,
      reviewSystemPrompt: parsed.data.reviewSystemPrompt || null,
    },
  });

  return NextResponse.json({
    emailPromptInstructions: organisation.emailPromptInstructions,
    calendlyUrl: organisation.calendlyUrl,
    generationSystemPrompt: organisation.generationSystemPrompt,
    reviewSystemPrompt: organisation.reviewSystemPrompt,
  });
}
