import { redirect } from "next/navigation";
import { requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { completeAuthorization, findActivePlatformGrant } from "@mail-orbyt/mcp-oauth";
import { auth } from "@/lib/auth";
import { getCurrentOrganisation } from "@/lib/current-organisation";
import { appendCallback } from "./callback-url";
import { AuthorizeClient } from "./authorize-client";
import { AuthorizeError } from "./authorize-error";

interface AuthorizePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function stringParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The MCP remote connector's OAuth consent screen: a human decides which
 * organisation (and, implicitly, which of their own permissions) a client
 * like claude.ai gets to act as. Every field the client supplied is
 * re-validated again in ./actions.ts at approval time — this page's own
 * checks exist only to fail fast with a clear message before showing UI.
 */
export default async function AuthorizePage({
  searchParams,
}: AuthorizePageProps): Promise<React.ReactElement> {
  const params = await searchParams;

  const clientId = stringParam(params, "client_id");
  const redirectUri = stringParam(params, "redirect_uri");
  const responseType = stringParam(params, "response_type");
  const scope = stringParam(params, "scope") ?? "profile";
  const state = stringParam(params, "state") ?? "";
  const codeChallenge = stringParam(params, "code_challenge");
  const codeChallengeMethod = stringParam(params, "code_challenge_method");
  // RFC 8707 resource indicator — the audience the resulting token should be
  // scoped to (typically the Gateway's own resource URI). Omitted entirely
  // defaults to mail-orbyt's own resource inside completeAuthorization().
  const resource = stringParam(params, "resource") ?? undefined;

  if (
    !clientId ||
    !redirectUri ||
    responseType !== "code" ||
    !codeChallenge ||
    codeChallengeMethod !== "S256"
  ) {
    return (
      <AuthorizeError message="This authorization request is missing required parameters. Please restart the connection from the application you were connecting from." />
    );
  }

  const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId } });
  if (!client || !client.redirectUris.includes(redirectUri)) {
    return <AuthorizeError message="Unknown client or redirect URI." />;
  }

  const session = await auth();
  if (!session?.user?.id || session.error) {
    const callbackUrl = `/oauth/authorize?${new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, value]] : [],
      ),
    ).toString()}`;
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const current = await getCurrentOrganisation(session.user.id);
  if (!current) redirect("/onboarding");

  // Skip the consent render entirely when this (user, organisation, client)
  // already has an active platform-level grant — this is what makes
  // reconnecting the same client, or connecting a second/future Orbyt MCP
  // under it, silent after the first approval. ARCHITECTURE.md §4.1/§6.
  const existingGrant = await findActivePlatformGrant(prisma, {
    userId: session.user.id,
    organisationId: current.organisationId,
    clientRowId: client.id,
  });

  if (existingGrant) {
    const membership = await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId: current.organisationId,
    });
    const { rawCode } = await completeAuthorization(prisma, {
      clientRowId: client.id,
      userId: session.user.id,
      organisationId: current.organisationId,
      role: membership.role,
      requestedScope: scope,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      resource,
    });
    redirect(appendCallback(new URL(redirectUri), { code: rawCode, state }));
  }

  return (
    <AuthorizeClient
      clientId={clientId}
      clientName={client.clientName}
      redirectUri={redirectUri}
      scope={scope}
      state={state}
      codeChallenge={codeChallenge}
      codeChallengeMethod={codeChallengeMethod}
      resource={resource ?? ""}
      organisations={current.memberships}
    />
  );
}
