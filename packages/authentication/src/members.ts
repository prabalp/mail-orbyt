import type { OrganisationRole, PrismaClient } from "@mail-orbyt/database";
import { recordAuditEvent } from "./audit";
import { ForbiddenError } from "./errors";
import { canAssignRole } from "./permissions";

type Prisma = Pick<PrismaClient, "organisationMembership" | "auditEvent">;

async function assertNotLastOwner(
  prisma: Prisma,
  organisationId: string,
  membershipBeingChanged: { userId: string; role: OrganisationRole },
): Promise<void> {
  if (membershipBeingChanged.role !== "OWNER") return;
  const ownerCount = await prisma.organisationMembership.count({
    where: { organisationId, role: "OWNER" },
  });
  if (ownerCount <= 1) {
    throw new ForbiddenError("An organisation must always have at least one owner");
  }
}

export interface UpdateMemberRoleParams {
  organisationId: string;
  targetUserId: string;
  newRole: OrganisationRole;
  actingUserId: string;
  actingRole: OrganisationRole;
}

export async function updateMemberRole(
  prisma: Prisma,
  params: UpdateMemberRoleParams,
): Promise<void> {
  if (!canAssignRole(params.actingRole, params.newRole)) {
    throw new ForbiddenError(`You cannot assign the ${params.newRole} role`);
  }

  const membership = await prisma.organisationMembership.findUnique({
    where: {
      organisationId_userId: { organisationId: params.organisationId, userId: params.targetUserId },
    },
  });
  if (!membership) {
    throw new ForbiddenError("That user is not a member of this organisation");
  }

  if (membership.role !== params.newRole) {
    await assertNotLastOwner(prisma, params.organisationId, membership);
  }

  await prisma.organisationMembership.update({
    where: { id: membership.id },
    data: { role: params.newRole },
  });

  await recordAuditEvent(prisma, {
    type: "MEMBERSHIP_ROLE_CHANGED",
    organisationId: params.organisationId,
    userId: params.actingUserId,
    metadata: { targetUserId: params.targetUserId, newRole: params.newRole },
  });
}

export interface RemoveMemberParams {
  organisationId: string;
  targetUserId: string;
  actingUserId: string;
}

export async function removeMember(prisma: Prisma, params: RemoveMemberParams): Promise<void> {
  const membership = await prisma.organisationMembership.findUnique({
    where: {
      organisationId_userId: { organisationId: params.organisationId, userId: params.targetUserId },
    },
  });
  if (!membership) {
    throw new ForbiddenError("That user is not a member of this organisation");
  }

  await assertNotLastOwner(prisma, params.organisationId, membership);

  await prisma.organisationMembership.delete({ where: { id: membership.id } });

  await recordAuditEvent(prisma, {
    type: "MEMBERSHIP_REMOVED",
    organisationId: params.organisationId,
    userId: params.actingUserId,
    metadata: { targetUserId: params.targetUserId },
  });
}
