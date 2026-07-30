import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendCampaignNow } from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string }>;
}

/**
 * Dev-only test endpoint: sends a campaign's due outbox items right now
 * instead of waiting for the next scheduler tick. Disabled in production —
 * see docs/scheduling-sending.md for the real send path.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  if (loadEnv().NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, campaignId } = await params;

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

  const result = await sendCampaignNow(organisationId, campaignId);
  return NextResponse.json(result);
}
