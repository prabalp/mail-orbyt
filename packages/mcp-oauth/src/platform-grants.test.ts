import { describe, expect, it, vi } from "vitest";
import { createPlatformGrant, findActivePlatformGrant } from "./platform-grants";
import { resolveAuthorizeResource } from "./resources";
import { MAIL_ORBYT_MCP_RESOURCE_URI } from "./constants";

describe("platform grant consent skip", () => {
  it("finds an unrevoked grant for (user, client), which the authorize page uses to skip consent", async () => {
    const prisma = {
      mcpPlatformGrant: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
    };
    const grant = await findActivePlatformGrant(prisma, { userId: "u", clientRowId: "c" });
    expect(grant).toEqual({ id: "grant-1" });
    expect(prisma.mcpPlatformGrant.findFirst.mock.calls[0]![0].where).toEqual({
      userId: "u",
      clientId: "c",
      revokedAt: null,
    });
  });

  it("createPlatformGrant reuses an active grant instead of creating a duplicate", async () => {
    const prisma = {
      mcpPlatformGrant: {
        findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }),
        create: vi.fn(),
      },
    };
    await createPlatformGrant(prisma, {
      userId: "u",
      organisationId: "o",
      clientRowId: "c",
      scope: "profile",
    });
    expect(prisma.mcpPlatformGrant.create).not.toHaveBeenCalled();
  });

  it("createPlatformGrant writes a grant when none is active", async () => {
    const prisma = {
      mcpPlatformGrant: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "new" }),
      },
    };
    await createPlatformGrant(prisma, {
      userId: "u",
      organisationId: "o",
      clientRowId: "c",
      scope: "profile",
    });
    expect(prisma.mcpPlatformGrant.create).toHaveBeenCalledWith({
      data: { userId: "u", organisationId: "o", clientId: "c", scope: "profile" },
    });
  });
});

describe("resolveAuthorizeResource", () => {
  const prisma = {
    mcpResource: {
      findUnique: vi
        .fn()
        .mockImplementation(async ({ where }: { where: { resourceUri: string } }) =>
          ["urn:orbyt:mail-orbyt-mcp-server", "https://gw/mcp"].includes(where.resourceUri)
            ? { resourceUri: where.resourceUri, name: "n", kind: "k", scopeMapping: {} }
            : null,
        ),
    },
  };
  it("defaults to mail-orbyt's resource when absent or equal to the mcp-server URL", async () => {
    const a = await resolveAuthorizeResource(prisma, {
      requested: null,
      mcpServerUrl: "https://m/",
    });
    const b = await resolveAuthorizeResource(prisma, {
      requested: "https://m",
      mcpServerUrl: "https://m/",
    });
    expect(a?.resourceUri).toBe(MAIL_ORBYT_MCP_RESOURCE_URI);
    expect(b?.resourceUri).toBe(MAIL_ORBYT_MCP_RESOURCE_URI);
  });
  it("resolves registered resources and rejects unknown ones", async () => {
    expect(
      (
        await resolveAuthorizeResource(prisma, {
          requested: "https://gw/mcp",
          mcpServerUrl: "https://m",
        })
      )?.resourceUri,
    ).toBe("https://gw/mcp");
    expect(
      await resolveAuthorizeResource(prisma, {
        requested: "https://evil",
        mcpServerUrl: "https://m",
      }),
    ).toBeNull();
  });
});
