import { describe, expect, it, vi } from "vitest";
import { signUp, EmailAlreadyInUseError } from "./signup";
import { verifyPassword } from "./password";

function fakePrisma(existingUser: unknown = null) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(existingUser),
      create: vi.fn().mockImplementation(({ data }) => ({ id: "user-1", ...data })),
    },
    emailVerificationToken: {
      create: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function fakeEmailSender() {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe("signUp", () => {
  it("creates a user with a hashed password and sends a verification email", async () => {
    const prisma = fakePrisma();
    const emailSender = fakeEmailSender();

    const user = await signUp(prisma, emailSender, {
      name: "Jane Doe",
      email: "Jane@Example.com",
      password: "Sup3rSecretPass",
      appUrl: "http://localhost:3000",
    });

    expect(user.email).toBe("jane@example.com");
    expect(user.passwordHash).not.toBe("Sup3rSecretPass");
    await expect(verifyPassword("Sup3rSecretPass", user.passwordHash as string)).resolves.toBe(
      true,
    );
    expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
    expect(emailSender.send).toHaveBeenCalledTimes(1);
    expect(emailSender.send.mock.calls[0][0].to).toBe("jane@example.com");
  });

  it("rejects sign-up when the email is already registered", async () => {
    const prisma = fakePrisma({ id: "existing-user", email: "jane@example.com" });
    const emailSender = fakeEmailSender();

    await expect(
      signUp(prisma, emailSender, {
        name: "Jane Doe",
        email: "jane@example.com",
        password: "Sup3rSecretPass",
        appUrl: "http://localhost:3000",
      }),
    ).rejects.toThrow(EmailAlreadyInUseError);
    expect(emailSender.send).not.toHaveBeenCalled();
  });
});
