import {
  createInvitation,
  ForbiddenError,
  invitationEmail,
  UnauthenticatedError,
} from "@mail-orbyt/authentication";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { emailSchema } from "@mail-orbyt/validation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { emailSender } from "@/lib/email";

const bodySchema = z.object({
  email: emailSchema,
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "members:manage",
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

  const invitations = await prisma.invitation.findMany({
    where: { organisationId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    })),
  });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  let userId: string;
  let membership: Awaited<ReturnType<typeof authenticateOrganisationRequest>>["membership"];
  try {
    ({ userId, membership } = await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "members:manage",
    }));
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (parsed.data.role === "ADMIN" && membership.role !== "OWNER" && membership.role !== "ADMIN") {
    return NextResponse.json({ error: "You cannot invite an admin" }, { status: 403 });
  }

  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: organisationId },
  });
  const inviter = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const { invitation, rawToken } = await createInvitation(prisma, {
    organisationId,
    email: parsed.data.email,
    role: parsed.data.role,
    invitedByUserId: userId,
  });

  const env = loadEnv();
  await emailSender.send(
    invitationEmail({
      to: invitation.email,
      appUrl: env.APP_URL,
      rawToken,
      organisationName: organisation.name,
      inviterName: inviter.name ?? inviter.email,
    }),
  );

  return NextResponse.json({ id: invitation.id, email: invitation.email }, { status: 201 });
}
