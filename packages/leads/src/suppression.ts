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
