import { describe, expect, it } from "vitest";
import { generateSecureToken, hashToken, isTokenExpired, tokenExpiryDate } from "./tokens";

describe("generateSecureToken", () => {
  it("generates a sufficiently long, unique, URL-safe token", () => {
    const a = generateSecureToken();
    const b = generateSecureToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("tokenExpiryDate / isTokenExpired", () => {
  it("computes an expiry date offset from now by the given TTL", () => {
    const now = new Date("2026-07-26T00:00:00.000Z");
    const expiry = tokenExpiryDate(60 * 60 * 1000, now);
    expect(expiry.toISOString()).toBe("2026-07-26T01:00:00.000Z");
  });

  it("reports a token as expired once past its expiry date", () => {
    const expiresAt = new Date("2026-07-26T00:00:00.000Z");
    expect(isTokenExpired(expiresAt, new Date("2026-07-26T00:00:01.000Z"))).toBe(true);
  });

  it("reports a token as not expired before its expiry date", () => {
    const expiresAt = new Date("2026-07-26T00:00:00.000Z");
    expect(isTokenExpired(expiresAt, new Date("2026-07-25T23:59:59.000Z"))).toBe(false);
  });

  it("treats the exact expiry instant as expired (fail closed)", () => {
    const expiresAt = new Date("2026-07-26T00:00:00.000Z");
    expect(isTokenExpired(expiresAt, expiresAt)).toBe(true);
  });
});

describe("hashToken", () => {
  it("is deterministic for the same input", () => {
    const token = generateSecureToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("never returns the raw token", () => {
    const token = generateSecureToken();
    expect(hashToken(token)).not.toBe(token);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashToken(generateSecureToken())).not.toBe(hashToken(generateSecureToken()));
  });
});
