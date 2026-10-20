/**
 * Verifies Meta webhook payload signatures (used by both Instagram and
 * Threads/Graph webhooks, which both sign with the app secret the same way).
 * Meta sends `X-Hub-Signature-256: sha256=<hex hmac>` computed over the raw
 * request body. Compares digests with a constant-time comparison
 * (`crypto.timingSafeEqual`) rather than `===`/string comparison, since a
 * naive comparison leaks timing information an attacker can use to forge a
 * valid signature byte-by-byte.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMetaWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
  appSecret: string,
): boolean {
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;

  const providedHex = signatureHeader.slice(prefix.length).trim();
  const expectedHex = createHmac("sha256", appSecret).update(rawBody).digest("hex");

  const providedBuffer = Buffer.from(providedHex, "hex");
  const expectedBuffer = Buffer.from(expectedHex, "hex");

  // Buffers of different lengths can't be compared with timingSafeEqual
  // (it throws) — an unequal length is simply not a match.
  if (providedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
