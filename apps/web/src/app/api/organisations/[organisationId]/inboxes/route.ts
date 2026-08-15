import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { listOrganisationDnsChecks, listOrganisationInboxes } from "@/lib/gmail";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  try {
    await authenticateOrganisationRequest(request, { organisationId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const [inboxes, dnsChecks] = await Promise.all([
    listOrganisationInboxes(organisationId),
    listOrganisationDnsChecks(organisationId),
  ]);

  return NextResponse.json({
    inboxes: inboxes.map((inbox) => ({
      id: inbox.id,
      emailAddress: inbox.emailAddress,
      displayName: inbox.displayName,
      status: inbox.status,
      dailySendLimit: inbox.dailySendLimit,
      createdAt: inbox.createdAt,
    })),
    dnsChecks,
  });
}
