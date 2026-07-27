import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { exportLeadData } from "@mail-orbyt/compliance";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ organisationId: string; leadId: string }>;
}

/** GDPR/CCPA "right to access" — every record the product holds about this lead, as a single downloadable bundle. */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const bundle = await exportLeadData(prisma, organisationId, leadId, session.user.id);
  if (!bundle) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  return NextResponse.json(bundle);
}
