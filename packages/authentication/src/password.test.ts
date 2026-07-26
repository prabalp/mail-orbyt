import { describe, expect, it } from "vitest";
import { hashPassword, passwordSchema, verifyPassword } from "./password";

describe("passwordSchema", () => {
  it("accepts a policy-compliant password", () => {
    expect(passwordSchema.safeParse("Sup3rSecretPass").success).toBe(true);
  });

  it("rejects passwords under 12 characters", () => {
    expect(passwordSchema.safeParse("Sh0rtPass").success).toBe(false);
  });

  it("rejects passwords missing an uppercase letter", () => {
    expect(passwordSchema.safeParse("lowercase123456").success).toBe(false);
  });

  it("rejects passwords missing a digit", () => {
    expect(passwordSchema.safeParse("NoDigitsHerePass").success).toBe(false);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("produces a hash that verifies against the original password", async () => {
    const hash = await hashPassword("Sup3rSecretPass");
    expect(hash).not.toBe("Sup3rSecretPass");
    await expect(verifyPassword("Sup3rSecretPass", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Sup3rSecretPass");
    await expect(verifyPassword("WrongPassword1", hash)).resolves.toBe(false);
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const [hashA, hashB] = await Promise.all([
      hashPassword("Sup3rSecretPass"),
      hashPassword("Sup3rSecretPass"),
    ]);
    expect(hashA).not.toBe(hashB);
  });
});
