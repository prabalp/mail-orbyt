import type { OrganisationRole, PrismaClient } from "@mail-orbyt/database";
import { generateSecureToken, hashToken, tokenExpiryDate } from "@mail-orbyt/authentication";
import { scopesGrantedByRole } from "./scopes";

/**
 * Personal access tokens: long-lived bearer tokens a user creates by hand
 * (Settings → MCP connections) for clients that can't run the OAuth flow,
 * e.g. a server-to-server integration. They are ordinary `McpAccessToken`
 * rows — same hashing, expiry, revocation and audience — owned by one
 * built-in client row, so `verifyAccessToken` and every caller of it (the
 * MCP server and the apps/web REST API) accept them unchanged. They have no
 * refresh token; the user picks the expiry up front.
 */
export const PERSONAL_TOKEN_CLIENT_ID = "mail-orbyt-personal-access-token";
export const PERSONAL_TOKEN_CLIENT_NAME = "Personal access token";

/** Raw tokens start with this so they're recognizable in configs and by secret scanners. */
export const PERSONAL_TOKEN_PREFIX = "mo_pat_";

/** Expiry used for "never expires" — the column is required, so store a far-future date. */
export const PERSONAL_TOKEN_NEVER_EXPIRES = new Date("9999-12-31T00:00:00.000Z");

export const PERSONAL_TOKEN_EXPIRY_DAYS = [30, 90, 365] as const;
export type PersonalTokenExpiryDays = (typeof PERSONAL_TOKEN_EXPIRY_DAYS)[number] | null;

type PersonalTokenPrisma = Pick<PrismaClient, "mcpOAuthClient" | "mcpAccessToken">;

async function personalTokenClientRowId(
  prisma: Pick<PrismaClient, "mcpOAuthClient">,
): Promise<string> {
  const client = await prisma.mcpOAuthClient.upsert({
    where: { clientId: PERSONAL_TOKEN_CLIENT_ID },
    update: {},
    create: {
      clientId: PERSONAL_TOKEN_CLIENT_ID,
      clientName: PERSONAL_TOKEN_CLIENT_NAME,
      redirectUris: [],
    },
  });
  return client.id;
}

export interface PersonalTokenSummary {
  id: string;
  name: string;
  scope: string;
  createdAt: Date;
  /** null when the token never expires. */
  expiresAt: Date | null;
}

function toSummary(row: {
  id: string;
  name: string | null;
  scope: string;
  createdAt: Date;
  expiresAt: Date;
}): PersonalTokenSummary {
  return {
    id: row.id,
    name: row.name ?? PERSONAL_TOKEN_CLIENT_NAME,
    scope: row.scope,
    createdAt: row.createdAt,
    expiresAt:
      row.expiresAt.getTime() >= PERSONAL_TOKEN_NEVER_EXPIRES.getTime() ? null : row.expiresAt,
  };
}

export interface CreatePersonalTokenParams {
  userId: string;
  organisationId: string;
  /** The caller's CURRENT role in the organisation — the token gets exactly the scopes it grants. */
  role: OrganisationRole;
  name: string;
  /** null = never expires. */
  expiresInDays: PersonalTokenExpiryDays;
  now?: Date;
}

export interface CreatedPersonalToken {
  /** Shown to the user once; only its hash is stored. */
  rawToken: string;
  token: PersonalTokenSummary;
}

export async function createPersonalToken(
  prisma: PersonalTokenPrisma,
  params: CreatePersonalTokenParams,
): Promise<CreatedPersonalToken> {
  const clientRowId = await personalTokenClientRowId(prisma);
  const rawToken = `${PERSONAL_TOKEN_PREFIX}${generateSecureToken()}`;
  const expiresAt =
    params.expiresInDays === null
      ? PERSONAL_TOKEN_NEVER_EXPIRES
      : tokenExpiryDate(params.expiresInDays * 24 * 60 * 60 * 1000, params.now);

  const row = await prisma.mcpAccessToken.create({
    data: {
      tokenHash: hashToken(rawToken),
      clientId: clientRowId,
      userId: params.userId,
      organisationId: params.organisationId,
      scope: scopesGrantedByRole(params.role).join(" "),
      expiresAt,
      name: params.name,
    },
  });

  return { rawToken, token: toSummary(row) };
}

/** The user's own active (unrevoked, unexpired) personal tokens for one organisation, newest first. */
export async function listPersonalTokens(
  prisma: Pick<PrismaClient, "mcpAccessToken">,
  params: { userId: string; organisationId: string; now?: Date },
): Promise<PersonalTokenSummary[]> {
  const rows = await prisma.mcpAccessToken.findMany({
    where: {
      userId: params.userId,
      organisationId: params.organisationId,
      revokedAt: null,
      expiresAt: { gt: params.now ?? new Date() },
      client: { clientId: PERSONAL_TOKEN_CLIENT_ID },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toSummary);
}

/** Revokes one of the user's own personal tokens. Returns false if it isn't theirs (or is already revoked). */
export async function revokePersonalToken(
  prisma: Pick<PrismaClient, "mcpAccessToken">,
  params: { userId: string; organisationId: string; tokenId: string },
): Promise<boolean> {
  const result = await prisma.mcpAccessToken.updateMany({
    where: {
      id: params.tokenId,
      userId: params.userId,
      organisationId: params.organisationId,
      revokedAt: null,
      client: { clientId: PERSONAL_TOKEN_CLIENT_ID },
    },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}
