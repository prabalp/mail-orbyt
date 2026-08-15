import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { exitCampaignEnrollment } from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string; leadId: string }>;
}

const exitSchema = z.object({ reason: z.string().max(300).optional() });

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, campaignId, leadId } = await params;

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

  const body = exitSchema.safeParse(await request.json().catch(() => ({})));
  const reason = body.success ? body.data.reason : undefined;

  const enrollment = await exitCampaignEnrollment(organisationId, campaignId, leadId, reason);
  if (!enrollment) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  return NextResponse.json(enrollment);
}
