import { recordAuditEvent } from "@mail-orbyt/authentication";
import type { PrismaClient, SuppressionReason } from "@mail-orbyt/database";
import { extractDomainFromEmail, normalizeEmail } from "./normalize";

type Prisma = Pick<PrismaClient, "suppressionEntry" | "auditEvent">;

/**
 * Central suppression check — every send path (Phase 8+) and every place
 * that decides whether a lead is contactable must call this rather than
 * querying SuppressionEntry directly, so the email/domain matching logic
 * lives in exactly one place.
 */
export async function isSuppressed(
  prisma: Prisma,
  organisationId: string,
  email: string,
): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  const domain = extractDomainFromEmail(normalizedEmail);

  const match = await prisma.suppressionEntry.findFirst({
    where: {
      organisationId,
      OR: [
        { type: "EMAIL", value: normalizedEmail },
        ...(domain ? [{ type: "DOMAIN" as const, value: domain }] : []),
      ],
    },
  });

  return match !== null;
}

export interface SuppressionEntrySummary {
  id: string;
  type: "EMAIL" | "DOMAIN";
  value: string;
  reason: SuppressionReason;
  note: string | null;
  createdAt: Date;
}

export interface ListSuppressionParams {
  organisationId: string;
  search?: string;
  type?: "EMAIL" | "DOMAIN";
  page: number;
  pageSize: number;
}

export async function listSuppressionEntries(
  prisma: Prisma,
  params: ListSuppressionParams,
): Promise<{ entries: SuppressionEntrySummary[]; totalCount: number }> {
  const where = {
    organisationId: params.organisationId,
    ...(params.type ? { type: params.type } : {}),
    ...(params.search
      ? { value: { contains: params.search.trim().toLowerCase(), mode: "insensitive" as const } }
      : {}),
  };

  const [entries, totalCount] = await Promise.all([
    prisma.suppressionEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.suppressionEntry.count({ where }),
  ]);

  return {
    entries: entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      value: entry.value,
      reason: entry.reason,
      note: entry.note,
      createdAt: entry.createdAt,
    })),
    totalCount,
  };
}

/**
 * Deletes by (type, value) rather than by id: a caller who knows an address
 * is suppressed — which is what `isSuppressed`/`checkSuppression` tell them —
 * does not necessarily know the row's id, and the pair is already unique per
 * organisation. Normalizes the value the same way `addSuppressionEntry`
 * does, so "Foo@Bar.com " removes the entry "foo@bar.com" created from it.
 * Returns whether anything was actually removed.
 */
export async function removeSuppressionEntry(
  prisma: Prisma,
  params: {
    organisationId: string;
    type: "EMAIL" | "DOMAIN";
    value: string;
    actingUserId?: string;
  },
): Promise<boolean> {
  const normalizedValue =
    params.type === "EMAIL" ? normalizeEmail(params.value) : params.value.trim().toLowerCase();

  const { count } = await prisma.suppressionEntry.deleteMany({
    where: {
      organisationId: params.organisationId,
      type: params.type,
      value: normalizedValue,
    },
  });

  if (count === 0) return false;

  await recordAuditEvent(prisma, {
    type: "SUPPRESSION_REMOVED",
    organisationId: params.organisationId,
    userId: params.actingUserId,
    metadata: { type: params.type, value: normalizedValue },
  });

  return true;
}

/**
 * The explain-yourself counterpart to `isSuppressed`: same matching rules,
 * but reports WHICH entry matched (the address itself, or a blanket domain
 * block) so an operator can act on it instead of guessing.
 */
export async function checkSuppression(
  prisma: Prisma,
  organisationId: string,
  email: string,
): Promise<{ suppressed: boolean; matchedBy?: SuppressionEntrySummary }> {
  const normalizedEmail = normalizeEmail(email);
  const domain = extractDomainFromEmail(normalizedEmail);

  const match = await prisma.suppressionEntry.findFirst({
    where: {
      organisationId,
      OR: [
        { type: "EMAIL", value: normalizedEmail },
        ...(domain ? [{ type: "DOMAIN" as const, value: domain }] : []),
      ],
    },
    // An exact address match is the more specific, more actionable answer, so
    // prefer it over a domain-wide block when both exist.
    orderBy: { type: "asc" },
  });

  if (!match) return { suppressed: false };

  return {
    suppressed: true,
    matchedBy: {
      id: match.id,
      type: match.type,
      value: match.value,
      reason: match.reason,
      note: match.note,
      createdAt: match.createdAt,
    },
  };
}

export interface AddSuppressionParams {
  organisationId: string;
  type: "EMAIL" | "DOMAIN";
  value: string;
  reason: SuppressionReason;
  createdByUserId?: string;
  note?: string;
}

export async function addSuppressionEntry(
  prisma: Prisma,
  params: AddSuppressionParams,
): Promise<void> {
  const normalizedValue =
    params.type === "EMAIL" ? normalizeEmail(params.value) : params.value.trim().toLowerCase();

  await prisma.suppressionEntry.upsert({
    where: {
      organisationId_type_value: {
        organisationId: params.organisationId,
        type: params.type,
        value: normalizedValue,
      },
    },
    create: {
      organisationId: params.organisationId,
      type: params.type,
      value: normalizedValue,
      reason: params.reason,
      createdByUserId: params.createdByUserId,
      note: params.note,
    },
    update: { reason: params.reason, note: params.note },
  });

  await recordAuditEvent(prisma, {
    type: "SUPPRESSION_CREATED",
    organisationId: params.organisationId,
    userId: params.createdByUserId,
    metadata: { type: params.type, reason: params.reason },
  });
}
