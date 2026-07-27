import type { PrismaClient } from "@mail-orbyt/database";
import { loadEnv } from "@mail-orbyt/config";
import { getValidAccessToken } from "./inbox-service";
import { GmailSendError } from "./send-email";

const GMAIL_THREAD_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/threads";

export interface ThreadMessage {
  gmailMessageId: string;
  from: string;
  subject: string;
  snippet: string;
  internalDate: Date;
}

interface GmailMessagePayloadHeader {
  name: string;
  value: string;
}

interface GmailThreadMessage {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: GmailMessagePayloadHeader[] };
}

function getHeader(message: GmailThreadMessage, name: string): string {
  return (
    message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())
      ?.value ?? ""
  );
}

/** Reads every message in a Gmail thread (using gmail.readonly scope). Used by reply detection — never for composing or sending. */
export async function fetchThreadMessages(
  prisma: PrismaClient,
  inboxId: string,
  gmailThreadId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ThreadMessage[]> {
  const env = loadEnv();
  const accessToken = await getValidAccessToken(
    prisma,
    { clientId: env.GMAIL_OAUTH_CLIENT_ID, clientSecret: env.GMAIL_OAUTH_CLIENT_SECRET },
    inboxId,
  );

  const response = await fetchImpl(`${GMAIL_THREAD_ENDPOINT}/${gmailThreadId}?format=metadata`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new GmailSendError(`Fetching Gmail thread failed with status ${response.status}`);
  }

  const data = (await response.json()) as { messages?: GmailThreadMessage[] };

  return (data.messages ?? []).map((message) => ({
    gmailMessageId: message.id,
    from: getHeader(message, "From"),
    subject: getHeader(message, "Subject"),
    snippet: message.snippet ?? "",
    internalDate: new Date(Number(message.internalDate ?? Date.now())),
  }));
}
