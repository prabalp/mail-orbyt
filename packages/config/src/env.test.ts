import { describe, expect, it, beforeEach } from "vitest";
import { loadEnv, __resetEnvForTests } from "./env";

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

describe("loadEnv", () => {
  beforeEach(() => {
    __resetEnvForTests();
  });

  it("parses a valid environment", () => {
    const env = loadEnv(validEnv);
    expect(env.APP_NAME).toBe("Mail Orbyt");
    expect(env.DATABASE_POOL_MAX).toBe(10);
  });

  it("throws with a descriptive message when required vars are missing", () => {
    const { DATABASE_URL, ...rest } = validEnv;
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("rejects a malformed URL", () => {
    expect(() => loadEnv({ ...validEnv, APP_URL: "not-a-url" })).toThrow();
  });

  it("memoizes the parsed result across calls", () => {
    const first = loadEnv(validEnv);
    const second = loadEnv({ ...validEnv, APP_NAME: "Different" });
    expect(second).toBe(first);
    expect(second.APP_NAME).toBe("Mail Orbyt");
  });

  it("parses the literal string 'false' as false, not truthy (regression: z.coerce.boolean() bug)", () => {
    expect(loadEnv({ ...validEnv, EMERGENCY_STOP: "false" }).EMERGENCY_STOP).toBe(false);
  });

  it("parses the literal string 'true' as true", () => {
    expect(loadEnv({ ...validEnv, EMERGENCY_STOP: "true" }).EMERGENCY_STOP).toBe(true);
  });

  it("defaults EMERGENCY_STOP to false when unset", () => {
    expect(loadEnv(validEnv).EMERGENCY_STOP).toBe(false);
  });

  it("parses STORAGE_FORCE_PATH_STYLE='false' as false", () => {
    expect(
      loadEnv({ ...validEnv, STORAGE_FORCE_PATH_STYLE: "false" }).STORAGE_FORCE_PATH_STYLE,
    ).toBe(false);
  });

  it("defaults STORAGE_FORCE_PATH_STYLE to true when unset", () => {
    expect(loadEnv(validEnv).STORAGE_FORCE_PATH_STYLE).toBe(true);
  });
});
