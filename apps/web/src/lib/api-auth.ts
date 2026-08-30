import {
  ForbiddenError,
  requireOrganisationMembership,
  UnauthenticatedError,
  type Permission,
} from "@mail-orbyt/authentication";
import { prisma, type OrganisationMembership } from "@mail-orbyt/database";
import { scopeIncludes, verifyAccessToken, PROFILE_SCOPE } from "@mail-orbyt/mcp-oauth";
import { auth } from "@/lib/auth";

function bearerTokenFrom(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

/**
 * Resolves the calling user, accepting either the existing NextAuth session
 * cookie (the web UI's path) or an `Authorization: Bearer` MCP access token
 * (apps/mcp-server's path) — with no organisation/permission check. Use for
 * routes that aren't scoped to a single organisation (list-my-organisations,
 * switch-organisation).
 */
export async function authenticateUser(request: Request): Promise<string> {
  const rawToken = bearerTokenFrom(request);
  if (rawToken) {
    const token = await verifyAccessToken(prisma, rawToken);
    if (!token) throw new UnauthenticatedError();
    return token.userId;
  }

  const session = await auth();
  if (!session?.user?.id) throw new UnauthenticatedError();
  return session.user.id;
}

export interface AuthenticatedOrganisationActor {
  userId: string;
  membership: OrganisationMembership;
}

/**
 * The bearer-or-session counterpart to `requireOrganisationMembership` —
 * every organisation-scoped API route should call this in place of the
 * `await auth()` + membership-check pair it previously wrote out directly.
 *
 * A bearer token is additionally checked against its own bound
 * organisationId and scope (an MCP connection can never reach an
 * organisation or permission it wasn't granted for), but membership is
 * still re-derived from the database either way — a token minted before a
 * user was removed from the organisation is rejected here too. Returns the
 * membership row (not just userId) since a few routes need the caller's
 * role for further authorization decisions (e.g. assigning roles).
 */
export async function authenticateOrganisationRequest(
  request: Request,
  params: { organisationId: string; permission?: Permission },
): Promise<AuthenticatedOrganisationActor> {
  const rawToken = bearerTokenFrom(request);

  let userId: string;
  if (rawToken) {
    const token = await verifyAccessToken(prisma, rawToken);
    if (!token) throw new UnauthenticatedError();
    if (token.organisationId !== params.organisationId) {
      throw new ForbiddenError("This connection is not authorized for this organisation");
    }
    const requiredScope = params.permission ?? PROFILE_SCOPE;
    if (!scopeIncludes(token.scope, requiredScope)) {
      throw new ForbiddenError(`Missing required scope: ${requiredScope}`);
    }
    userId = token.userId;
  } else {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthenticatedError();
    userId = session.user.id;
  }

  const membership = await requireOrganisationMembership(prisma, {
    userId,
    organisationId: params.organisationId,
    permission: params.permission,
  });

  return { userId, membership };
}
