import { describe, expect, it, vi } from "vitest";
import { hashToken } from "@mail-orbyt/authentication";
import {
  createPersonalToken,
  listPersonalTokens,
  PERSONAL_TOKEN_CLIENT_ID,
  PERSONAL_TOKEN_NEVER_EXPIRES,
  PERSONAL_TOKEN_PREFIX,
  revokePersonalToken,
} from "./personal-tokens";
import { scopesGrantedByRole } from "./scopes";
import { verifyAccessToken } from "./verify";
import { MAIL_ORBYT_MCP_RESOURCE_URI } from "./constants";

function fakePrisma() {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    mcpOAuthClient: {
      upsert: vi.fn().mockResolvedValue({ id: "pat-client-row" }),
    },
    mcpAccessToken: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `tok-${rows.length + 1}`,
          createdAt: new Date("2026-10-31T00:00:00Z"),
          revokedAt: null,
          resource: MAIL_ORBYT_MCP_RESOURCE_URI,
          ...data,
        };
        rows.push(row);
        return row;
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { tokenHash: string } }) =>
          rows.find((row) => row.tokenHash === where.tokenHash) ?? null,
      ),
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe("createPersonalToken", () => {
  it("stores only the hash, grants the role's scopes, and verifies like an OAuth token", async () => {
    const prisma = fakePrisma();
    const now = new Date("2026-10-31T00:00:00Z");

    const { rawToken, token } = await createPersonalToken(prisma as never, {
      userId: "user-1",
      organisationId: "org-1",
      role: "MEMBER",
      name: "Orbytlink",
      expiresInDays: 30,
      now,
    });

    expect(rawToken.startsWith(PERSONAL_TOKEN_PREFIX)).toBe(true);
    expect(prisma.mcpOAuthClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: PERSONAL_TOKEN_CLIENT_ID } }),
    );
    const stored = prisma.rows[0]!;
    expect(stored.tokenHash).toBe(hashToken(rawToken));
    expect(JSON.stringify(stored)).not.toContain(rawToken);
    expect(stored.scope).toBe(scopesGrantedByRole("MEMBER").join(" "));
    expect(token.expiresAt).toEqual(new Date("2026-11-30T00:00:00Z"));
    expect(token.name).toBe("Orbytlink");

    const verified = await verifyAccessToken(
      prisma as never,
      rawToken,
      MAIL_ORBYT_MCP_RESOURCE_URI,
    );
    expect(verified).toMatchObject({ userId: "user-1", organisationId: "org-1" });
  });

  it("uses the far-future sentinel for a never-expiring token and reports it as null", async () => {
    const prisma = fakePrisma();
    const { token } = await createPersonalToken(prisma as never, {
      userId: "user-1",
      organisationId: "org-1",
      role: "OWNER",
      name: "Forever",
      expiresInDays: null,
    });
    expect(prisma.rows[0]!.expiresAt).toEqual(PERSONAL_TOKEN_NEVER_EXPIRES);
    expect(token.expiresAt).toBeNull();
  });
});

describe("listPersonalTokens", () => {
  it("only lists the user's active personal tokens for the organisation", async () => {
    const prisma = fakePrisma();
    prisma.mcpAccessToken.findMany.mockResolvedValue([]);
    const now = new Date("2026-10-31T00:00:00Z");

    await listPersonalTokens(prisma as never, { userId: "user-1", organisationId: "org-1", now });

    expect(prisma.mcpAccessToken.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        organisationId: "org-1",
        revokedAt: null,
        expiresAt: { gt: now },
        client: { clientId: PERSONAL_TOKEN_CLIENT_ID },
      },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("revokePersonalToken", () => {
  it("scopes the revoke to the caller's own personal token and reports a miss", async () => {
    const prisma = fakePrisma();
    prisma.mcpAccessToken.updateMany.mockResolvedValueOnce({ count: 0 });

    const revoked = await revokePersonalToken(prisma as never, {
      userId: "user-1",
      organisationId: "org-1",
      tokenId: "someone-elses",
    });

    expect(revoked).toBe(false);
    expect(prisma.mcpAccessToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: "someone-elses",
        userId: "user-1",
        organisationId: "org-1",
        revokedAt: null,
        client: { clientId: PERSONAL_TOKEN_CLIENT_ID },
      },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
