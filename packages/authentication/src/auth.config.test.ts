import { describe, expect, it, vi } from "vitest";
import { createCredentialsAuthorize, EmailNotVerifiedError } from "./auth.config";
import { hashPassword } from "./password";
import { createNoopRateLimiter, type RateLimiter } from "./rate-limiter";

function fakePrisma(user: unknown) {
  return { user: { findUnique: vi.fn().mockResolvedValue(user) } } as never;
}

async function makeUser() {
  return {
    id: "user-1",
    email: "jamie@example.com",
    name: "Jamie",
    passwordHash: await hashPassword("correct-password"),
    emailVerified: new Date(),
  };
}

describe("createCredentialsAuthorize", () => {
  it("returns null and does not check the password when the rate limit is exceeded", async () => {
    const user = await makeUser();
    const rateLimiter: RateLimiter = { attempt: vi.fn().mockResolvedValue(false), reset: vi.fn() };
    const authorize = createCredentialsAuthorize(fakePrisma(user), rateLimiter);

    const result = await authorize({ email: "jamie@example.com", password: "whatever" });

    expect(result).toBeNull();
    expect(rateLimiter.reset).not.toHaveBeenCalled();
  });

  it("returns null for an incorrect password without resetting the limiter", async () => {
    const user = await makeUser();
    const rateLimiter: RateLimiter = { attempt: vi.fn().mockResolvedValue(true), reset: vi.fn() };
    const authorize = createCredentialsAuthorize(fakePrisma(user), rateLimiter);

    const result = await authorize({ email: "jamie@example.com", password: "wrong-password" });

    expect(result).toBeNull();
    expect(rateLimiter.reset).not.toHaveBeenCalled();
  });

  it("throws EmailNotVerifiedError for an unverified email, but only after the password is confirmed correct", async () => {
    const user = { ...(await makeUser()), emailVerified: null };
    const rateLimiter: RateLimiter = { attempt: vi.fn().mockResolvedValue(true), reset: vi.fn() };
    const authorize = createCredentialsAuthorize(fakePrisma(user), rateLimiter);

    await expect(
      authorize({ email: "jamie@example.com", password: "correct-password" }),
    ).rejects.toThrow(EmailNotVerifiedError);

    const wrongPasswordResult = await authorize({
      email: "jamie@example.com",
      password: "wrong-password",
    });
    expect(wrongPasswordResult).toBeNull();
  });

  it("resets the rate limit counter and returns the user on a successful login", async () => {
    const user = await makeUser();
    const rateLimiter: RateLimiter = { attempt: vi.fn().mockResolvedValue(true), reset: vi.fn() };
    const authorize = createCredentialsAuthorize(fakePrisma(user), rateLimiter);

    const result = await authorize({ email: "jamie@example.com", password: "correct-password" });

    expect(result).toEqual({ id: "user-1", email: "jamie@example.com", name: "Jamie" });
    expect(rateLimiter.reset).toHaveBeenCalledWith("login:jamie@example.com");
  });

  it("works with the default permissive no-op limiter", async () => {
    const user = await makeUser();
    const authorize = createCredentialsAuthorize(fakePrisma(user), createNoopRateLimiter());
    const result = await authorize({ email: "jamie@example.com", password: "correct-password" });
    expect(result).not.toBeNull();
  });
});
