import type { PrismaClient } from "@mail-orbyt/database";

export async function findActivePlatformGrant(
  prisma: Pick<PrismaClient, "mcpPlatformGrant">,
  params: { userId: string; clientRowId: string },
) {
  return prisma.mcpPlatformGrant.findFirst({
    where: { userId: params.userId, clientId: params.clientRowId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

/** Records the one-time platform consent. Reuses an existing unrevoked grant rather than stacking duplicates. */
export async function createPlatformGrant(
  prisma: Pick<PrismaClient, "mcpPlatformGrant">,
  params: { userId: string; organisationId: string; clientRowId: string; scope: string },
) {
  const existing = await findActivePlatformGrant(prisma, params);
  if (existing) return existing;
  return prisma.mcpPlatformGrant.create({
    data: {
      userId: params.userId,
      organisationId: params.organisationId,
      clientId: params.clientRowId,
      scope: params.scope,
    },
  });
}

/** Revokes the grant AND every access/refresh token issued or exchanged under it. */
export async function revokePlatformGrants(
  prisma: Pick<PrismaClient, "mcpPlatformGrant" | "mcpAccessToken" | "mcpRefreshToken">,
  where: { userId: string; clientRowId: string; organisationId?: string },
): Promise<void> {
  const now = new Date();
  const grants = await prisma.mcpPlatformGrant.findMany({
    where: {
      userId: where.userId,
      clientId: where.clientRowId,
      ...(where.organisationId ? { organisationId: where.organisationId } : {}),
      revokedAt: null,
    },
    select: { id: true },
  });
  if (grants.length === 0) return;
  const ids = grants.map((g) => g.id);
  await prisma.mcpPlatformGrant.updateMany({
    where: { id: { in: ids } },
    data: { revokedAt: now },
  });
  const derived = { platformGrantId: { in: ids }, revokedAt: null };
  await prisma.mcpAccessToken.updateMany({ where: derived, data: { revokedAt: now } });
  await prisma.mcpRefreshToken.updateMany({ where: derived, data: { revokedAt: now } });
}
