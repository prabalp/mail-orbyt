import type { Invitation, OrganisationRole, PrismaClient } from "@mail-orbyt/database";
import { recordAuditEvent } from "./audit";
import { ForbiddenError } from "./errors";
import {
  generateSecureToken,
  hashToken,
  INVITATION_TOKEN_TTL_MS,
  isTokenExpired,
  tokenExpiryDate,
} from "./tokens";

type InvitationPrisma = Pick<
  PrismaClient,
  "invitation" | "organisationMembership" | "auditEvent" | "$transaction"
>;

export interface CreateInvitationParams {
  organisationId: string;
  email: string;
  role: OrganisationRole;
  invitedByUserId: string;
}

export interface CreateInvitationResult {
  invitation: Invitation;
  /** The raw, unhashed token — only ever available here, at creation time. Send it in the invite email; it cannot be recovered from the database afterwards. */
  rawToken: string;
}

/**
 * Creates an invitation, superseding (revoking) any prior pending invitation
 * for the same organisation + email so a stale link can never be used
 * alongside a fresh one.
 */
export async function createInvitation(
  prisma: InvitationPrisma,
  params: CreateInvitationParams,
): Promise<CreateInvitationResult> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);

  const invitation = await prisma.$transaction(async (tx) => {
    await tx.invitation.updateMany({
      where: { organisationId: params.organisationId, email: normalizedEmail, status: "PENDING" },
      data: { status: "REVOKED" },
    });

    return tx.invitation.create({
      data: {
        organisationId: params.organisationId,
        email: normalizedEmail,
        role: params.role,
        token: tokenHash,
        invitedByUserId: params.invitedByUserId,
        expiresAt: tokenExpiryDate(INVITATION_TOKEN_TTL_MS),
      },
    });
  });

  await recordAuditEvent(prisma, {
    type: "INVITATION_SENT",
    organisationId: params.organisationId,
    userId: params.invitedByUserId,
    metadata: { email: normalizedEmail, role: params.role },
  });

  return { invitation, rawToken };
}

export interface AcceptInvitationParams {
  rawToken: string;
  acceptingUserId: string;
  acceptingUserEmail: string;
}

/**
 * Accepts an invitation and creates the membership row inside a single
 * transaction, so a crash between "mark accepted" and "create membership"
 * can never leave the invitation consumed without granting access (or vice
 * versa).
 */
export async function acceptInvitation(
  prisma: InvitationPrisma,
  params: AcceptInvitationParams,
): Promise<void> {
  const tokenHash = hashToken(params.rawToken);
  const invitation = await prisma.invitation.findUnique({ where: { token: tokenHash } });

  if (!invitation || invitation.status !== "PENDING") {
    throw new ForbiddenError("This invitation is no longer valid");
  }

  if (isTokenExpired(invitation.expiresAt)) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    throw new ForbiddenError("This invitation has expired");
  }

  if (invitation.email !== params.acceptingUserEmail.trim().toLowerCase()) {
    throw new ForbiddenError("This invitation was sent to a different email address");
  }

  await prisma.$transaction(async (tx) => {
    await tx.organisationMembership.upsert({
      where: {
        organisationId_userId: {
          organisationId: invitation.organisationId,
          userId: params.acceptingUserId,
        },
      },
      create: {
        organisationId: invitation.organisationId,
        userId: params.acceptingUserId,
        role: invitation.role,
      },
      update: { role: invitation.role },
    });

    await tx.invitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED" } });
  });

  await recordAuditEvent(prisma, {
    type: "INVITATION_ACCEPTED",
    organisationId: invitation.organisationId,
    userId: params.acceptingUserId,
    metadata: { role: invitation.role },
  });
}

export async function revokeInvitation(
  prisma: Pick<PrismaClient, "invitation" | "auditEvent">,
  params: { invitationId: string; revokedByUserId: string; organisationId: string },
): Promise<void> {
  await prisma.invitation.update({
    where: { id: params.invitationId },
    data: { status: "REVOKED" },
  });

  await recordAuditEvent(prisma, {
    type: "INVITATION_REVOKED",
    organisationId: params.organisationId,
    userId: params.revokedByUserId,
  });
}
