import type { OrganisationMembership, PrismaClient } from "@mail-orbyt/database";
import { ForbiddenError } from "./errors";
import { hasPermission, type Permission } from "./permissions";

/**
 * The ONLY sanctioned way to authorize an organisation-scoped action.
 *
 * Tenant isolation must never rely on an `organisationId` supplied by the
 * browser being correct — a client can send any ID it likes. This function
 * re-derives access from the database using the authenticated user's ID
 * (from the session, never from request body/query) and the claimed
 * organisation ID, and throws if there is no membership row (or the
 * membership lacks the required permission). Every API route and server
 * action that touches organisation-scoped data must call this before
 * reading or writing anything.
 */
export async function requireOrganisationMembership(
  prisma: Pick<PrismaClient, "organisationMembership">,
  params: { userId: string; organisationId: string; permission?: Permission },
): Promise<OrganisationMembership> {
  const membership = await prisma.organisationMembership.findUnique({
    where: {
      organisationId_userId: {
        organisationId: params.organisationId,
        userId: params.userId,
      },
    },
  });

  if (!membership) {
    throw new ForbiddenError("You are not a member of this organisation");
  }

  if (params.permission && !hasPermission(membership.role, params.permission)) {
    throw new ForbiddenError(`Missing required permission: ${params.permission}`);
  }

  return membership;
}
