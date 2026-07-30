import type { PrismaClient, User } from "@mail-orbyt/database";
import { hashPassword } from "./password";
import {
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  generateSecureToken,
  hashToken,
  tokenExpiryDate,
} from "./tokens";
import type { EmailSender } from "./email/sender";
import { verificationEmail } from "./email/templates";

export class EmailAlreadyInUseError extends Error {
  constructor() {
    super("An account with this email already exists");
    this.name = "EmailAlreadyInUseError";
  }
}

type SignUpPrisma = Pick<PrismaClient, "user">;

export interface SignUpParams {
  name: string;
  email: string;
  password: string;
  appUrl: string;
}

export async function signUp(
  prisma: SignUpPrisma,
  emailSender: EmailSender,
  params: SignUpParams,
): Promise<User> {
  const normalizedEmail = params.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw new EmailAlreadyInUseError();
  }

  const passwordHash = await hashPassword(params.password);
  const rawToken = generateSecureToken();
  const user = await prisma.user.create({
    data: {
      name: params.name.trim(),
      email: normalizedEmail,
      passwordHash,
      emailVerificationTokens: {
        create: {
          token: hashToken(rawToken),
          expiresAt: tokenExpiryDate(EMAIL_VERIFICATION_TOKEN_TTL_MS),
        },
      },
    },
  });

  try {
    await emailSender.send(
      verificationEmail({ to: normalizedEmail, appUrl: params.appUrl, rawToken }),
    );
  } catch (error) {
    // Sending is the last step: if it fails, undo the user/token creation so
    // the caller sees a clean failure and can retry with the same email
    // instead of hitting EmailAlreadyInUseError on the next attempt.
    await prisma.user.delete({ where: { id: user.id } });
    throw error;
  }

  return user;
}
