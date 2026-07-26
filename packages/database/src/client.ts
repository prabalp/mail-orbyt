import { PrismaClient } from "@prisma/client";

declare global {
  var __prismaClient: PrismaClient | undefined;
}

/**
 * Singleton Prisma client. In development, Next.js hot-reload would otherwise
 * create a new client (and connection pool) on every edit; we stash it on
 * `globalThis` to avoid exhausting Postgres connections.
 */
export const prisma: PrismaClient =
  globalThis.__prismaClient ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaClient = prisma;
}
