import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { InvalidInboxPoolError, setCampaignInboxPool } from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string }>;
}

const setInboxesSchema = z.object({ inboxIds: z.array(z.string().min(1)) });

export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const body = setInboxesSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const pool = await setCampaignInboxPool(organisationId, campaignId, body.data.inboxIds);
    if (!pool) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    return NextResponse.json({ pool });
  } catch (error) {
    if (error instanceof InvalidInboxPoolError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
