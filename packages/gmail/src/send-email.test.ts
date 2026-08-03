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

    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ id: "gmail-message-id-123", threadId: "gmail-thread-id-456" }),
      );

    const result = await sendFromInbox(
      prisma,
      "inbox-1",
      { to: "prospect@example.com", subject: "Hi", body: "Would you be open to a quick call?" },
      fetchImpl,
    );

    expect(result).toEqual({ messageId: "gmail-message-id-123", threadId: "gmail-thread-id-456" });
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
    expect(decoded).toContain("multipart/alternative");
    expect(decoded).toContain("Content-Type: text/plain");
    expect(decoded).toContain("Content-Type: text/html");
    expect(decoded).toContain("Would you be open to a quick call?");
    expect(decoded).toContain("<p style=");
  });

  it("throws GmailSendError when the response is missing a thread id", async () => {
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
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "gmail-message-id-123" }));

    await expect(
      sendFromInbox(prisma, "inbox-1", { to: "a@b.com", subject: "Hi", body: "Body" }, fetchImpl),
    ).rejects.toBeInstanceOf(GmailSendError);
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

describe("textToHtml", () => {
  it("wraps each blank-line-separated paragraph in its own <p> and converts single breaks to <br>", async () => {
    const { textToHtml } = await import("./send-email");
    const html = textToHtml("First paragraph.\n\nSecond line one\nSecond line two.");
    expect(html).toContain("<p style=\"margin:0 0 1em 0;\">First paragraph.</p>");
    expect(html).toContain("Second line one<br>Second line two.");
  });

  it("HTML-escapes special characters", async () => {
    const { textToHtml } = await import("./send-email");
    const html = textToHtml("Tom & Jerry <are> \"friends\"");
    expect(html).toContain("Tom &amp; Jerry &lt;are&gt; &quot;friends&quot;");
  });
});
