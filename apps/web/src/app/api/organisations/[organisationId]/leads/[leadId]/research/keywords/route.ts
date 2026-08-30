import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { getKeywordExtractionState, startKeywordExtractionJob } from "@/lib/research";

interface RouteParams {
  params: Promise<{ organisationId: string; leadId: string }>;
}

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

  const state = await getKeywordExtractionState({ organisationId, leadId });
  return NextResponse.json(state);
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, leadId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "research:review",
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.organisationId !== organisationId) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const result = await startKeywordExtractionJob({ organisationId, leadId });
  if (!result) {
    return NextResponse.json(
      { error: "No saved website text yet: run research first" },
      { status: 409 },
    );
  }

  return NextResponse.json(result, { status: 201 });
}
