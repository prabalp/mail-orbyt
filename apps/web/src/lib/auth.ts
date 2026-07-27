import { buildAuthConfig, createRedisRateLimiter } from "@mail-orbyt/authentication";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import NextAuth from "next-auth";
import { redisConnection } from "@/lib/queue";

const env = loadEnv();

const authConfig = buildAuthConfig({
  prisma,
  googleClientId: env.GOOGLE_LOGIN_CLIENT_ID,
  googleClientSecret: env.GOOGLE_LOGIN_CLIENT_SECRET,
  authSecret: env.AUTH_SECRET,
  rateLimiter: createRedisRateLimiter(redisConnection),
});

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
