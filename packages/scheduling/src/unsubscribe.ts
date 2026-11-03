import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless, signed unsubscribe links: the token carries who to unsubscribe
 * (organisation + address) and is HMAC-signed, so nobody can unsubscribe an
 * address they weren't emailed at, and no per-link database row is needed.
 */
export interface UnsubscribePayload {
  organisationId: string;
  email: string;
  campaignId?: string;
}

export const UNSUBSCRIBE_FOOTER_TEXT = "No longer interested in these messages?";

function signingKey(secret: string): Buffer {
  // Derived so the raw app secret is never used directly as an HMAC key here.
  return createHmac("sha256", secret).update("mail-orbyt/unsubscribe/v1").digest();
}

function sign(secret: string, data: string): string {
  return createHmac("sha256", signingKey(secret)).update(data).digest("base64url");
}

export function signUnsubscribeToken(secret: string, payload: UnsubscribePayload): string {
  const data = Buffer.from(
    JSON.stringify({
      o: payload.organisationId,
      e: payload.email.trim().toLowerCase(),
      ...(payload.campaignId ? { c: payload.campaignId } : {}),
    }),
  ).toString("base64url");
  return `${data}.${sign(secret, data)}`;
}

export function verifyUnsubscribeToken(secret: string, token: string): UnsubscribePayload | null {
  const [data, signature, ...rest] = token.split(".");
  if (!data || !signature || rest.length > 0) return null;
  const expected = Buffer.from(sign(secret, data));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as {
      o?: unknown;
      e?: unknown;
      c?: unknown;
    };
    if (typeof parsed.o !== "string" || typeof parsed.e !== "string") return null;
    return {
      organisationId: parsed.o,
      email: parsed.e,
      ...(typeof parsed.c === "string" ? { campaignId: parsed.c } : {}),
    };
  } catch {
    return null;
  }
}

export interface UnsubscribeLinks {
  /** Page the recipient opens from the email footer (asks for confirmation). */
  pageUrl: string;
  /** POST endpoint for the List-Unsubscribe one-click header (RFC 8058). */
  oneClickUrl: string;
}

/** Builds the links for one recipient; wired with APP_URL and the app secret by each sender. */
export function createUnsubscribeLinker(config: { appUrl: string; secret: string }) {
  const base = config.appUrl.replace(/\/+$/, "");
  return (payload: UnsubscribePayload): UnsubscribeLinks => {
    const token = signUnsubscribeToken(config.secret, payload);
    return {
      pageUrl: `${base}/unsubscribe/${token}`,
      oneClickUrl: `${base}/api/unsubscribe/${token}`,
    };
  };
}

/** Adds the embedded unsubscribe line after the signature; idempotent. */
export function appendUnsubscribeFooter(body: string, pageUrl: string): string {
  if (body.includes(pageUrl)) return body;
  return `${body.trimEnd()}\n\n${UNSUBSCRIBE_FOOTER_TEXT} [Unsubscribe](${pageUrl})`;
}
