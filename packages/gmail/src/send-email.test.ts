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
    expect(decoded).toContain('From: "Alex" <alex@acme.example>');
    expect(decoded).toContain("To: prospect@example.com");
    expect(decoded).toContain("Subject: Hi");
    expect(decoded).toContain("multipart/alternative");
    expect(decoded).toContain("Content-Type: text/plain");
    expect(decoded).toContain("Content-Type: text/html");
    expect(decoded).toContain("Would you be open to a quick call?");
    expect(decoded).toContain("<p style=");
  });

  it("sends personalStyle mail as a single quoted-printable text/plain part", async () => {
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
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "m", threadId: "t" }));

    await sendFromInbox(
      prisma,
      "inbox-1",
      {
        to: "prospect@example.com",
        subject: "Hi",
        body: "Hi.\n\nBook [here](https://cal.example/x).\n\nBest,\nAlex",
        personalStyle: true,
        pixelImgTag: '<img src="https://t.example/p.gif">',
        unsubscribeUrl: "https://app.example/u/1",
      },
      fetchImpl,
    );

    const call = fetchImpl.mock.calls[0] as [string, RequestInit];
    const { raw } = JSON.parse(call[1].body as string) as { raw: string };
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(decoded).toContain("Content-Transfer-Encoding: quoted-printable");
    expect(decoded).not.toContain("multipart/alternative");
    expect(decoded).not.toContain("text/html");
    expect(decoded).not.toContain("List-Unsubscribe");
    expect(decoded).not.toContain("t.example/p.gif");
    expect(decoded).toContain("Book here: https://cal.example/x.");
  });

  it("appends the pixel img tag to the HTML part only, never the plain-text part", async () => {
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
    const pixelImgTag = '<img src="https://track.acme.example/o/item1.gif" width="1" height="1">';

    await sendFromInbox(
      prisma,
      "inbox-1",
      {
        to: "prospect@example.com",
        subject: "Hi",
        body: "Would you be open to a quick call?",
        pixelImgTag,
      },
      fetchImpl,
    );

    const call = fetchImpl.mock.calls[0]!;
    const body = JSON.parse((call[1] as RequestInit).body as string) as { raw: string };
    const decoded = Buffer.from(body.raw, "base64").toString("utf8");
    const [plainPart, htmlPart] = decoded.split("Content-Type: text/html");
    expect(htmlPart).toContain(pixelImgTag);
    expect(plainPart).not.toContain(pixelImgTag);
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
    expect(html).toContain('<p style="margin:0 0 1em 0;">First paragraph.</p>');
    expect(html).toContain("Second line one<br>Second line two.");
  });

  it("HTML-escapes special characters", async () => {
    const { textToHtml } = await import("./send-email");
    const html = textToHtml('Tom & Jerry <are> "friends"');
    expect(html).toContain("Tom &amp; Jerry &lt;are&gt; &quot;friends&quot;");
  });

  it("turns a bare URL into a clickable link", async () => {
    const { textToHtml } = await import("./send-email");
    const html = textToHtml("Book a time: https://calendly.com/acme/intro");
    expect(html).toContain(
      '<a href="https://calendly.com/acme/intro" style="color:#2563eb;">https://calendly.com/acme/intro</a>',
    );
  });

  it("turns a markdown [label](url) link into a clickable link with custom label text", async () => {
    const { textToHtml } = await import("./send-email");
    const html = textToHtml("[Book a call](https://calendly.com/acme/intro) whenever works.");
    expect(html).toContain(
      '<a href="https://calendly.com/acme/intro" style="color:#2563eb;">Book a call</a>',
    );
    expect(html).toContain("whenever works.");
  });

  it("HTML-escapes ampersands inside a linkified URL and label", async () => {
    const { textToHtml } = await import("./send-email");
    const html = textToHtml("[A&B](https://example.com?a=1&b=2)");
    expect(html).toContain('href="https://example.com?a=1&amp;b=2"');
    expect(html).toContain(">A&amp;B</a>");
  });

  it("appends the pixel img tag when given one", async () => {
    const { textToHtml } = await import("./send-email");
    const tag = '<img src="https://track.acme.example/o/item1.gif" width="1" height="1">';
    const html = textToHtml("Hello there.", tag);
    expect(html).toContain(tag);
  });

  it("omits any pixel markup when none is given", async () => {
    const { textToHtml } = await import("./send-email");
    const html = textToHtml("Hello there.");
    expect(html).not.toContain("<img");
  });
});

