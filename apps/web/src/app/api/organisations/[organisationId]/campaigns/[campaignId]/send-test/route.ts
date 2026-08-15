import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { CampaignActivationError, sendTestEmail } from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string }>;
}

const sendTestSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(2),
});

/**
 * QA helper: sends this campaign's first step to 1-2 addresses the caller
 * controls, exactly as it would go out to a real prospect — but never
 * touches real prospect data (no OutboxItem/CampaignEnrollment rows).
 * Unlike send-now, this is always available in production.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const body = sendTestSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const result = await sendTestEmail(organisationId, campaignId, body.data.emails);
    if (!result) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CampaignActivationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
