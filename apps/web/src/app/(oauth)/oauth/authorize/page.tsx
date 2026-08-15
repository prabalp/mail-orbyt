import { redirect } from "next/navigation";
import { prisma } from "@mail-orbyt/database";
import { auth } from "@/lib/auth";
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

  return (
    <AuthorizeClient
      clientId={clientId}
      clientName={client.clientName}
      redirectUri={redirectUri}
      scope={scope}
      state={state}
      codeChallenge={codeChallenge}
      codeChallengeMethod={codeChallengeMethod}
      organisations={memberships.map((m) => ({
        id: m.organisationId,
        name: m.organisation.name,
        role: m.role,
      }))}
    />
  );
}
