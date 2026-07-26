import type { PrismaClient } from "@mail-orbyt/database";
import { ForbiddenError } from "./errors";
import { hashToken, isTokenExpired } from "./tokens";

type Prisma = Pick<PrismaClient, "emailVerificationToken" | "user" | "$transaction">;

export async function verifyEmail(prisma: Prisma, rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const verificationToken = await prisma.emailVerificationToken.findUnique({
    where: { token: tokenHash },
  });

  if (!verificationToken || verificationToken.consumedAt) {
    throw new ForbiddenError("This verification link is invalid or has already been used");
  }

  if (isTokenExpired(verificationToken.expiresAt)) {
    throw new ForbiddenError("This verification link has expired");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: verificationToken.userId },
      data: { emailVerified: new Date() },
    }),
    prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { consumedAt: new Date() },
    }),
  ]);
}
