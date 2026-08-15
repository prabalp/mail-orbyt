import {
  ForbiddenError,
  removeMember,
  UnauthenticatedError,
  updateMemberRole,
} from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

const bodySchema = z.object({ role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]) });

interface RouteParams {
  params: Promise<{ organisationId: string; userId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, userId } = await params;

  let actingUserId: string;
  let membership: Awaited<ReturnType<typeof authenticateOrganisationRequest>>["membership"];
  try {
    ({ userId: actingUserId, membership } = await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "members:manage",
    }));
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    await updateMemberRole(prisma, {
      organisationId,
      targetUserId: userId,
      newRole: parsed.data.role,
      actingUserId,
      actingRole: membership.role,
    });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  return NextResponse.json({ status: "ok" });
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, userId } = await params;

  let actingUserId: string;
  try {
    ({ userId: actingUserId } = await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "members:manage",
    }));
    await removeMember(prisma, {
      organisationId,
      targetUserId: userId,
      actingUserId,
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  return NextResponse.json({ status: "ok" });
}
