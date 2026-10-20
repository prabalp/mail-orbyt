import { requireOrganisationMembership, ForbiddenError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  SOCIAL_OAUTH_ORG_COOKIE,
  SOCIAL_OAUTH_PLATFORM_COOKIE,
  SOCIAL_OAUTH_STATE_COOKIE,
  SOCIAL_OAUTH_VERIFIER_COOKIE,
  SocialRequestError,
  buildSocialAuthorization,
  createSocialOAuthState,
  parseSocialPlatform,
} from "@/lib/social";

/** Starts a social account OAuth handshake. Same shape as the Gmail flow: session-authenticated (a human in a browser), with short-lived httpOnly cookies binding the callback to this organisation/platform and preventing CSRF. */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(signIn);
  }

  const searchParams = new URL(request.url).searchParams;
  const organisationId = searchParams.get("organisationId");
  const platform = parseSocialPlatform(searchParams.get("platform"));
  if (!organisationId || !platform) {
    return NextResponse.json(
      { error: "organisationId and platform (LINKEDIN|TWITTER|REDDIT|INSTAGRAM|THREADS) are required" },
      { status: 400 },
    );
  }

  try {
    await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "social:manage",
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const state = createSocialOAuthState();
  let authorization;
  try {
    authorization = buildSocialAuthorization(platform, state);
  } catch (error) {
    if (error instanceof SocialRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  };
  const cookieStore = await cookies();
  cookieStore.set(SOCIAL_OAUTH_STATE_COOKIE, state, cookieOptions);
  cookieStore.set(SOCIAL_OAUTH_ORG_COOKIE, organisationId, cookieOptions);
  cookieStore.set(SOCIAL_OAUTH_PLATFORM_COOKIE, platform, cookieOptions);
  if (authorization.codeVerifier) {
    cookieStore.set(SOCIAL_OAUTH_VERIFIER_COOKIE, authorization.codeVerifier, cookieOptions);
  } else {
    cookieStore.delete(SOCIAL_OAUTH_VERIFIER_COOKIE);
  }

  return NextResponse.redirect(authorization.url);
}
