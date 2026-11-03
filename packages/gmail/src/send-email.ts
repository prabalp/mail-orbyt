import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@mail-orbyt/database";
import { loadEnv } from "@mail-orbyt/config";
import { getValidAccessToken } from "./inbox-service";
import { resolveInboxSenderName } from "./inbox-identity";

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
  /**
   * Pre-built `<img>` tag for open tracking (see @mail-orbyt/tracking's
   * buildPixelImgTag), appended only to the HTML part below — never to the
   * plain-text part. Undefined when the sending organisation has no
   * verified tracking domain, in which case the email is unchanged.
   */
  pixelImgTag?: string;
  /**
   * One-click unsubscribe endpoint (RFC 8058). Sent as List-Unsubscribe /
   * List-Unsubscribe-Post headers so Gmail shows its own "Unsubscribe"
   * control; the body carries the visible, embedded link separately.
   */
  unsubscribeUrl?: string;
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

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

// Matches either markdown-style `[label](https://url)` links or bare
// `https://...` URLs, so plain text (e.g. a typed signature) can contain
// either form and still render as a clickable link.
const LINK_REGEX = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')]+)/g;

/**
 * Replaces links with `<a>` tags and HTML-escapes everything else. Done as a
 * single pass over segments (rather than escape-then-linkify or
 * linkify-then-escape) so link URLs/labels and surrounding plain text are
 * each escaped exactly once, with no risk of the inserted `<a>` markup being
 * re-escaped or a raw `&`/`<` in the text corrupting a link.
 */
function linkifyToHtml(text: string): string {
  let result = "";
  let lastIndex = 0;
  for (const match of text.matchAll(LINK_REGEX)) {
    const [full, mdLabel, mdUrl, bareUrl] = match;
    const index = match.index ?? 0;
    result += escapeHtml(text.slice(lastIndex, index));
    const url = mdUrl ?? bareUrl ?? "";
    const label = mdLabel ?? url;
    result += `<a href="${escapeHtml(url)}" style="color:#2563eb;">${escapeHtml(label)}</a>`;
    lastIndex = index + full.length;
  }
  result += escapeHtml(text.slice(lastIndex));
  return result;
}

/**
 * The plain-text alternative part: markdown `[label](url)` links can't be
 * embedded in plain text, so they become "label (url)" rather than leaking
 * markdown syntax to clients/filters that read the text part.
 */
export function textToPlain(text: string): string {
  return text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)");
}

/**
 * Converts the plain-text body (the single source of truth generated/edited
 * upstream) into an HTML view for the multipart HTML part below. Paragraphs
 * (separated by a blank line) become `<p>` blocks and single line breaks
 * within a paragraph become `<br>`, so paragraph/line-break structure
 * renders identically across every mail client rather than depending on
 * each client's own plain-text reflow behavior. Markdown `[label](url)`
 * links and bare URLs become clickable `<a>` tags (see linkifyToHtml).
 */
export function textToHtml(text: string, pixelImgTag?: string): string {
  const linked = linkifyToHtml(text);
  const paragraphs = linked
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.split("\n").join("<br>"))
    .map((paragraph) => `<p style="margin:0 0 1em 0;">${paragraph}</p>`)
    .join("\n");
  const trailer = pixelImgTag ? `\n${pixelImgTag}` : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a;">\n${paragraphs}${trailer}\n</div>`;
}

/** Header values must be single-line; CR/LF would otherwise let text inject extra headers. */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 encoded-word for header text containing non-ASCII characters; plain ASCII passes through. */
function encodeHeaderText(value: string): string {
  const clean = singleLine(value);
  return /^[\x20-\x7e]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

/**
 * `Name <address>` so recipients see the sender's name (matching the
 * signature) instead of a bare address.
 */
export function formatFromHeader(displayName: string | undefined, address: string): string {
  const name = displayName ? singleLine(displayName) : "";
  if (!name) return address;
  const quoted = /^[\x20-\x7e]*$/.test(name)
    ? `"${name.replace(/(["\\])/g, "\\$1")}"`
    : encodeHeaderText(name);
  return `${quoted} <${address}>`;
}

/**
 * Builds a multipart/alternative RFC 2822 message: a plain-text part (the
 * body with markdown links flattened, for clients/filters that prefer it) plus an HTML part
 * whose paragraph/line breaks are explicitly encoded — see textToHtml. This
 * guarantees consistent paragraph rendering regardless of how any given
 * client would otherwise reflow bare plain text.
 */
function buildRfc2822Message(from: string, message: OutboundMessage): string {
  const boundary = `mail-orbyt-${randomUUID()}`;
  const headers = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeaderText(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ...(message.unsubscribeUrl
      ? [
          `List-Unsubscribe: <${singleLine(message.unsubscribeUrl)}>`,
          "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
        ]
      : []),
  ];

  const parts = [
    [
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      textToPlain(message.body),
    ].join("\r\n"),
    [
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      textToHtml(message.body, message.pixelImgTag),
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

  const raw = encodeBase64Url(
    buildRfc2822Message(
      formatFromHeader(resolveInboxSenderName(inbox), inbox.emailAddress),
      message,
    ),
  );
  return callGmailSend(accessToken, raw, fetchImpl);
}