describe("textToPlain", () => {
  it("flattens markdown links to 'label: url' and leaves other text alone", async () => {
    const { textToPlain } = await import("./send-email");
    expect(
      textToPlain("Hi.\n\nOr [book a 30-minute slot](https://calendly.com/acme/30min) today."),
    ).toBe("Hi.\n\nOr book a 30-minute slot: https://calendly.com/acme/30min today.");
    expect(textToPlain("[https://a.example](https://a.example)")).toBe("https://a.example");
    expect(textToPlain("No links, just [brackets] and (parens).")).toBe(
      "No links, just [brackets] and (parens).",
    );
  });
});

describe("formatFromHeader / subject encoding", () => {
  it("adds the display name, quoting and escaping it", async () => {
    const { formatFromHeader } = await import("./send-email");
    expect(formatFromHeader("Tripty Wig", "t@x.com")).toBe('"Tripty Wig" <t@x.com>');
    expect(formatFromHeader('A "B" C', "t@x.com")).toBe('"A \\"B\\" C" <t@x.com>');
    expect(formatFromHeader(undefined, "t@x.com")).toBe("t@x.com");
  });

  it("RFC 2047-encodes a non-ASCII name and never lets a newline into a header", async () => {
    const { formatFromHeader } = await import("./send-email");
    const from = formatFromHeader("José\r\nBcc: evil@x.com", "t@x.com");
    expect(from).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <t@x\.com>$/);
    expect(Buffer.from(from.split("?")[3]!, "base64").toString("utf8")).toBe(
      "José Bcc: evil@x.com",
    );
  });
});

describe("List-Unsubscribe headers", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("adds one-click headers only when an unsubscribe URL is given", async () => {
    const { encryptToken } = await import("./token-crypto");
    const { sendFromInbox } = await import("./send-email");
    const inbox = {
      id: "inbox-1",
      emailAddress: "alex@acme.example",
      displayName: null,
      status: "CONNECTED",
      encryptedAccessToken: encryptToken("valid-access-token"),
      encryptedRefreshToken: encryptToken("refresh-token"),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    };
    const prisma = { inbox: { findUniqueOrThrow: vi.fn().mockResolvedValue(inbox) } } as never;
    const sent = async (extra: object) => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "m", threadId: "t" }));
      await sendFromInbox(
        prisma,
        "inbox-1",
        { to: "p@example.com", subject: "Hi", body: "Body", ...extra },
        fetchImpl,
      );
      const init = fetchImpl.mock.calls[0]![1] as RequestInit;
      const raw = (JSON.parse(init.body as string) as { raw: string }).raw;
      return Buffer.from(raw, "base64").toString("utf8");
    };

    const withLink = await sent({ unsubscribeUrl: "https://app.test/api/unsubscribe/tok" });
    expect(withLink).toContain("List-Unsubscribe: <https://app.test/api/unsubscribe/tok>");
    expect(withLink).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(await sent({})).not.toContain("List-Unsubscribe");
  });
});

describe("encodeQuotedPrintable", () => {
  function decodeQuotedPrintable(encoded: string): string {
    const joined = encoded.replace(/=\r\n/g, "");
    const bytes: number[] = [];
    for (let i = 0; i < joined.length; i += 1) {
      if (joined[i] === "=") {
        bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(joined.charCodeAt(i));
      }
    }
    return Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n");
  }

  it("soft-wraps long paragraphs so no line exceeds 76 chars and decodes back unchanged", async () => {
    const { encodeQuotedPrintable } = await import("./send-email");
    const text =
      "Hey Robert,\n\nSpeaking as a practising lawyer gives your talks real authority on legal topics audiences care about — naïve façade = 100%.\n\nBest,\nTripty ";
    const encoded = encodeQuotedPrintable(text);
    for (const line of encoded.split("\r\n")) expect(line.length).toBeLessThanOrEqual(76);
    expect(encoded).toContain("=\r\n");
    expect(encoded).not.toMatch(/=[0-9A-F]?=\r\n/);
    expect(decodeQuotedPrintable(encoded)).toBe(text);
  });

  it("leaves short ASCII lines readable as-is", async () => {
    const { encodeQuotedPrintable } = await import("./send-email");
    expect(encodeQuotedPrintable("Hi there,\nBest")).toBe("Hi there,\r\nBest");
  });
});
