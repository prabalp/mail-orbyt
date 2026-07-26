import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTE_LENGTH = 32;

/** Cryptographically random, URL-safe token for invitations/verification/reset links. */
export function generateSecureToken(): string {
  return randomBytes(TOKEN_BYTE_LENGTH).toString("base64url");
}

/**
 * Only the SHA-256 hash of a token is ever stored in the database — never
 * the raw value. This means a database read (backup leak, compromised
 * replica, careless log) cannot be used to reconstruct a working
 * invitation/reset/verification link; the raw token exists only in the
 * single email sent to the recipient and the URL they click.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const INVITATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function tokenExpiryDate(ttlMs: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + ttlMs);
}

export function isTokenExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
