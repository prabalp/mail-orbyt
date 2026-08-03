import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
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
