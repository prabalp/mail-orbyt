import type { PrismaClient } from "@mail-orbyt/database";

export function normalizeExclusionEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Whether this address is on the campaign's own no-contact list (see CampaignExclusion). */
export async function isCampaignExcluded(
  prisma: Pick<PrismaClient, "campaignExclusion">,
  campaignId: string,
  email: string,
): Promise<boolean> {
  const match = await prisma.campaignExclusion.findUnique({
    where: { campaignId_email: { campaignId, email: normalizeExclusionEmail(email) } },
    select: { id: true },
  });
  return match !== null;
}
