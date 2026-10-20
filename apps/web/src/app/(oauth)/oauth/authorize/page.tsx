import { redirect } from "next/navigation";
import { prisma } from "@mail-orbyt/database";
import {
  createAuthorizationCode,
  findActivePlatformGrant,
  intersectScopes,
  parseScope,
  RESOURCE_KIND_GATEWAY,
  resolveAuthorizeResource,
} from "@mail-orbyt/mcp-oauth";
import { auth } from "@/lib/auth";
import { mcpServerPublicUrl } from "@/lib/mcp-resource";
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

  const requestedResource = stringParam(params, "resource");
  const resource = await resolveAuthorizeResource(prisma, {
    requested: requestedResource,
    mcpServerUrl: mcpServerPublicUrl(),
  });
  if (!resource) {
    return <AuthorizeError message="The requested resource is not recognised (invalid_target)." />;
  }
  const isPlatformFlow = resource.kind === RESOURCE_KIND_GATEWAY;

  const session = await auth();
  if (!session?.user?.id || session.error) {
    const callbackUrl = `/oauth/authorize?${new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, value]] : [],
      ),
    ).toString()}`;
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const memberships = await prisma.organisationMembership.findMany({
    where: { userId: session.user.id },
    include: { organisation: true },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) redirect("/onboarding");

  // One consent, ever: an unrevoked platform grant for (user, client) means
  // the user already approved — issue the code straight away, no screen.
  if (isPlatformFlow) {
    const grant = await findActivePlatformGrant(prisma, {
      userId: session.user.id,
      clientRowId: client.id,
    });
    const grantMembership = grant
      ? memberships.find((m) => m.organisationId === grant.organisationId)
      : undefined;
    if (grant && grantMembership) {
      const grantScopes = new Set(parseScope(grant.scope));
      const narrowed = parseScope(scope)
        .filter((s) => grantScopes.has(s))
        .join(" ");
      const { rawCode } = await createAuthorizationCode(prisma, {
        clientRowId: client.id,
        userId: session.user.id,
        organisationId: grant.organisationId,
        scope: intersectScopes(narrowed, grantMembership.role),
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        resource: resource.resourceUri,
        platformGrantId: grant.id,
      });
      const callback = new URL(redirectUri);
      callback.searchParams.set("code", rawCode);
      if (state) callback.searchParams.set("state", state);
      redirect(callback.toString());
    }
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
      resource={isPlatformFlow ? requestedResource : null}
      platformConsent={isPlatformFlow}
      organisations={memberships.map((m) => ({
        id: m.organisationId,
        name: m.organisation.name,
        role: m.role,
      }))}
    />
  );
}
