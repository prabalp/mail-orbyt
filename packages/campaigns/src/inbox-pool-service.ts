import type { PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "campaign" | "inbox" | "campaignInbox" | "$transaction">;

export class InvalidInboxPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInboxPoolError";
  }
}

/** Replaces a campaign's sending inbox pool. Every inbox must belong to the same organisation and be CONNECTED — an inbox mid-reauth or disconnected can't be added to a pool that Phase 8's scheduler will draw from. */
export async function setCampaignInboxes(
  prisma: Prisma,
  organisationId: string,
  campaignId: string,
  inboxIds: string[],
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.organisationId !== organisationId) return null;

  const inboxes = await prisma.inbox.findMany({ where: { id: { in: inboxIds } } });
  const foundIds = new Set(inboxes.map((inbox) => inbox.id));
  const missing = inboxIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new InvalidInboxPoolError(`Inbox(es) not found: ${missing.join(", ")}`);
  }
  const invalidOwner = inboxes.filter((inbox) => inbox.organisationId !== organisationId);
  if (invalidOwner.length > 0) {
    throw new InvalidInboxPoolError("All inboxes must belong to this organisation.");
  }
  const notConnected = inboxes.filter((inbox) => inbox.status !== "CONNECTED");
  if (notConnected.length > 0) {
    throw new InvalidInboxPoolError(
      `Inbox(es) must be CONNECTED to join a campaign pool: ${notConnected.map((i) => i.emailAddress).join(", ")}`,
    );
  }

  await prisma.$transaction([
    prisma.campaignInbox.deleteMany({ where: { campaignId } }),
    ...inboxIds.map((inboxId) => prisma.campaignInbox.create({ data: { campaignId, inboxId } })),
  ]);

  return prisma.campaignInbox.findMany({ where: { campaignId }, include: { inbox: true } });
}
