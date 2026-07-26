import { PrismaAdapter } from "@auth/prisma-adapter";
import type { PrismaClient } from "@mail-orbyt/database";
import { emailSchema } from "@mail-orbyt/validation";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { recordAuditEvent } from "./audit";
import { verifyPassword } from "./password";

const credentialsSchema = z.object({ email: emailSchema, password: z.string().min(1) });

export interface BuildAuthConfigParams {
  prisma: PrismaClient;
  googleClientId: string;
  googleClientSecret: string;
  authSecret: string;
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

  return {
    adapter: PrismaAdapter(prisma),
    secret: params.authSecret,
    session: { strategy: "jwt" },
    pages: { signIn: "/sign-in" },
    providers: [
      Google({ clientId: params.googleClientId, clientSecret: params.googleClientSecret }),
      Credentials({
        credentials: { email: {}, password: {} },
        authorize: async (rawCredentials) => {
          const parsed = credentialsSchema.safeParse(rawCredentials);
          if (!parsed.success) return null;

          const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
          if (!user?.passwordHash) return null;
          if (!user.emailVerified) return null;

          const isValid = await verifyPassword(parsed.data.password, user.passwordHash);
          if (!isValid) return null;

          return { id: user.id, email: user.email, name: user.name };
        },
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
