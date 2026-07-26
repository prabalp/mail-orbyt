import { describe, expect, it, vi } from "vitest";
import { completePasswordReset, requestPasswordReset } from "./password-reset";
import { ForbiddenError } from "./errors";
import { hashToken } from "./tokens";

function fakePrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
    },
    passwordResetToken: {
      create: vi.fn().mockResolvedValue(undefined),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
    },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
    $transaction: vi.fn().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    ...overrides,
  };
}

function fakeEmailSender() {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe("requestPasswordReset", () => {
  it("creates a reset token and sends an email when the user exists", async () => {
    const prisma = fakePrisma({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", email: "jane@example.com" }) },
    });
    const emailSender = fakeEmailSender();

    await requestPasswordReset(prisma, emailSender, {
      email: "jane@example.com",
      appUrl: "http://localhost:3000",
    });

    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    expect(emailSender.send).toHaveBeenCalledTimes(1);
  });

  it("does nothing (but does not error) when the email is not registered — no user enumeration", async () => {
    const prisma = fakePrisma();
    const emailSender = fakeEmailSender();

    await expect(
      requestPasswordReset(prisma, emailSender, {
        email: "unknown@example.com",
        appUrl: "http://localhost:3000",
      }),
    ).resolves.toBeUndefined();

    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });
});

describe("completePasswordReset", () => {
  it("updates the password and deletes all existing sessions", async () => {
    const resetToken = {
      id: "tok-1",
      userId: "user-1",
      token: hashToken("raw"),
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const prisma = fakePrisma({
      passwordResetToken: {
        findUnique: vi.fn().mockResolvedValue(resetToken),
        update: vi.fn().mockResolvedValue(undefined),
      },
    });

    await completePasswordReset(prisma, { rawToken: "raw", newPassword: "NewSup3rSecret" });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: expect.any(String), passwordChangedAt: expect.any(Date) },
    });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("rejects an unknown or already-consumed token", async () => {
    const prisma = fakePrisma();
    await expect(
      completePasswordReset(prisma, { rawToken: "bad", newPassword: "NewSup3rSecret" }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects an expired token", async () => {
    const resetToken = {
      id: "tok-1",
      userId: "user-1",
      token: hashToken("raw"),
      consumedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
    };
    const prisma = fakePrisma({
      passwordResetToken: { findUnique: vi.fn().mockResolvedValue(resetToken) },
    });

    await expect(
      completePasswordReset(prisma, { rawToken: "raw", newPassword: "NewSup3rSecret" }),
    ).rejects.toThrow(/expired/);
  });
});
