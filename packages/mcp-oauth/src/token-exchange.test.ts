import { describe, expect, it, vi } from "vitest";
import { hashToken } from "@mail-orbyt/authentication";
import { exchangeTokenForResource } from "./token-exchange";
import { OAuthGrantError } from "./errors";
import {
  ACCESS_TOKEN_TYPE,
  LEAD_ORBYT_MCP_RESOURCE_URI,
  MAIL_ORBYT_MCP_RESOURCE_URI,
} from "./constants";

const GATEWAY = "https://gateway.test/mcp";
const CLIENT = { id: "client-row-1", clientId: "mcp_abc" };

function fakePrisma(overrides: Record<string, unknown> = {}) {
  return {
    mcpOAuthClient: { findUnique: vi.fn().mockResolvedValue(CLIENT) },
    mcpAccessToken: {
      findUnique: vi.fn().mockResolvedValue({
        clientId: CLIENT.id,
        userId: "user-1",
        organisationId: "org-1",
        resource: GATEWAY,
        platformGrantId: "grant-1",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
      create: vi.fn().mockResolvedValue(undefined),
    },
    mcpPlatformGrant: {
      findUnique: vi.fn().mockResolvedValue({
        id: "grant-1",
        userId: "user-1",
        clientId: CLIENT.id,
        scope: "profile leads:manage organisation:delete",
        revokedAt: null,
      }),
    },
    mcpResource: {
      findUnique: vi
        .fn()
        .mockImplementation(async ({ where }: { where: { resourceUri: string } }) =>
          where.resourceUri === LEAD_ORBYT_MCP_RESOURCE_URI
            ? {
                resourceUri: where.resourceUri,
                name: "lead",
                kind: "native-introspected",
                scopeMapping: {},
              }
            : where.resourceUri === GATEWAY
              ? { resourceUri: GATEWAY, name: "gw", kind: "gateway", scopeMapping: {} }
              : null,
        ),
    },
    organisationMembership: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ organisationId: "org-1", userId: "user-1", role: "MEMBER" }),
    },
    ...overrides,
  };
}

const base = {
  clientId: CLIENT.clientId,
  subjectToken: "platform-token",
  subjectTokenType: ACCESS_TOKEN_TYPE,
  resource: LEAD_ORBYT_MCP_RESOURCE_URI,
  gatewayResourceUri: GATEWAY,
};

describe("exchangeTokenForResource", () => {
  it("mints a 5-minute, resource-audienced token with scope narrowed to the current role", async () => {
    const prisma = fakePrisma();
    const result = await exchangeTokenForResource(prisma, base);

    expect(result.expiresIn).toBe(300);
    expect(result.tokenType).toBe("Bearer");
    expect(result.issuedTokenType).toBe(ACCESS_TOKEN_TYPE);
    // MEMBER can't hold organisation:delete even though the grant scope lists it.
    expect(result.scope).toBe("profile leads:manage");
    const data = prisma.mcpAccessToken.create.mock.calls[0]![0].data;
    expect(data.tokenHash).toBe(hashToken(result.accessToken));
    expect(data.resource).toBe(LEAD_ORBYT_MCP_RESOURCE_URI);
    expect(data.platformGrantId).toBe("grant-1");
  });

  it("rejects an unregistered resource with invalid_target", async () => {
    await expect(
      exchangeTokenForResource(fakePrisma(), { ...base, resource: "urn:orbyt:nope" }),
    ).rejects.toMatchObject({ code: "invalid_target" });
  });

  it("rejects the gateway itself as an exchange target", async () => {
    await expect(
      exchangeTokenForResource(fakePrisma(), { ...base, resource: GATEWAY }),
    ).rejects.toMatchObject({ code: "invalid_target" });
  });

  it("rejects a subject token not audienced to the gateway (audience mismatch)", async () => {
    const prisma = fakePrisma();
    prisma.mcpAccessToken.findUnique.mockResolvedValue({
      clientId: CLIENT.id,
      userId: "user-1",
      organisationId: "org-1",
      resource: MAIL_ORBYT_MCP_RESOURCE_URI,
      platformGrantId: "grant-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(exchangeTokenForResource(prisma, base)).rejects.toMatchObject({
      code: "invalid_grant",
    });
  });

  it("rejects when the platform grant is revoked", async () => {
    const prisma = fakePrisma();
    prisma.mcpPlatformGrant.findUnique.mockResolvedValue({
      id: "grant-1",
      userId: "user-1",
      clientId: CLIENT.id,
      scope: "profile",
      revokedAt: new Date(),
    });
    await expect(exchangeTokenForResource(prisma, base)).rejects.toBeInstanceOf(OAuthGrantError);
    expect(prisma.mcpAccessToken.create).not.toHaveBeenCalled();
  });

  it("rejects when the user is no longer a member", async () => {
    const prisma = fakePrisma();
    prisma.organisationMembership.findUnique.mockResolvedValue(null);
    await expect(exchangeTokenForResource(prisma, base)).rejects.toMatchObject({
      code: "invalid_grant",
    });
  });

  it("rejects a subject token belonging to a different client", async () => {
    const prisma = fakePrisma({
      mcpOAuthClient: { findUnique: vi.fn().mockResolvedValue({ id: "other", clientId: "mcp_x" }) },
    });
    await expect(exchangeTokenForResource(prisma, base)).rejects.toMatchObject({
      code: "invalid_grant",
    });
  });

  it("rejects an unsupported subject_token_type", async () => {
    await expect(
      exchangeTokenForResource(fakePrisma(), { ...base, subjectTokenType: "urn:x" }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("applies the resource's allowedScopes mapping", async () => {
    const prisma = fakePrisma();
    prisma.mcpResource.findUnique.mockResolvedValue({
      resourceUri: LEAD_ORBYT_MCP_RESOURCE_URI,
      name: "lead",
      kind: "native-introspected",
      scopeMapping: { allowedScopes: ["profile"] },
    });
    expect((await exchangeTokenForResource(prisma, base)).scope).toBe("profile");
  });
});
