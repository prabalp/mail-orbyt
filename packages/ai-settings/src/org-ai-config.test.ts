import { describe, expect, it, vi } from "vitest";

// A valid 32-byte AES key, so encrypt/decrypt round-trips for real rather
// than through a stub — the fallback behaviour under a decryption failure is
// the part that matters most here.
vi.mock("@mail-orbyt/config", () => ({
  loadEnv: () => ({ TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") }),
}));

const { encryptSecret, maskSecret } = await import("./secret-crypto");
const { resolveOrgAiConfig } = await import("./org-ai-config");

function prismaReturning(
  organisation: {
    aiProviderApiKey: string | null;
    aiProviderModel: string | null;
    aiProviderKind?: "GEMINI" | "OPENAI_COMPATIBLE";
    aiProviderBaseUrl?: string | null;
  } | null,
) {
  return {
    organisation: {
      findUnique: async () =>
        organisation && {
          aiProviderKind: "GEMINI" as const,
          aiProviderBaseUrl: null,
          ...organisation,
        },
    },
  } as unknown as Parameters<typeof resolveOrgAiConfig>[0];
}

describe("resolveOrgAiConfig", () => {
  it("returns the decrypted key and model when the organisation has both", async () => {
    const prisma = prismaReturning({
      aiProviderApiKey: encryptSecret("org-secret-key"),
      aiProviderModel: "gemini-2.5-pro",
    });
    expect(await resolveOrgAiConfig(prisma, "org1")).toEqual({
      apiKey: "org-secret-key",
      model: "gemini-2.5-pro",
      kind: "GEMINI",
      baseUrl: undefined,
    });
  });

  // The two settings are independent: pinning a model must not require
  // bringing a key, since the environment's key stays valid for it.
  it("returns only the model when no key is stored", async () => {
    const prisma = prismaReturning({ aiProviderApiKey: null, aiProviderModel: "gemini-2.5-flash" });
    expect(await resolveOrgAiConfig(prisma, "org1")).toEqual({
      model: "gemini-2.5-flash",
      kind: "GEMINI",
      baseUrl: undefined,
    });
  });

  it("returns nothing to override when the organisation has set neither", async () => {
    const prisma = prismaReturning({ aiProviderApiKey: null, aiProviderModel: null });
    expect(await resolveOrgAiConfig(prisma, "org1")).toEqual({
      model: undefined,
      kind: "GEMINI",
      baseUrl: undefined,
    });
  });

  it("returns nothing to override for a missing organisation rather than throwing", async () => {
    expect(await resolveOrgAiConfig(prismaReturning(null), "ghost")).toEqual({});
  });

  // TOKEN_ENCRYPTION_KEY rotation makes stored keys unreadable. Generation
  // should degrade to the environment key, not fail outright — but the flag
  // has to be set so Settings can tell the user why.
  it("falls back without a key, and flags it, when the stored key can't be decrypted", async () => {
    const prisma = prismaReturning({
      aiProviderApiKey: "not:valid:ciphertext",
      aiProviderModel: "gemini-2.5-flash",
    });
    expect(await resolveOrgAiConfig(prisma, "org1")).toEqual({
      model: "gemini-2.5-flash",
      kind: "GEMINI",
      baseUrl: undefined,
      decryptionFailed: true,
    });
  });

  it("passes through a custom OpenAI-compatible provider's kind and base URL", async () => {
    const prisma = prismaReturning({
      aiProviderApiKey: encryptSecret("sk-custom"),
      aiProviderModel: "llama-3.1-70b",
      aiProviderKind: "OPENAI_COMPATIBLE",
      aiProviderBaseUrl: "https://api.custom-llm.example/v1",
    });
    expect(await resolveOrgAiConfig(prisma, "org1")).toEqual({
      apiKey: "sk-custom",
      model: "llama-3.1-70b",
      kind: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.custom-llm.example/v1",
    });
  });
});

describe("secret round-trip", () => {
  it("decrypts back to the original and produces different ciphertext each time", async () => {
    const { decryptSecret } = await import("./secret-crypto");
    const first = encryptSecret("AIzaSyExample");
    const second = encryptSecret("AIzaSyExample");
    expect(first).not.toEqual(second); // random IV per encryption
    expect(decryptSecret(first)).toBe("AIzaSyExample");
    expect(decryptSecret(second)).toBe("AIzaSyExample");
  });

  it("masks a key to a recognisable hint that leaks neither end in full", async () => {
    expect(maskSecret("AIzaSyABCDEFGHIJKLMNOP")).toBe("AIzaS…MNOP");
    expect(maskSecret("short")).toBe("•••••");
  });
});
