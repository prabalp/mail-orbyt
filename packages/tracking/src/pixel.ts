import type { PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "outboxItem" | "emailOpenEvent">;

// Smallest possible valid GIF: a 1x1 transparent image. Served for every
// pixel request regardless of whether the token resolved, so a broken or
// expired link never shows a broken-image icon in the recipient's client.
export const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7",
  "base64",
);
export const TRANSPARENT_GIF_CONTENT_TYPE = "image/gif";

/** The `<img>` tag appended to the HTML mail part only — the plain-text part is never touched. */
export function buildPixelImgTag(domain: string, outboxItemId: string): string {
  const url = buildPixelUrl(domain, outboxItemId);
  return `<img src="${url}" width="1" height="1" alt="" style="display:none" border="0">`;
}

export function buildPixelUrl(domain: string, outboxItemId: string): string {
  return `https://${domain}/o/${outboxItemId}.gif`;
}

/**
 * Records one pixel hit: logs a raw EmailOpenEvent (for later bot-prefetch
 * filtering/analytics) and increments OutboxItem.openCount, setting
 * firstOpenedAt only the first time. No-ops silently for an unknown id —
 * the pixel response must never depend on whether the token was valid.
 */
export async function recordEmailOpen(
  prisma: Prisma,
  outboxItemId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null },
): Promise<void> {
  const item = await prisma.outboxItem.findUnique({
    where: { id: outboxItemId },
    select: { organisationId: true, firstOpenedAt: true },
  });
  if (!item) return;

  await Promise.all([
    prisma.emailOpenEvent.create({
      data: {
        outboxItemId,
        organisationId: item.organisationId,
        ipAddress: meta.ipAddress ?? undefined,
        userAgent: meta.userAgent ?? undefined,
      },
    }),
    prisma.outboxItem.update({
      where: { id: outboxItemId },
      data: {
        openCount: { increment: 1 },
        firstOpenedAt: item.firstOpenedAt ?? new Date(),
      },
    }),
  ]);
}
