"use server";

import { redirect } from "next/navigation";
import { requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import {
  createAuthorizationCode,
  createPlatformGrant,
  intersectScopes,
  RESOURCE_KIND_GATEWAY,
  resolveAuthorizeResource,
} from "@mail-orbyt/mcp-oauth";
import { auth } from "@/lib/auth";
import { mcpServerPublicUrl } from "@/lib/mcp-resource";

function appendCallback(
  url: URL,
  params: { code?: string; error?: string; state: string },
): string {
  if (params.code) url.searchParams.set("code", params.code);
  if (params.error) url.searchParams.set("error", params.error);
  if (params.state) url.searchParams.set("state", params.state);
  return url.toString();
}

/**
 * Approves the consent screen. Re-validates everything server-side rather
 * than trusting the hidden form fields: the client_id/redirect_uri pairing
 * is re-checked against McpOAuthClient, and the granted scope is
 * re-intersected against the user's CURRENT role in the chosen
 * organisation — never the role as it may have been implied by the UI.
 */
export async function approveAuthorization(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const clientId = String(formData.get("clientId") ?? "");
  const redirectUri = String(formData.get("redirectUri") ?? "");
  const requestedScope = String(formData.get("scope") ?? "");
  const state = String(formData.get("state") ?? "");
  const codeChallenge = String(formData.get("codeChallenge") ?? "");
  const codeChallengeMethod = String(formData.get("codeChallengeMethod") ?? "");
  const organisationId = String(formData.get("organisationId") ?? "");
  const requestedResource = String(formData.get("resource") ?? "") || null;

  const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId } });
  if (!client || !client.redirectUris.includes(redirectUri)) {
    redirect("/oauth/authorize/error");
  }

  const membership = await requireOrganisationMembership(prisma, {
    userId: session.user.id,
    organisationId,
  }).catch(() => null);
  if (!membership) {
    redirect("/oauth/authorize/error");
  }

  // RFC 8707: re-resolve server-side; an unregistered resource never gets a code.
  const resource = await resolveAuthorizeResource(prisma, {
    requested: requestedResource,
    mcpServerUrl: mcpServerPublicUrl(),
  });
  if (!resource) {
    redirect("/oauth/authorize/error");
  }

  const scope = intersectScopes(requestedScope, membership.role);

  // The one platform-level consent: record it so later authorize requests
  // from this client skip the screen, and tie the code (hence the platform
  // token and everything exchanged from it) to the grant for cascade revoke.
  const platformGrant =
    resource.kind === RESOURCE_KIND_GATEWAY
      ? await createPlatformGrant(prisma, {
          userId: session.user.id,
          organisationId,
          clientRowId: client.id,
          scope,
        })
      : null;

  const { rawCode } = await createAuthorizationCode(prisma, {
    clientRowId: client.id,
    userId: session.user.id,
    organisationId,
    scope,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    resource: resource.resourceUri,
    platformGrantId: platformGrant?.id,
  });

  redirect(appendCallback(new URL(redirectUri), { code: rawCode, state }));
}

export async function denyAuthorization(formData: FormData): Promise<void> {
  const redirectUri = String(formData.get("redirectUri") ?? "");
  const state = String(formData.get("state") ?? "");

  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    redirect("/oauth/authorize/error");
  }

  redirect(appendCallback(url, { error: "access_denied", state }));
}
