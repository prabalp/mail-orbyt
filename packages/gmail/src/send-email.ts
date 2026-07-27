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
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRfc2822Message(from: string, message: OutboundMessage): string {
  const headers = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  return `${headers.join("\r\n")}\r\n\r\n${message.body}`;
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

  const data = (await response.json()) as { id?: string };
  if (!data.id) {
    throw new GmailSendError("Gmail send response was missing a message id.");
  }
  return { messageId: data.id };
}

/** Sends a plain-text email through a connected inbox's Gmail account, refreshing its access token first if needed. */
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
