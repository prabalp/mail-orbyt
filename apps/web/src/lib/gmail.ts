import { randomBytes } from "node:crypto";
import { recordAuditEvent } from "@mail-orbyt/authentication";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import {
  buildAuthorizationUrl,
  connectInbox,
  createSignature,
  deleteSignature,
  disconnectInbox,
  exchangeCodeForTokens,
  extractDomain,
  fetchGoogleUserEmail,
  listDomainDnsChecks,
  listInboxes,
  listSignatures,
  runDomainDnsCheck,
  setDefaultSignature,
  updateDailySendLimit,
  updateSignature,
  type CreateSignatureParams,
  type UpdateSignatureParams,
} from "@mail-orbyt/gmail";

const env = loadEnv();

const OAUTH_CONFIG = {
  clientId: env.GMAIL_OAUTH_CLIENT_ID,
  clientSecret: env.GMAIL_OAUTH_CLIENT_SECRET,
  redirectUri: env.GMAIL_OAUTH_REDIRECT_URI,
};

export const GMAIL_OAUTH_STATE_COOKIE = "gmailOAuthState";
export const GMAIL_OAUTH_ORG_COOKIE = "gmailOAuthOrganisationId";

export function createOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function buildGmailAuthorizationUrl(state: string): string {
  return buildAuthorizationUrl(OAUTH_CONFIG, state);
}

export async function completeGmailOAuth(params: {
  organisationId: string;
  connectedByUserId: string;
  code: string;
}) {
  const tokens = await exchangeCodeForTokens(OAUTH_CONFIG, params.code);
  const { email, name } = await fetchGoogleUserEmail(tokens.accessToken);

  const inbox = await connectInbox(prisma, {
    organisationId: params.organisationId,
    connectedByUserId: params.connectedByUserId,
    emailAddress: email,
    displayName: name,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresInSeconds: tokens.expiresInSeconds,
  });

  await recordAuditEvent(prisma, {
    type: "INBOX_CONNECTED",
    organisationId: params.organisationId,
    userId: params.connectedByUserId,
    metadata: { inboxId: inbox.id },
  });

  await runDomainDnsCheck(prisma, params.organisationId, extractDomain(email));

  return inbox;
}

export async function listOrganisationInboxes(organisationId: string) {
  return listInboxes(prisma, organisationId);
}

export async function disconnectOrganisationInbox(organisationId: string, inboxId: string) {
  return disconnectInbox(prisma, organisationId, inboxId);
}

export async function updateInboxDailyLimit(
  organisationId: string,
  inboxId: string,
  dailySendLimit: number,
) {
  return updateDailySendLimit(prisma, organisationId, inboxId, dailySendLimit);
}

export async function listOrganisationDnsChecks(organisationId: string) {
  return listDomainDnsChecks(prisma, organisationId);
}

export async function recheckDomainDns(
  organisationId: string,
  domain: string,
  dkimSelector?: string,
) {
  return runDomainDnsCheck(prisma, organisationId, domain, dkimSelector);
}

export async function listOrganisationSignatures(organisationId: string) {
  return listSignatures(prisma, organisationId);
}

export async function createOrganisationSignature(
  organisationId: string,
  params: CreateSignatureParams,
) {
  return createSignature(prisma, organisationId, params);
}

export async function updateOrganisationSignature(
  organisationId: string,
  signatureId: string,
  patch: UpdateSignatureParams,
) {
  return updateSignature(prisma, organisationId, signatureId, patch);
}

export async function setDefaultOrganisationSignature(organisationId: string, signatureId: string) {
  return setDefaultSignature(prisma, organisationId, signatureId);
}

export async function deleteOrganisationSignature(organisationId: string, signatureId: string) {
  return deleteSignature(prisma, organisationId, signatureId);
}
