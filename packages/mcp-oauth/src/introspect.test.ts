import { describe, expect, it, vi } from "vitest";
import { introspectAccessToken } from "./introspect";
import { authenticateIntrospectionClient, parseBasicAuth } from "./introspection-client";
import { hashToken } from "@mail-orbyt/authentication";

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    organisationId: "org-1",
    scope: "profile leads:manage organisation:delete",
    resource: "urn:orbyt:lead-orbyt-mcp-server",
    platformGrantId: "grant-1",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 120_000),
    client: { clientId: "mcp_abc" },
    ...overrides,
  };
}

function fakePrisma(token: unknown, grantRevoked = false, role: string | null = "MEMBER") {
  return {
    mcpAccessToken: { findUnique: vi.fn().mockResolvedValue(token) },
    mcpPlatformGrant: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "grant-1", revokedAt: grantRevoked ? new Date() : null }),
    },
    organisationMembership: {
      findUnique: vi
        .fn()
        .mockResolvedValue(role ? { userId: "user-1", organisationId: "org-1", role } : null),
    },
  };
}

describe("introspectAccessToken", () => {
  it("returns the RFC 7662 claims for an active token, with scope re-derived from current role", async () => {
    const result = await introspectAccessToken(fakePrisma(tokenRow()), "raw");
    expect(result).toEqual({
      active: true,
      sub: "user-1",
      aud: "urn:orbyt:lead-orbyt-mcp-server",
      scope: "profile leads:manage",
      exp: expect.any(Number),
      organisation_id: "org-1",
      client_id: "mcp_abc",
    });
  });

  it.each([
    ["unknown token", null, false, "MEMBER"],
    ["expired token", tokenRow({ expiresAt: new Date(Date.now() - 1000) }), false, "MEMBER"],
    ["revoked token", tokenRow({ revokedAt: new Date() }), false, "MEMBER"],
    ["revoked platform grant", tokenRow(), true, "MEMBER"],
    ["removed member", tokenRow(), false, null],
  ])("returns inactive for %s", async (_name, token, grantRevoked, role) => {
    const prisma = fakePrisma(token, grantRevoked, role);
    expect(await introspectAccessToken(prisma, "raw")).toEqual({ active: false });
  });
});

describe("introspection client auth", () => {
  it("parses a Basic header", () => {
    const header = `Basic ${Buffer.from("id:se:cret").toString("base64")}`;
    expect(parseBasicAuth(header)).toEqual({ id: "id", secret: "se:cret" });
    expect(parseBasicAuth("Bearer x")).toBeNull();
    expect(parseBasicAuth(null)).toBeNull();
  });

  it("accepts the right secret and rejects wrong, unknown and revoked clients", async () => {
    const row = { clientId: "mcpi_1", secretHash: hashToken("s3cret"), revokedAt: null };
    const prisma = { mcpIntrospectionClient: { findUnique: vi.fn().mockResolvedValue(row) } };
    expect(await authenticateIntrospectionClient(prisma, { id: "mcpi_1", secret: "s3cret" })).toBe(
      true,
    );
    expect(await authenticateIntrospectionClient(prisma, { id: "mcpi_1", secret: "bad" })).toBe(
      false,
    );
    prisma.mcpIntrospectionClient.findUnique.mockResolvedValue({ ...row, revokedAt: new Date() });
    expect(await authenticateIntrospectionClient(prisma, { id: "mcpi_1", secret: "s3cret" })).toBe(
      false,
    );
    prisma.mcpIntrospectionClient.findUnique.mockResolvedValue(null);
    expect(await authenticateIntrospectionClient(prisma, { id: "x", secret: "s3cret" })).toBe(
      false,
    );
  });
});
