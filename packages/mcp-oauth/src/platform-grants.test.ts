import { describe, expect, it, vi } from "vitest";
import {
  completeAuthorization,
  ensurePlatformGrantId,
  findActivePlatformGrant,
  revokePlatformGrant,
} from "./platform-grants";

describe("findActivePlatformGrant", () => {
  it("looks up an unrevoked grant for the (user, org, client) tuple", async () => {
    const prisma = {
      mcpPlatformGrant: {
        findFirst: vi.fn().mockResolvedValue({ id: "grant-1", scope: "profile" }),
      },
    };

    const grant = await findActivePlatformGrant(prisma, {
      userId: "user-1",
      organisationId: "org-1",
      clientRowId: "client-row-1",
    });

    expect(grant).toEqual({ id: "grant-1", scope: "profile" });
    expect(prisma.mcpPlatformGrant.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        organisationId: "org-1",
        clientId: "client-row-1",
        revokedAt: null,
      },
      select: { id: true, scope: true },
    });
  });
});

describe("ensurePlatformGrantId", () => {
  it("reuses an existing active grant instead of creating a new one", async () => {
    const prisma = {
      mcpPlatformGrant: {
        findFirst: vi.fn().mockResolvedValue({ id: "grant-1", scope: "profile" }),
        upsert: vi.fn(),
      },
    };

    const id = await ensurePlatformGrantId(prisma, {
      userId: "user-1",
      organisationId: "org-1",
      clientRowId: "client-row-1",
      scope: "profile leads:manage",
    });

    expect(id).toBe("grant-1");
    expect(prisma.mcpPlatformGrant.upsert).not.toHaveBeenCalled();
  });

  it("creates (or reactivates) a grant when none is active", async () => {
    const prisma = {
      mcpPlatformGrant: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: "grant-2" }),
      },
    };

    const id = await ensurePlatformGrantId(prisma, {
      userId: "user-1",
      organisationId: "org-1",
      clientRowId: "client-row-1",
      scope: "profile",
    });

    expect(id).toBe("grant-2");
    expect(prisma.mcpPlatformGrant.upsert).toHaveBeenCalledWith({
      where: {
        userId_organisationId_clientId: {
          userId: "user-1",
          organisationId: "org-1",
          clientId: "client-row-1",
        },
      },
      create: {
        userId: "user-1",
        organisationId: "org-1",
        clientId: "client-row-1",
        scope: "profile",
      },
      update: { scope: "profile", revokedAt: null },
    });
  });
});

describe("completeAuthorization", () => {
  it("upserts the platform grant and mints a code with the requested resource", async () => {
    const prisma = {
      mcpPlatformGrant: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: "grant-1" }),
      },
      mcpAuthorizationCode: { create: vi.fn().mockResolvedValue(undefined) },
      auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
    };

    const { rawCode } = await completeAuthorization(prisma, {
      clientRowId: "client-row-1",
      userId: "user-1",
      organisationId: "org-1",
      role: "ADMIN",
      requestedScope: "profile leads:manage organisation:delete",
      redirectUri: "https://claude.ai/callback",
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      resource: "https://gateway.orbyt.example/mcp",
    });

    expect(rawCode).toBeTruthy();
    expect(prisma.mcpPlatformGrant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ scope: "profile leads:manage" }),
      }),
    );
    expect(prisma.mcpAuthorizationCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resource: "https://gateway.orbyt.example/mcp" }),
      }),
    );
  });

  it("defaults the resource to mail-orbyt's own when the client omits it", async () => {
    const prisma = {
      mcpPlatformGrant: {
        findFirst: vi.fn().mockResolvedValue({ id: "grant-1", scope: "profile" }),
        upsert: vi.fn(),
      },
      mcpAuthorizationCode: { create: vi.fn().mockResolvedValue(undefined) },
      auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
    };

    await completeAuthorization(prisma, {
      clientRowId: "client-row-1",
      userId: "user-1",
      organisationId: "org-1",
      role: "ADMIN",
      requestedScope: "profile",
      redirectUri: "https://claude.ai/callback",
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
    });

    expect(prisma.mcpAuthorizationCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resource: "urn:orbyt:mail-orbyt-mcp-server" }),
      }),
    );
  });
});

describe("revokePlatformGrant", () => {
  it("revokes the grant and every access/refresh token minted under it", async () => {
    const prisma = {
      mcpPlatformGrant: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      mcpAccessToken: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      mcpRefreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };

    await revokePlatformGrant(prisma, { platformGrantId: "grant-1" });

    expect(prisma.mcpPlatformGrant.updateMany).toHaveBeenCalledWith({
      where: { id: "grant-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.mcpAccessToken.updateMany).toHaveBeenCalledWith({
      where: { platformGrantId: "grant-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.mcpRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { platformGrantId: "grant-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
