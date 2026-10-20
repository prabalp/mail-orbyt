"use server";

import { redirect } from "next/navigation";
import { requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { completeAuthorization } from "@mail-orbyt/mcp-oauth";
import { auth } from "@/lib/auth";
import { appendCallback } from "./callback-url";

/**
 * Approves the consent screen. Re-validates everything server-side rather
 * than trusting the hidden form fields: the client_id/redirect_uri pairing
 * is re-checked against McpOAuthClient, and the granted scope is
 * re-intersected against the user's CURRENT role in the chosen
 * organisation — never the role as it may have been implied by the UI.
 *
 * This is also where the platform-level consent grant is recorded
 * (completeAuthorization, in @mail-orbyt/mcp-oauth) — see page.tsx for the
 * silent skip-consent path that reads it back on a later connect.
 * ARCHITECTURE.md §6.
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
  const resource = String(formData.get("resource") ?? "") || undefined;

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

  const { rawCode } = await completeAuthorization(prisma, {
    clientRowId: client.id,
    userId: session.user.id,
    organisationId,
    role: membership.role,
    requestedScope,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    resource,
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
