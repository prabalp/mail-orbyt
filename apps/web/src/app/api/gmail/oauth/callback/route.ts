import { requireOrganisationMembership, ForbiddenError } from "@mail-orbyt/authentication";
import { GoogleOAuthError } from "@mail-orbyt/gmail";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { GMAIL_OAUTH_ORG_COOKIE, GMAIL_OAUTH_STATE_COOKIE, completeGmailOAuth } from "@/lib/gmail";

function redirectToInboxes(request: Request, status: "connected" | "error", message?: string) {
  const url = new URL("/inboxes", request.url);
  url.searchParams.set("gmailOAuth", status);
  if (message) url.searchParams.set("message", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GMAIL_OAUTH_STATE_COOKIE)?.value;
  const organisationId = cookieStore.get(GMAIL_OAUTH_ORG_COOKIE)?.value;
  cookieStore.delete(GMAIL_OAUTH_STATE_COOKIE);
  cookieStore.delete(GMAIL_OAUTH_ORG_COOKIE);

  if (!code || !state || !expectedState || !organisationId || state !== expectedState) {
    return redirectToInboxes(request, "error", "Invalid or expired OAuth state.");
  }

  try {
    await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "inboxes:manage",
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return redirectToInboxes(request, "error", "You do not have permission to connect inboxes.");
    }
    throw error;
  }

  try {
    await completeGmailOAuth({ organisationId, connectedByUserId: session.user.id, code });
  } catch (error) {
    if (error instanceof GoogleOAuthError) {
      return redirectToInboxes(request, "error", error.message);
    }
    throw error;
  }

  return redirectToInboxes(request, "connected");
}
