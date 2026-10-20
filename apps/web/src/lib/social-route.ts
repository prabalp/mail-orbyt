import { ForbiddenError, UnauthenticatedError, type Permission } from "@mail-orbyt/authentication";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest, type AuthenticatedOrganisationActor } from "@/lib/api-auth";
import { SocialRequestError } from "@/lib/social";

/**
 * Authenticates an organisation-scoped social route (session or MCP bearer
 * token) and maps the known error types to status codes, so each route
 * handler is only its own validation and service call.
 */
export async function handleSocialRoute(
  request: Request,
  params: { organisationId: string; permission?: Permission },
  handler: (actor: AuthenticatedOrganisationActor) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const actor = await authenticateOrganisationRequest(request, params);
    return await handler(actor);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof SocialRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
