import { describe, expect, it, vi, beforeEach } from "vitest";
import { __resetEnvForTests } from "@mail-orbyt/config";
import { checkAndThrowIfKilled, isKillSwitchActive, KillSwitchActiveError } from "./kill-switch";

function fakeRedis(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
  };
}

const validEnv = {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "a".repeat(32),
  AUTH_URL: "http://localhost:3000",
  GOOGLE_LOGIN_CLIENT_ID: "client-id",
  GOOGLE_LOGIN_CLIENT_SECRET: "client-secret",
  GMAIL_OAUTH_CLIENT_ID: "gmail-client-id",
  GMAIL_OAUTH_CLIENT_SECRET: "gmail-client-secret",
  GMAIL_OAUTH_REDIRECT_URI: "http://localhost:3000/api/gmail/callback",
  TOKEN_ENCRYPTION_KEY: "b".repeat(32),
  STORAGE_ENDPOINT: "http://localhost:9000",
  STORAGE_BUCKET: "mail-orbyt",
  STORAGE_ACCESS_KEY_ID: "minioadmin",
  STORAGE_SECRET_ACCESS_KEY: "minioadmin",
};

describe("kill-switch", () => {
  beforeEach(() => {
    __resetEnvForTests();
    process.env = { ...process.env, ...validEnv, EMERGENCY_STOP: "false" };
  });

  it("is inactive when no SocialAutonomyConfig row exists for the org/platform", async () => {
    const redis = fakeRedis();
    const prisma = { socialAutonomyConfig: { findMany: vi.fn(async () => []) } };
    expect(await isKillSwitchActive(prisma as never, redis as never, "org-1", "TWITTER")).toBe(
      false,
    );
  });

  it("is active when the platform-specific row has killSwitchActivatedAt set", async () => {
    const redis = fakeRedis();
    const prisma = {
      socialAutonomyConfig: {
        findMany: vi.fn(async () => [{ killSwitchActivatedAt: new Date() }]),
      },
    };
    expect(await isKillSwitchActive(prisma as never, redis as never, "org-1", "TWITTER")).toBe(
      true,
    );
  });

  it("checkAndThrowIfKilled throws KillSwitchActiveError when active", async () => {
    const redis = fakeRedis();
    const prisma = {
      socialAutonomyConfig: {
        findMany: vi.fn(async () => [{ killSwitchActivatedAt: new Date() }]),
      },
    };
    await expect(
      checkAndThrowIfKilled(prisma as never, redis as never, "org-1", "TWITTER"),
    ).rejects.toBeInstanceOf(KillSwitchActiveError);
  });

  it("caches the result and does not re-query Postgres on a cache hit", async () => {
    const redis = fakeRedis({ "social:killswitch:org-1:TWITTER": "0" });
    const findMany = vi.fn(async () => [{ killSwitchActivatedAt: new Date() }]);
    const prisma = { socialAutonomyConfig: { findMany } };
    const result = await isKillSwitchActive(prisma as never, redis as never, "org-1", "TWITTER");
    expect(result).toBe(false);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("the global EMERGENCY_STOP env flag overrides every org, without even checking Redis or Postgres", async () => {
    process.env.EMERGENCY_STOP = "true";
    __resetEnvForTests();
    const redis = fakeRedis();
    const prisma = { socialAutonomyConfig: { findMany: vi.fn(async () => []) } };
    expect(await isKillSwitchActive(prisma as never, redis as never, "org-1", "TWITTER")).toBe(
      true,
    );
    expect(redis.get).not.toHaveBeenCalled();
  });
});
