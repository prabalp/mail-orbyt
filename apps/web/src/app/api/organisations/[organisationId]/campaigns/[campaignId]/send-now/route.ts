import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { loadEnv } from "@mail-orbyt/config";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { sendCampaignNow } from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string }>;
}

/**
 * Dev-only test endpoint: sends a campaign's due outbox items right now
 * instead of waiting for the next scheduler tick. Disabled in production —
 * see docs/scheduling-sending.md for the real send path.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  if (loadEnv().NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

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

  const result = await sendCampaignNow(organisationId, campaignId);
  return NextResponse.json(result);
}
