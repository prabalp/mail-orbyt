import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { exportLeadData } from "@mail-orbyt/compliance";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string; leadId: string }>;
}

/** GDPR/CCPA "right to access" — every record the product holds about this lead, as a single downloadable bundle. */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, leadId } = await params;

  let userId: string;
  try {
    ({ userId } = await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "leads:manage",
    }));
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const bundle = await exportLeadData(prisma, organisationId, leadId, userId);
  if (!bundle) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  return NextResponse.json(bundle);
}
