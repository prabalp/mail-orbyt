import { describe, expect, it, vi } from "vitest";
import { verifyEmail } from "./email-verification";
import { ForbiddenError } from "./errors";
import { hashToken } from "./tokens";

function fakePrisma(token: unknown) {
  return {
    emailVerificationToken: {
      findUnique: vi.fn().mockResolvedValue(token),
      update: vi.fn().mockResolvedValue(undefined),
    },
    user: {
      update: vi.fn().mockResolvedValue(undefined),
    },
    $transaction: vi.fn().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

describe("verifyEmail", () => {
  it("marks the user verified and consumes the token", async () => {
    const token = {
      id: "tok-1",
      userId: "user-1",
      token: hashToken("raw"),
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const prisma = fakePrisma(token);

    await verifyEmail(prisma, "raw");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { emailVerified: expect.any(Date) },
    });
    expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith({
      where: { id: "tok-1" },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("rejects an unknown token", async () => {
    const prisma = fakePrisma(null);
    await expect(verifyEmail(prisma, "bad")).rejects.toThrow(ForbiddenError);
  });

  it("rejects an already-consumed token", async () => {
    const token = {
      id: "tok-1",
      userId: "user-1",
      token: hashToken("raw"),
      consumedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    };
    const prisma = fakePrisma(token);
    await expect(verifyEmail(prisma, "raw")).rejects.toThrow(ForbiddenError);
  });

  it("rejects an expired token", async () => {
    const token = {
      id: "tok-1",
      userId: "user-1",
      token: hashToken("raw"),
      consumedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
    };
    const prisma = fakePrisma(token);
    await expect(verifyEmail(prisma, "raw")).rejects.toThrow(/expired/);
  });
});
