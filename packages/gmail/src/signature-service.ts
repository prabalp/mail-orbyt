import type { PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "inbox" | "signature">;

async function assertOwnedInbox(prisma: Prisma, organisationId: string, inboxId: string) {
  const inbox = await prisma.inbox.findUnique({ where: { id: inboxId } });
  if (!inbox || inbox.organisationId !== organisationId) return null;
  return inbox;
}

export async function listSignatures(prisma: Prisma, organisationId: string, inboxId: string) {
  if (!(await assertOwnedInbox(prisma, organisationId, inboxId))) return null;
  return prisma.signature.findMany({ where: { inboxId }, orderBy: { createdAt: "asc" } });
}

export interface CreateSignatureParams {
  label: string;
  content: string;
  /** First signature created for an inbox becomes the default automatically. */
  isDefault?: boolean;
}

/** Creates a signature for an inbox. If it's the inbox's first signature, or isDefault is explicitly set, it becomes (or replaces) the default — see setDefaultSignature for the "exactly one default" invariant. */
export async function createSignature(
  prisma: Prisma & { $transaction: PrismaClient["$transaction"] },
  organisationId: string,
  inboxId: string,
  params: CreateSignatureParams,
) {
  if (!(await assertOwnedInbox(prisma, organisationId, inboxId))) return null;

  const existingCount = await prisma.signature.count({ where: { inboxId } });
  const makeDefault = params.isDefault ?? existingCount === 0;

  if (makeDefault) {
    return prisma.$transaction(async (tx) => {
      await tx.signature.updateMany({ where: { inboxId }, data: { isDefault: false } });
      return tx.signature.create({
        data: { inboxId, label: params.label, content: params.content, isDefault: true },
      });
    });
  }

  return prisma.signature.create({
    data: { inboxId, label: params.label, content: params.content, isDefault: false },
  });
}

async function assertOwnedSignature(
  prisma: Prisma,
  organisationId: string,
  inboxId: string,
  signatureId: string,
) {
  if (!(await assertOwnedInbox(prisma, organisationId, inboxId))) return null;
  const signature = await prisma.signature.findUnique({ where: { id: signatureId } });
  if (!signature || signature.inboxId !== inboxId) return null;
  return signature;
}

export interface UpdateSignatureParams {
  label?: string;
  content?: string;
}

export async function updateSignature(
  prisma: Prisma,
  organisationId: string,
  inboxId: string,
  signatureId: string,
  patch: UpdateSignatureParams,
) {
  if (!(await assertOwnedSignature(prisma, organisationId, inboxId, signatureId))) return null;
  return prisma.signature.update({ where: { id: signatureId }, data: patch });
}

/** Marks one signature as the inbox's default, atomically unsetting any other default for that inbox — at most one default per inbox, ever. */
export async function setDefaultSignature(
  prisma: Prisma & { $transaction: PrismaClient["$transaction"] },
  organisationId: string,
  inboxId: string,
  signatureId: string,
) {
  if (!(await assertOwnedSignature(prisma, organisationId, inboxId, signatureId))) return null;

  return prisma.$transaction(async (tx) => {
    await tx.signature.updateMany({ where: { inboxId }, data: { isDefault: false } });
    return tx.signature.update({ where: { id: signatureId }, data: { isDefault: true } });
  });
}

export async function deleteSignature(
  prisma: Prisma,
  organisationId: string,
  inboxId: string,
  signatureId: string,
) {
  const signature = await assertOwnedSignature(prisma, organisationId, inboxId, signatureId);
  if (!signature) return null;
  await prisma.signature.delete({ where: { id: signatureId } });
  return signature;
}

/** Resolves the text to append as this inbox's signature — its default Signature.content if one exists, else undefined so callers fall back to the plain "Best,\n{senderName}" line. */
export async function resolveDefaultSignatureText(
  prisma: Prisma,
  inboxId: string,
): Promise<string | undefined> {
  const signature = await prisma.signature.findFirst({ where: { inboxId, isDefault: true } });
  return signature?.content;
}
