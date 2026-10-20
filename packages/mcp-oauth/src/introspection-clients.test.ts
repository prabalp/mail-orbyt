import { describe, expect, it, vi } from "vitest";
import { hashToken } from "@mail-orbyt/authentication";
import { createIntrospectionClient, verifyIntrospectionClient } from "./introspection-clients";

describe("createIntrospectionClient", () => {
  it("persists only the secret's hash and returns the raw secret once", async () => {
    const prisma = { mcpOAuthClient: { create: vi.fn().mockResolvedValue(undefined) } };

    const result = await createIntrospectionClient(prisma, { clientName: "lead_orbyt" });

    expect(result.clientId).toMatch(/^mcpintro_/);
    expect(result.clientSecret).toBeTruthy();
    expect(prisma.mcpOAuthClient.create).toHaveBeenCalledWith({
      data: {
        clientId: result.clientId,
        clientName: "lead_orbyt",
        redirectUris: [],
        clientSecretHash: hashToken(result.clientSecret),
      },
    });
  });
});

describe("verifyIntrospectionClient", () => {
  it("resolves the client row id for a matching secret", async () => {
    const secret = "correct-secret";
    const prisma = {
      mcpOAuthClient: {
        findUnique: vi.fn().mockResolvedValue({
          id: "client-row-1",
          clientSecretHash: hashToken(secret),
        }),
      },
    };

    const result = await verifyIntrospectionClient(prisma, {
      clientId: "mcpintro_abc",
      clientSecret: secret,
    });

    expect(result).toEqual({ clientRowId: "client-row-1" });
  });

  it("rejects a wrong secret", async () => {
    const prisma = {
      mcpOAuthClient: {
        findUnique: vi.fn().mockResolvedValue({
          id: "client-row-1",
          clientSecretHash: hashToken("correct-secret"),
        }),
      },
    };

    const result = await verifyIntrospectionClient(prisma, {
      clientId: "mcpintro_abc",
      clientSecret: "wrong-secret",
    });

    expect(result).toBeNull();
  });

  it("rejects a public client with no secret at all", async () => {
    const prisma = {
      mcpOAuthClient: {
        findUnique: vi.fn().mockResolvedValue({ id: "client-row-1", clientSecretHash: null }),
      },
    };

    const result = await verifyIntrospectionClient(prisma, {
      clientId: "mcp_abc",
      clientSecret: "anything",
    });

    expect(result).toBeNull();
  });

  it("rejects an unknown client id", async () => {
    const prisma = { mcpOAuthClient: { findUnique: vi.fn().mockResolvedValue(null) } };

    const result = await verifyIntrospectionClient(prisma, {
      clientId: "unknown",
      clientSecret: "anything",
    });

    expect(result).toBeNull();
  });
});
