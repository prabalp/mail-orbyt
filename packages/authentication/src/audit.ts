import type { AuditEventType, Prisma, PrismaClient } from "@mail-orbyt/database";

export interface RecordAuditEventParams {
  type: AuditEventType;
  organisationId?: string;
  userId?: string;
  /** Non-sensitive structured context only — never tokens, passwords, or email bodies. */
  metadata?: Prisma.InputJsonValue;
}

const FORBIDDEN_METADATA_KEYS = [
  "password",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "body",
];

function assertSafeMetadata(metadata: Prisma.InputJsonValue | undefined): void {
  if (!metadata || typeof metadata !== "object") return;
  for (const key of Object.keys(metadata as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (FORBIDDEN_METADATA_KEYS.some((forbidden) => normalized.includes(forbidden))) {
      throw new Error(
        `Refusing to record audit event metadata with sensitive-looking key "${key}"`,
      );
    }
  }
}

/**
 * Central audit logging entry point. Every write path that the spec
 * requires an audit trail for (login, password reset, invitation,
 * membership changes, inbox connection, campaign launch/pause,
 * suppression, data export/deletion) must call this instead of writing to
 * AuditEvent directly, so the metadata safety check below is never
 * bypassed.
 */
export async function recordAuditEvent(
  prisma: Pick<PrismaClient, "auditEvent">,
  params: RecordAuditEventParams,
): Promise<void> {
  assertSafeMetadata(params.metadata);

  await prisma.auditEvent.create({
    data: {
      type: params.type,
      ...(params.organisationId ? { organisationId: params.organisationId } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    },
  });
}
