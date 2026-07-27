import { PrismaAdapter } from "@auth/prisma-adapter";
import type { PrismaClient } from "@mail-orbyt/database";
import { emailSchema } from "@mail-orbyt/validation";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { recordAuditEvent } from "./audit";
import { verifyPassword } from "./password";
import { createNoopRateLimiter, type RateLimiter } from "./rate-limiter";

const credentialsSchema = z.object({ email: emailSchema, password: z.string().min(1) });

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

export interface BuildAuthConfigParams {
  prisma: PrismaClient;
  googleClientId: string;
  googleClientSecret: string;
  authSecret: string;
  /** Defaults to a permissive no-op limiter (e.g. for tests) — a real deployment must pass a Redis-backed one. */
  rateLimiter?: RateLimiter;
}

/**
 * Extracted as a standalone function (rather than inlined into the
 * Credentials() call) so it can be unit-tested directly — NextAuth v5's
 * Credentials provider wraps `authorize` in framework-internal validation
 * that isn't reproducible by pulling the function back out of a built
 * NextAuthConfig in a test.
 */
export function createCredentialsAuthorize(prisma: PrismaClient, rateLimiter: RateLimiter) {
  return async (rawCredentials: unknown) => {
    const parsed = credentialsSchema.safeParse(rawCredentials);
    if (!parsed.success) return null;

    // Keyed by email, not IP (not available in this callback) — still
    // stops credential-stuffing against one account, which is the attack
    // this exists to slow down. Checked before the (more expensive)
    // password hash comparison so a flooded account doesn't also become a
    // bcrypt-cost DoS vector.
    const allowed = await rateLimiter.attempt(
      `login:${parsed.data.email}`,
      LOGIN_MAX_ATTEMPTS,
      LOGIN_WINDOW_SECONDS,
    );
    if (!allowed) return null;

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user?.passwordHash) return null;
    if (!user.emailVerified) return null;

    const isValid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!isValid) return null;

    await rateLimiter.reset(`login:${parsed.data.email}`);
    return { id: user.id, email: user.email, name: user.name };
  };
}

/**
 * Auth.js configuration for APPLICATION SIGN-IN ONLY. This is completely
 * separate from Gmail's OAuth client/tokens (packages/gmail, Phase 6) —
 * never reuse credentials or tokens between the two.
 *
 * Session strategy is JWT, not database, because Auth.js does not support
 * adapter-persisted (database) sessions for the Credentials provider. To
 * still support forced logout after a password reset, the jwt callback
 * embeds `passwordChangedAt` at sign-in and re-checks it against the
 * database on every subsequent call, surfacing a `session.error` the app
 * checks to force a sign-out.
 */
export function buildAuthConfig(params: BuildAuthConfigParams): NextAuthConfig {
  const { prisma } = params;
  const rateLimiter = params.rateLimiter ?? createNoopRateLimiter();

  return {
    adapter: PrismaAdapter(prisma),
    secret: params.authSecret,
    session: { strategy: "jwt" },
    pages: { signIn: "/sign-in" },
    providers: [
      Google({ clientId: params.googleClientId, clientSecret: params.googleClientSecret }),
      Credentials({
        credentials: { email: {}, password: {} },
        authorize: createCredentialsAuthorize(prisma, rateLimiter),
      }),
    ],
    callbacks: {
      async jwt({ token, user }) {
        if (user?.id) {
          token.userId = user.id;
          const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
          token.passwordChangedAt = dbUser?.passwordChangedAt?.getTime() ?? null;
          return token;
        }

        if (typeof token.userId === "string") {
          const dbUser = await prisma.user.findUnique({ where: { id: token.userId } });
          const currentChangedAt = dbUser?.passwordChangedAt?.getTime() ?? null;
          if (currentChangedAt !== (token.passwordChangedAt ?? null)) {
            token.error = "PasswordChanged";
          }
        }

        return token;
      },
      async session({ session, token }) {
        if (typeof token.userId === "string" && session.user) {
          session.user.id = token.userId;
        }
        if (token.error) {
          session.error = token.error as string;
        }
        return session;
      },
    },
    events: {
      async signIn({ user }) {
        if (user.id) {
          await recordAuditEvent(prisma, { type: "LOGIN", userId: user.id });
        }
      },
    },
  };
}
