import { ForbiddenError, listMembers, UnauthenticatedError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

/**
 * The roster behind `/members/[userId]`'s PATCH and DELETE — those take a
 * userId the caller has no other way to discover. Readable by any member
 * (membership-only, no `members:manage`): seeing who you work with is not
 * privileged, changing them is.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  try {
    await authenticateOrganisationRequest(request, { organisationId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const members = await listMembers(prisma, organisationId);
  return NextResponse.json({ members });
}
