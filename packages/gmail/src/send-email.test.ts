import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testKey = randomBytes(32).toString("base64");
vi.mock("@mail-orbyt/config", () => ({
  loadEnv: () => ({
    TOKEN_ENCRYPTION_KEY: testKey,
    GMAIL_OAUTH_CLIENT_ID: "client-id",
    GMAIL_OAUTH_CLIENT_SECRET: "client-secret",
  }),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("sendFromInbox", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sends a base64url-encoded RFC 2822 message and returns the provider message id", async () => {
    const { encryptToken } = await import("./token-crypto");
    const { sendFromInbox } = await import("./send-email");

    const inbox = {
      id: "inbox-1",
      emailAddress: "alex@acme.example",
      encryptedAccessToken: encryptToken("valid-access-token"),
      encryptedRefreshToken: encryptToken("refresh-token"),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    };
    const prisma = {
      inbox: { findUniqueOrThrow: vi.fn().mockResolvedValue(inbox) },
    } as never;

    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "gmail-message-id-123" }));

    const result = await sendFromInbox(
      prisma,
      "inbox-1",
      { to: "prospect@example.com", subject: "Hi", body: "Would you be open to a quick call?" },
      fetchImpl,
    );

    expect(result).toEqual({ messageId: "gmail-message-id-123" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer valid-access-token" }),
      }),
    );

    const call = fetchImpl.mock.calls[0]!;
    const body = JSON.parse((call[1] as RequestInit).body as string) as { raw: string };
    const decoded = Buffer.from(body.raw, "base64").toString("utf8");
    expect(decoded).toContain("From: alex@acme.example");
    expect(decoded).toContain("To: prospect@example.com");
    expect(decoded).toContain("Subject: Hi");
    expect(decoded).toContain("Would you be open to a quick call?");
  });

  it("throws GmailSendError when the Gmail API call fails", async () => {
    const { encryptToken } = await import("./token-crypto");
    const { sendFromInbox, GmailSendError } = await import("./send-email");

    const inbox = {
      id: "inbox-1",
      emailAddress: "alex@acme.example",
      encryptedAccessToken: encryptToken("valid-access-token"),
      encryptedRefreshToken: encryptToken("refresh-token"),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    };
    const prisma = {
      inbox: { findUniqueOrThrow: vi.fn().mockResolvedValue(inbox) },
    } as never;

    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 403));

    await expect(
      sendFromInbox(prisma, "inbox-1", { to: "a@b.com", subject: "Hi", body: "Body" }, fetchImpl),
    ).rejects.toBeInstanceOf(GmailSendError);
  });
});
