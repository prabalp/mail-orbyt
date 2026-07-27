import { requireOrganisationMembership, ForbiddenError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import {
  GMAIL_OAUTH_ORG_COOKIE,
  GMAIL_OAUTH_STATE_COOKIE,
  buildGmailAuthorizationUrl,
  createOAuthState,
} from "@/lib/gmail";

/** Starts the Gmail sending-inbox OAuth handshake for the given organisation. Uses a dedicated OAuth client — never the application-login Google client — and a short-lived state cookie to bind the eventual callback back to this organisation and prevent CSRF. */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const organisationId = new URL(request.url).searchParams.get("organisationId");
  if (!organisationId) {
    return NextResponse.json({ error: "organisationId is required" }, { status: 400 });
  }

  try {
    await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "inboxes:manage",
    });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const state = createOAuthState();
  const cookieStore = await cookies();
  cookieStore.set(GMAIL_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  cookieStore.set(GMAIL_OAUTH_ORG_COOKIE, organisationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(buildGmailAuthorizationUrl(state));
}
