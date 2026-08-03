import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@mail-orbyt/database";
import { loadEnv } from "@mail-orbyt/config";
import { getValidAccessToken } from "./inbox-service";

const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export class GmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailSendError";
  }
}

export interface OutboundMessage {
  to: string;
  subject: string;
  body: string;
}

export interface SendResult {
  messageId: string;
  threadId: string;
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Converts the plain-text body (the single source of truth generated/edited
 * upstream) into an HTML view for the multipart HTML part below. Paragraphs
 * (separated by a blank line) become `<p>` blocks and single line breaks
 * within a paragraph become `<br>`, so paragraph/line-break structure
 * renders identically across every mail client rather than depending on
 * each client's own plain-text reflow behavior.
 */
export function textToHtml(text: string): string {
  const escaped = text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.split("\n").join("<br>"))
    .map((paragraph) => `<p style="margin:0 0 1em 0;">${paragraph}</p>`)
    .join("\n");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a;">\n${paragraphs}\n</div>`;
}

/**
 * Builds a multipart/alternative RFC 2822 message: a plain-text part (the
 * raw body, unchanged, for clients/filters that prefer it) plus an HTML part
 * whose paragraph/line breaks are explicitly encoded — see textToHtml. This
 * guarantees consistent paragraph rendering regardless of how any given
 * client would otherwise reflow bare plain text.
 */
function buildRfc2822Message(from: string, message: OutboundMessage): string {
  const boundary = `mail-orbyt-${randomUUID()}`;
  const headers = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const parts = [
    ['Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: 8bit", "", message.body].join(
      "\r\n",
    ),
    [
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      textToHtml(message.body),
    ].join("\r\n"),
  ];

  const body = parts.map((part) => `--${boundary}\r\n${part}`).join("\r\n") + `\r\n--${boundary}--`;
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

async function callGmailSend(
  accessToken: string,
  raw: string,
  fetchImpl: typeof fetch,
): Promise<SendResult> {
  const response = await fetchImpl(GMAIL_SEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    throw new GmailSendError(`Gmail send failed with status ${response.status}`);
  }

  const data = (await response.json()) as { id?: string; threadId?: string };
  if (!data.id || !data.threadId) {
    throw new GmailSendError("Gmail send response was missing a message id or thread id.");
  }
  return { messageId: data.id, threadId: data.threadId };
}

/** Sends a plain-text + HTML multipart email through a connected inbox's Gmail account, refreshing its access token first if needed. */
export async function sendFromInbox(
  prisma: PrismaClient,
  inboxId: string,
  message: OutboundMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const env = loadEnv();
  const inbox = await prisma.inbox.findUniqueOrThrow({ where: { id: inboxId } });
  const accessToken = await getValidAccessToken(
    prisma,
    { clientId: env.GMAIL_OAUTH_CLIENT_ID, clientSecret: env.GMAIL_OAUTH_CLIENT_SECRET },
    inboxId,
  );

  const raw = encodeBase64Url(buildRfc2822Message(inbox.emailAddress, message));
  return callGmailSend(accessToken, raw, fetchImpl);
}
