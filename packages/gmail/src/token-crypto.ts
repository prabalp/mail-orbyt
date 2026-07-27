import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { loadEnv } from "@mail-orbyt/config";

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

/** Encrypts a Gmail OAuth token for storage. Output packs iv:authTag:ciphertext, each base64, colon-joined. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":",
  );
}

export class TokenDecryptionError extends Error {
  constructor() {
    super("Failed to decrypt token — it may be corrupted or encrypted with a different key.");
    this.name = "TokenDecryptionError";
  }
}

export function decryptToken(packed: string): string {
  const parts = packed.split(":");
  if (parts.length !== 3) throw new TokenDecryptionError();
  const [ivPart, authTagPart, ciphertextPart] = parts as [string, string, string];

  try {
    const iv = Buffer.from(ivPart, "base64");
    const authTag = Buffer.from(authTagPart, "base64");
    const ciphertext = Buffer.from(ciphertextPart, "base64");
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new TokenDecryptionError();
  }
}
