import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { exitCampaignEnrollment } from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string; leadId: string }>;
}

const exitSchema = z.object({ reason: z.string().max(300).optional() });

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, campaignId, leadId } = await params;

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

  const body = exitSchema.safeParse(await request.json().catch(() => ({})));
  const reason = body.success ? body.data.reason : undefined;

  const enrollment = await exitCampaignEnrollment(organisationId, campaignId, leadId, reason);
  if (!enrollment) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  return NextResponse.json(enrollment);
}
