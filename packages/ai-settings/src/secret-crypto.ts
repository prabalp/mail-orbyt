import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { loadEnv } from "@mail-orbyt/config";

/**
 * AES-256-GCM encryption for secrets held at rest in the database, keyed by
 * TOKEN_ENCRYPTION_KEY. Originally written for Gmail OAuth tokens (see
 * packages/gmail/src/token-crypto.ts, which now re-exports these) and shared
 * here so an organisation's own AI provider API key is stored exactly the
 * same way — one scheme, one key, one place to audit.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const env = loadEnv();
  const key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).");
  }
  return key;
}

/** Encrypts a secret for storage. Output packs iv:authTag:ciphertext, each base64, colon-joined. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":",
  );
}

export class SecretDecryptionError extends Error {
  constructor() {
    super("Failed to decrypt secret — it may be corrupted or encrypted with a different key.");
    this.name = "SecretDecryptionError";
  }
}

export function decryptSecret(packed: string): string {
  const parts = packed.split(":");
  if (parts.length !== 3) throw new SecretDecryptionError();
  const [ivPart, authTagPart, ciphertextPart] = parts as [string, string, string];

  try {
    const iv = Buffer.from(ivPart, "base64");
    const authTag = Buffer.from(authTagPart, "base64");
    const ciphertext = Buffer.from(ciphertextPart, "base64");
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretDecryptionError();
  }
}

/**
 * Renders a key as a display hint (`AIzaS…7Xk2`) for the settings UI. The
 * plaintext key is never sent back to the browser once saved — only this.
 */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 10) return "•".repeat(plaintext.length);
  return `${plaintext.slice(0, 5)}…${plaintext.slice(-4)}`;
}
