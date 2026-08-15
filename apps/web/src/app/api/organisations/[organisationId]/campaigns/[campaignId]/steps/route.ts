import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { addCampaignStep, InvalidStepError, reorderCampaignSteps } from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string }>;
}

const addStepSchema = z.object({
  stepType: z.enum(["INITIAL", "FOLLOW_UP", "CLOSE_THE_LOOP"]),
  delayDays: z.number().int().min(0).max(60).optional(),
  useAiGeneration: z.boolean().optional(),
  callToActionOverride: z.string().max(300).optional(),
  manualSubject: z.string().max(150).optional(),
  manualBody: z.string().max(4000).optional(),
});

const reorderSchema = z.object({ orderedStepIds: z.array(z.string().min(1)) });

async function requireManage(request: Request, organisationId: string) {
  await authenticateOrganisationRequest(request, {
    organisationId,
    permission: "campaigns:manage",
  });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, campaignId } = await params;

  try {
    await requireManage(request, organisationId);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const body = addStepSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const step = await addCampaignStep(organisationId, campaignId, body.data);
    if (!step) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    return NextResponse.json(step, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidStepError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, campaignId } = await params;

  try {
    await requireManage(request, organisationId);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const body = reorderSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const steps = await reorderCampaignSteps(organisationId, campaignId, body.data.orderedStepIds);
    if (!steps) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    return NextResponse.json({ steps });
  } catch (error) {
    if (error instanceof InvalidStepError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
