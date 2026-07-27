import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testKey = randomBytes(32).toString("base64");
vi.mock("@mail-orbyt/config", () => ({
  loadEnv: () => ({ TOKEN_ENCRYPTION_KEY: testKey }),
}));

vi.mock("./google-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./google-oauth")>();
  return { ...actual, revokeToken: vi.fn().mockResolvedValue(undefined) };
});

function fakePrisma(inbox: unknown) {
  return {
    inbox: {
      upsert: vi.fn().mockImplementation(({ create }) => ({ id: "inbox-1", ...create })),
      findMany: vi.fn().mockResolvedValue(inbox ? [inbox] : []),
      findUnique: vi.fn().mockResolvedValue(inbox),
      update: vi.fn().mockImplementation(({ data }) => ({ ...(inbox as object), ...data })),
    },
  };
}

describe("connectInbox / listInboxes", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("upserts an inbox with encrypted tokens", async () => {
    const { connectInbox } = await import("./inbox-service");
    const prisma = fakePrisma(null);
    const inbox = await connectInbox(prisma, {
      organisationId: "org-1",
      connectedByUserId: "user-1",
      emailAddress: "jamie@acme.example",
      accessToken: "at",
      refreshToken: "rt",
      expiresInSeconds: 3600,
    });
    expect(inbox.encryptedAccessToken).not.toContain("at");
    expect(inbox.status).toBe("CONNECTED");
  });

  it("excludes DISCONNECTED inboxes from listInboxes", async () => {
    const { listInboxes } = await import("./inbox-service");
    const prisma = fakePrisma({ id: "inbox-1", organisationId: "org-1" });
    await listInboxes(prisma, "org-1");
    expect(prisma.inbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organisationId: "org-1", status: { not: "DISCONNECTED" } },
      }),
    );
  });
});

describe("updateDailySendLimit", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("updates the limit for an inbox owned by the organisation", async () => {
    const { updateDailySendLimit } = await import("./inbox-service");
    const prisma = fakePrisma({ id: "inbox-1", organisationId: "org-1", dailySendLimit: 30 });
    const result = await updateDailySendLimit(prisma, "org-1", "inbox-1", 50);
    expect(result?.dailySendLimit).toBe(50);
  });

  it("returns null for an inbox belonging to a different organisation", async () => {
    const { updateDailySendLimit } = await import("./inbox-service");
    const prisma = fakePrisma({ id: "inbox-1", organisationId: "org-attacker" });
    const result = await updateDailySendLimit(prisma, "org-victim", "inbox-1", 50);
    expect(result).toBeNull();
    expect(prisma.inbox.update).not.toHaveBeenCalled();
  });
});

describe("disconnectInbox", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("marks an owned inbox DISCONNECTED", async () => {
    const { connectInbox, disconnectInbox } = await import("./inbox-service");
    const encryptedPrisma = fakePrisma(null);
    const created = await connectInbox(encryptedPrisma, {
      organisationId: "org-1",
      connectedByUserId: "user-1",
      emailAddress: "jamie@acme.example",
      accessToken: "at",
      refreshToken: "rt",
      expiresInSeconds: 3600,
    });

    const prisma = fakePrisma({ ...created, organisationId: "org-1" });
    const result = await disconnectInbox(prisma, "org-1", "inbox-1");
    expect(result?.status).toBe("DISCONNECTED");
  });

  it("returns null for an inbox in a different organisation", async () => {
    const { disconnectInbox } = await import("./inbox-service");
    const prisma = fakePrisma({
      id: "inbox-1",
      organisationId: "org-attacker",
      encryptedRefreshToken: "irrelevant",
    });
    const result = await disconnectInbox(prisma, "org-victim", "inbox-1");
    expect(result).toBeNull();
  });
});

describe("extractDomain", () => {
  it("returns the lowercased domain part of an email address", async () => {
    const { extractDomain } = await import("./inbox-service");
    expect(extractDomain("Jamie@ACME.example")).toBe("acme.example");
  });

  it("throws for an address without an @", async () => {
    const { extractDomain } = await import("./inbox-service");
    expect(() => extractDomain("not-an-email")).toThrow();
  });
});
