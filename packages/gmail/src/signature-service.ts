import type { PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "signature">;

export async function listSignatures(prisma: Prisma, organisationId: string) {
  return prisma.signature.findMany({ where: { organisationId }, orderBy: { createdAt: "asc" } });
}

export interface CreateSignatureParams {
  label: string;
  content: string;
  /** First signature created for an organisation becomes the default automatically. */
  isDefault?: boolean;
}

/** Creates a signature for an organisation, shared across all of its inboxes. If it's the organisation's first signature, or isDefault is explicitly set, it becomes (or replaces) the default — see setDefaultSignature for the "exactly one default" invariant. */
export async function createSignature(
  prisma: Prisma & { $transaction: PrismaClient["$transaction"] },
  organisationId: string,
  params: CreateSignatureParams,
) {
  const existingCount = await prisma.signature.count({ where: { organisationId } });
  const makeDefault = params.isDefault ?? existingCount === 0;

  if (makeDefault) {
    return prisma.$transaction(async (tx) => {
      await tx.signature.updateMany({ where: { organisationId }, data: { isDefault: false } });
      return tx.signature.create({
        data: { organisationId, label: params.label, content: params.content, isDefault: true },
      });
    });
  }

  return prisma.signature.create({
    data: { organisationId, label: params.label, content: params.content, isDefault: false },
  });
}

async function assertOwnedSignature(prisma: Prisma, organisationId: string, signatureId: string) {
  const signature = await prisma.signature.findUnique({ where: { id: signatureId } });
  if (!signature || signature.organisationId !== organisationId) return null;
  return signature;
}

export interface UpdateSignatureParams {
  label?: string;
  content?: string;
}

export async function updateSignature(
  prisma: Prisma,
  organisationId: string,
  signatureId: string,
  patch: UpdateSignatureParams,
) {
  if (!(await assertOwnedSignature(prisma, organisationId, signatureId))) return null;
  return prisma.signature.update({ where: { id: signatureId }, data: patch });
}

/** Marks one signature as the organisation's default, atomically unsetting any other default for that organisation — at most one default per organisation, ever. */
export async function setDefaultSignature(
  prisma: Prisma & { $transaction: PrismaClient["$transaction"] },
  organisationId: string,
  signatureId: string,
) {
  if (!(await assertOwnedSignature(prisma, organisationId, signatureId))) return null;

  return prisma.$transaction(async (tx) => {
    await tx.signature.updateMany({ where: { organisationId }, data: { isDefault: false } });
    return tx.signature.update({ where: { id: signatureId }, data: { isDefault: true } });
  });
}

export async function deleteSignature(prisma: Prisma, organisationId: string, signatureId: string) {
  const signature = await assertOwnedSignature(prisma, organisationId, signatureId);
  if (!signature) return null;
  await prisma.signature.delete({ where: { id: signatureId } });
  return signature;
}

/** Resolves the text to append as the organisation's signature — its default Signature.content if one exists, else undefined so callers fall back to the plain "Best,\n{senderName}" line. Shared across every inbox in the organisation. */
export async function resolveDefaultSignatureText(
  prisma: Prisma,
  organisationId: string,
): Promise<string | undefined> {
  const signature = await prisma.signature.findFirst({ where: { organisationId, isDefault: true } });
  return signature?.content;
}
