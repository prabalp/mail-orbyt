import {
  ForbiddenError,
  requireOrganisationMembership,
  UnauthenticatedError,
} from "@mail-orbyt/authentication";
import { prisma, type OrganisationMembership } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Personal access tokens are managed from the web UI only: a bearer token
 * (OAuth or personal) must never be able to mint, list or revoke them,
 * otherwise one leaked token could create unlimited long-lived ones.
 */
export async function requireSessionMember(
  request: Request,
  organisationId: string,
): Promise<{ userId: string; membership: OrganisationMembership } | NextResponse> {
  if (request.headers.get("authorization")) {
    return NextResponse.json(
      { error: "Personal access tokens can only be managed from the web app" },
      { status: 403 },
    );
  }
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthenticatedError();
    const membership = await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
    });
    return { userId: session.user.id, membership };
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
