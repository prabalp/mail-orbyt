import { randomBytes, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@mail-orbyt/database";
import { generateSecureToken, hashToken } from "@mail-orbyt/authentication";

export interface CreatedIntrospectionClient {
  clientId: string;
  /** Shown exactly once — only its SHA-256 hash is stored. */
  clientSecret: string;
}

/** Mints a confidential client for resource servers calling /api/oauth/introspect. */
export async function createIntrospectionClient(
  prisma: Pick<PrismaClient, "mcpIntrospectionClient">,
  params: { clientName: string },
): Promise<CreatedIntrospectionClient> {
  const clientId = `mcpi_${randomBytes(12).toString("hex")}`;
  const clientSecret = generateSecureToken();
  await prisma.mcpIntrospectionClient.create({
    data: { clientId, clientName: params.clientName, secretHash: hashToken(clientSecret) },
  });
  return { clientId, clientSecret };
}

/** Parses an `Authorization: Basic` header into client credentials, or null when malformed. */
export function parseBasicAuth(header: string | null): { id: string; secret: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator <= 0) return null;
  // RFC 6749 §2.3.1: id and secret are form-urlencoded before Basic encoding.
  try {
    return {
      id: decodeURIComponent(decoded.slice(0, separator)),
      secret: decodeURIComponent(decoded.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

/** Constant-time check of presented credentials against the stored hash; false for unknown/revoked clients. */
export async function authenticateIntrospectionClient(
  prisma: Pick<PrismaClient, "mcpIntrospectionClient">,
  credentials: { id: string; secret: string },
): Promise<boolean> {
  const client = await prisma.mcpIntrospectionClient.findUnique({
    where: { clientId: credentials.id },
  });
  if (!client || client.revokedAt) return false;
  const expected = Buffer.from(client.secretHash, "hex");
  const presented = Buffer.from(hashToken(credentials.secret), "hex");
  return expected.length === presented.length && timingSafeEqual(expected, presented);
}
