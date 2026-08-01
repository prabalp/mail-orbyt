import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getKeywordExtractionState, startKeywordExtractionJob } from "@/lib/research";

interface RouteParams {
  params: Promise<{ organisationId: string; leadId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, leadId } = await params;

  try {
    await requireOrganisationMembership(prisma, { userId: session.user.id, organisationId });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const state = await getKeywordExtractionState({ organisationId, leadId });
  return NextResponse.json(state);
}

export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, leadId } = await params;

  try {
    await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "research:review",
    });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.organisationId !== organisationId) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const result = await startKeywordExtractionJob({ organisationId, leadId });
  if (!result) {
    return NextResponse.json(
      { error: "No saved website text yet — run research first" },
      { status: 409 },
    );
  }

  return NextResponse.json(result, { status: 201 });
}
