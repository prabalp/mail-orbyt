import type { PrismaClient } from "@mail-orbyt/database";
import { recordAuditEvent } from "./audit";
import { ForbiddenError } from "./errors";
import { hashPassword } from "./password";
import {
  generateSecureToken,
  hashToken,
  isTokenExpired,
  PASSWORD_RESET_TOKEN_TTL_MS,
  tokenExpiryDate,
} from "./tokens";
import type { EmailSender } from "./email/sender";
import { passwordResetEmail } from "./email/templates";

type Prisma = Pick<
  PrismaClient,
  "user" | "passwordResetToken" | "session" | "auditEvent" | "$transaction"
>;

/**
 * Always resolves successfully whether or not the email is registered, so
 * this endpoint can never be used to enumerate which emails have accounts.
 */
export async function requestPasswordReset(
  prisma: Prisma,
  emailSender: EmailSender,
  params: { email: string; appUrl: string },
): Promise<void> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) return;

  const rawToken = generateSecureToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token: hashToken(rawToken),
      expiresAt: tokenExpiryDate(PASSWORD_RESET_TOKEN_TTL_MS),
    },
  });

  await recordAuditEvent(prisma, { type: "PASSWORD_RESET_REQUESTED", userId: user.id });

  await emailSender.send(
    passwordResetEmail({ to: normalizedEmail, appUrl: params.appUrl, rawToken }),
  );
}

/**
 * Completing a reset also invalidates every existing session for the user —
 * a stolen session should not survive a password reset.
 */
export async function completePasswordReset(
  prisma: Prisma,
  params: { rawToken: string; newPassword: string },
): Promise<void> {
  const tokenHash = hashToken(params.rawToken);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token: tokenHash } });

  if (!resetToken || resetToken.consumedAt) {
    throw new ForbiddenError("This password reset link is invalid or has already been used");
  }
  if (isTokenExpired(resetToken.expiresAt)) {
    throw new ForbiddenError("This password reset link has expired");
  }

  const passwordHash = await hashPassword(params.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { consumedAt: new Date() },
    }),
    // Sessions are JWT-based (required by the Credentials provider), so this
    // is defense-in-depth for any adapter-persisted rows (e.g. from a
    // Google-login session for the same user) — the JWT callback's
    // passwordChangedAt comparison is what actually invalidates the token.
    prisma.session.deleteMany({ where: { userId: resetToken.userId } }),
  ]);

  await recordAuditEvent(prisma, {
    type: "PASSWORD_RESET_COMPLETED",
    userId: resetToken.userId,
  });
}
