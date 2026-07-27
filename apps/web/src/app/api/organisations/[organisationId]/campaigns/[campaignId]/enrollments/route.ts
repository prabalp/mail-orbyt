import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  enrollCampaignLeads,
  enrollCampaignLeadsFromList,
  listCampaignEnrollments,
} from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string }>;
}

const enrollSchema = z.union([
  z.object({ leadIds: z.array(z.string().min(1)).min(1) }),
  z.object({ leadListId: z.string().min(1) }),
]);

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, campaignId } = await params;

  try {
    await requireOrganisationMembership(prisma, { userId: session.user.id, organisationId });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const enrollments = await listCampaignEnrollments(organisationId, campaignId);
  if (!enrollments) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json({ enrollments });
}

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

  const body = enrollSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const result =
    "leadListId" in body.data
      ? await enrollCampaignLeadsFromList(organisationId, campaignId, body.data.leadListId)
      : await enrollCampaignLeads(organisationId, campaignId, body.data.leadIds);

  return NextResponse.json(result, { status: 201 });
}
