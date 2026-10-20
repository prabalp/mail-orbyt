import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { deleteLeadList } from "@mail-orbyt/leads";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string; leadListId: string }>;
}

/** Deletes the list itself; its memberships go with it but the leads are untouched. */
export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, leadListId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "leads:manage",
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

  const deleted = await deleteLeadList(prisma, organisationId, leadListId);
  if (!deleted) return NextResponse.json({ error: "Lead list not found" }, { status: 404 });
  return NextResponse.json({ status: "ok" });
}
