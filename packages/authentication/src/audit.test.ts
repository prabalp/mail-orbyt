import { describe, expect, it, vi } from "vitest";
import { recordAuditEvent } from "./audit";

function fakePrisma() {
  return { auditEvent: { create: vi.fn().mockResolvedValue(undefined) } };
}

describe("recordAuditEvent", () => {
  it("writes the event with type, organisationId, userId, and metadata", async () => {
    const prisma = fakePrisma();
    await recordAuditEvent(prisma, {
      type: "LOGIN",
      organisationId: "org-1",
      userId: "user-1",
      metadata: { method: "credentials" },
    });

    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        type: "LOGIN",
        organisationId: "org-1",
        userId: "user-1",
        metadata: { method: "credentials" },
      },
    });
  });

  it("rejects metadata containing a password-like key", async () => {
    const prisma = fakePrisma();
    await expect(
      recordAuditEvent(prisma, { type: "LOGIN", metadata: { password: "hunter2" } }),
    ).rejects.toThrow(/sensitive/);
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects metadata containing a token-like key", async () => {
    const prisma = fakePrisma();
    await expect(
      recordAuditEvent(prisma, { type: "INVITATION_SENT", metadata: { inviteToken: "abc" } }),
    ).rejects.toThrow(/sensitive/);
  });

  it("allows events with no metadata", async () => {
    const prisma = fakePrisma();
    await expect(
      recordAuditEvent(prisma, { type: "LOGOUT", userId: "user-1" }),
    ).resolves.toBeUndefined();
  });
});
