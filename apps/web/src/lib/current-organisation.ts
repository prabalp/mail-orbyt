import { requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { cookies } from "next/headers";

export const ACTIVE_ORGANISATION_COOKIE = "activeOrganisationId";

export interface CurrentOrganisationContext {
  organisationId: string;
  organisationName: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  memberships: { id: string; name: string; role: string }[];
}

/**
 * Resolves which organisation the current request is scoped to. The cookie
 * value is untrusted input (a client could tamper with it), so it is always
 * re-validated against the database via requireOrganisationMembership
 * before being used for anything — this is the server-side half of tenant
 * isolation described in packages/authentication/src/tenant.ts.
 */
export async function getCurrentOrganisation(
  userId: string,
): Promise<CurrentOrganisationContext | null> {
  const memberships = await prisma.organisationMembership.findMany({
    where: { userId },
    include: { organisation: true },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const requestedOrganisationId = cookieStore.get(ACTIVE_ORGANISATION_COOKIE)?.value;

  const activeMembership =
    (requestedOrganisationId &&
      (await requireOrganisationMembership(prisma, {
        userId,
        organisationId: requestedOrganisationId,
      }).catch(() => null))) ||
    memberships[0];

  if (!activeMembership) return null;

  const activeOrganisation = memberships.find(
    (m) => m.organisationId === activeMembership.organisationId,
  );
  if (!activeOrganisation) return null;

  return {
    organisationId: activeOrganisation.organisationId,
    organisationName: activeOrganisation.organisation.name,
    role: activeOrganisation.role,
    memberships: memberships.map((m) => ({
      id: m.organisationId,
      name: m.organisation.name,
      role: m.role,
    })),
  };
}
