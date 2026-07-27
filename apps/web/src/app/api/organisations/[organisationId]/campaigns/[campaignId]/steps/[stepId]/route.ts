import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { InvalidStepError, removeCampaignStep, updateCampaignStep } from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string; stepId: string }>;
}

const updateStepSchema = z.object({
  delayDays: z.number().int().min(0).max(60).optional(),
  useAiGeneration: z.boolean().optional(),
  callToActionOverride: z.string().max(300).optional(),
  manualSubject: z.string().max(150).optional(),
  manualBody: z.string().max(4000).optional(),
});

async function requireManage(userId: string, organisationId: string) {
  await requireOrganisationMembership(prisma, {
    userId,
    organisationId,
    permission: "campaigns:manage",
  });
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, campaignId, stepId } = await params;

  try {
    await requireManage(session.user.id, organisationId);
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const body = updateStepSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const step = await updateCampaignStep(organisationId, campaignId, stepId, body.data);
    if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });
    return NextResponse.json(step);
  } catch (error) {
    if (error instanceof InvalidStepError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, campaignId, stepId } = await params;

  try {
    await requireManage(session.user.id, organisationId);
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const result = await removeCampaignStep(organisationId, campaignId, stepId);
  if (!result) return NextResponse.json({ error: "Step not found" }, { status: 404 });
  return NextResponse.json({ status: "ok" });
}
