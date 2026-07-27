import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testKey = randomBytes(32).toString("base64");
vi.mock("@mail-orbyt/config", () => ({
  loadEnv: () => ({ TOKEN_ENCRYPTION_KEY: testKey }),
}));

describe("encryptToken / decryptToken", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("round-trips a plaintext token", async () => {
    const { encryptToken, decryptToken } = await import("./token-crypto");
    const encrypted = encryptToken("ya29.example-access-token");
    expect(encrypted).not.toContain("ya29");
    expect(decryptToken(encrypted)).toBe("ya29.example-access-token");
  });

  it("produces different ciphertext for the same plaintext (random IV)", async () => {
    const { encryptToken } = await import("./token-crypto");
    const a = encryptToken("same-token");
    const b = encryptToken("same-token");
    expect(a).not.toBe(b);
  });

  it("throws TokenDecryptionError on a tampered ciphertext", async () => {
    const { encryptToken, decryptToken, TokenDecryptionError } = await import("./token-crypto");
    const encrypted = encryptToken("a-token");
    const parts = encrypted.split(":");
    const tampered = [parts[0], parts[1], Buffer.from("tampered-data").toString("base64")].join(
      ":",
    );
    expect(() => decryptToken(tampered)).toThrow(TokenDecryptionError);
  });

  it("throws TokenDecryptionError on a malformed packed value", async () => {
    const { decryptToken, TokenDecryptionError } = await import("./token-crypto");
    expect(() => decryptToken("not-a-valid-packed-token")).toThrow(TokenDecryptionError);
  });
});
