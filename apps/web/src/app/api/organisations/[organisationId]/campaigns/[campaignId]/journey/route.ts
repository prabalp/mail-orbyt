import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { getJourneyGraph, InvalidJourneyGraphError, saveJourneyGraph } from "@mail-orbyt/campaigns";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string }>;
}

async function authenticate(
  request: Request,
  organisationId: string,
  permission?: "campaigns:manage",
): Promise<NextResponse | null> {
  try {
    await authenticateOrganisationRequest(request, { organisationId, permission });
    return null;
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, campaignId } = await params;
  const denied = await authenticate(request, organisationId);
  if (denied) return denied;

  const result = await getJourneyGraph(prisma, organisationId, campaignId);
  if (!result.found) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json({ graph: result.graph });
}

/** Replaces the whole graph in one validated write — the editor saves nodes, connections and variable mappings together. */
export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, campaignId } = await params;
  const denied = await authenticate(request, organisationId, "campaigns:manage");
  if (denied) return denied;

  try {
    const graph = await saveJourneyGraph(
      prisma,
      organisationId,
      campaignId,
      await request.json().catch(() => null),
    );
    if (!graph) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    return NextResponse.json({ graph });
  } catch (error) {
    if (error instanceof InvalidJourneyGraphError) {
      return NextResponse.json({ error: error.message, errors: error.errors }, { status: 400 });
    }
    throw error;
  }
}
