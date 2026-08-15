import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { listLeadEmailHistory } from "@mail-orbyt/leads";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string; leadId: string }>;
}

/** Every email aimed at this lead — which campaign and step it came from, which inbox sent it, when, and the exact copy that went out. */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, leadId } = await params;

  try {
    await authenticateOrganisationRequest(request, { organisationId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const emails = await listLeadEmailHistory(prisma, organisationId, leadId);
  return NextResponse.json({ emails });
}
