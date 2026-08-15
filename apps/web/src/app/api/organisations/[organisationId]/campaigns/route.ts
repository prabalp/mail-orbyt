import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { createOrganisationCampaign, listOrganisationCampaigns } from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  timezone: z.string().optional(),
  sendingDaysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  sendingWindowStartMinute: z.number().int().min(0).max(1439).optional(),
  sendingWindowEndMinute: z.number().int().min(0).max(1439).optional(),
  inboxCooldownMinutes: z.number().int().min(0).max(180).optional(),
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

  const campaigns = await listOrganisationCampaigns(organisationId);
  return NextResponse.json({ campaigns });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

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

  const body = createSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const campaign = await createOrganisationCampaign({
    organisationId,
    ...body.data,
    createdByUserId: userId,
  });
  return NextResponse.json(campaign, { status: 201 });
}
