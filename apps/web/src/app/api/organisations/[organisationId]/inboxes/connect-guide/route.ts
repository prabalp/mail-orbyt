import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

/**
 * Backs two composite MCP tools (connect_inbox, get_inbox_connection_status)
 * that together turn "connect a Gmail inbox" into one guided round trip
 * instead of a link handed over with no way to check on it. Same GET, two
 * modes selected by the presence of `emailAddress` — mirroring the
 * suppressions route's `?email=` convention.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;
  const url = new URL(request.url);
  const emailAddress = url.searchParams.get("emailAddress");

  // Checking status is a read anyone can do (matches get_inbox_connection_status's
  // "profile" scope); building the connect link requires the permission that
  // actually gates starting a new OAuth connection (matches connect_inbox's
  // "inboxes:manage" scope).
  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: emailAddress ? undefined : "inboxes:manage",
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  if (emailAddress) {
    const inbox = await prisma.inbox.findFirst({
      where: { organisationId, emailAddress },
      select: { id: true, emailAddress: true, status: true },
    });

    if (!inbox) {
      return NextResponse.json({ status: "not_found", inbox: null });
    }

    return NextResponse.json({
      status: inbox.status === "CONNECTED" ? "connected" : "needs_attention",
      inbox,
    });
  }

  const appUrl = loadEnv().APP_URL.replace(/\/$/, "");
  const connectUrl = `${appUrl}/api/gmail/oauth/start?organisationId=${encodeURIComponent(organisationId)}`;

  return NextResponse.json({
    connectUrl,
    steps: [
      "Open the link in a browser where you're already signed in to Mail Orbyt.",
      "Approve Google's consent screen for the Gmail account you want to send from.",
      "Once approved, the inbox connects automatically — poll get_inbox_connection_status with that email address to confirm.",
      "Run a DNS check on the sending domain before enrolling anyone: SPF, DKIM, or DMARC failures send outreach straight to spam regardless of the copy.",
    ],
  });
}
