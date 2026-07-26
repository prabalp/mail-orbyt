import {
  ForbiddenError,
  removeMember,
  requireOrganisationMembership,
  updateMemberRole,
} from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

const bodySchema = z.object({ role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]) });

interface RouteParams {
  params: Promise<{ organisationId: string; userId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, userId } = await params;

  let membership;
  try {
    membership = await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "members:manage",
    });
  } catch (error) {
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
      actingUserId: session.user.id,
      actingRole: membership.role,
    });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  return NextResponse.json({ status: "ok" });
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, userId } = await params;

  try {
    await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "members:manage",
    });
    await removeMember(prisma, {
      organisationId,
      targetUserId: userId,
      actingUserId: session.user.id,
    });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  return NextResponse.json({ status: "ok" });
}
