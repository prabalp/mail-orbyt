import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { deleteLeadData } from "@mail-orbyt/compliance";
import { getLead } from "@mail-orbyt/leads";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

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

  const lead = await getLead(prisma, organisationId, leadId);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const company = lead.companyId
    ? await prisma.company.findUnique({ where: { id: lead.companyId } })
    : null;

  return NextResponse.json({ lead, company });
}

/** GDPR/CCPA right to erasure. Cascade-deletes every table tied to this lead (research facts, drafts, enrollments, outbox items, conversations, meetings) via the schema's onDelete: Cascade FKs, and records a DATA_DELETED audit event. */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, leadId } = await params;

  try {
    await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "leads:manage",
    });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const deleted = await deleteLeadData(prisma, organisationId, leadId, session.user.id);
  if (!deleted) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  return NextResponse.json({ status: "ok" });
}
