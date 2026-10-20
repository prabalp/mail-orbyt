import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { DEFAULT_CAMPAIGN_EMAIL_PROMPT } from "@mail-orbyt/email-generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import {
  archiveOrganisationCampaign,
  CampaignActivationError,
  getOrganisationCampaign,
  updateOrganisationCampaign,
} from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string }>;
}

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  timezone: z.string().optional(),
  sendingDaysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  sendingWindowStartMinute: z.number().int().min(0).max(1439).optional(),
  sendingWindowEndMinute: z.number().int().min(0).max(1439).optional(),
  inboxCooldownMinutes: z.number().int().min(0).max(180).optional(),
  // Empty string is a meaningful value here — it's how the UI clears the
  // campaign override and falls back to the organisation-level instructions,
  // so it's normalised to null rather than rejected.
  emailPromptInstructions: z
    .string()
    .max(4000)
    .transform((value) => value.trim() || null)
    .nullable()
    .optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).optional(),
});

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, campaignId } = await params;

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

  const campaign = await getOrganisationCampaign(organisationId, campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  // Served rather than imported by the page: the campaign editor is a client
  // component, and importing @mail-orbyt/email-generation there would pull the
  // AI provider SDK into the browser bundle.
  return NextResponse.json({ ...campaign, defaultCampaignPrompt: DEFAULT_CAMPAIGN_EMAIL_PROMPT });
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, campaignId } = await params;

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
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const body = updateSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const campaign = await updateOrganisationCampaign(organisationId, campaignId, body.data, {
      userId,
    });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    return NextResponse.json(campaign);
  } catch (error) {
    if (error instanceof CampaignActivationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, campaignId } = await params;

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

  const campaign = await archiveOrganisationCampaign(organisationId, campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json(campaign);
}
