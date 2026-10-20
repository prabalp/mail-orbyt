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
  completeSocialOAuth,
  parseSocialPlatform,
} from "@/lib/social";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** There is no social settings page yet, so the result is a minimal standalone page. */
function resultPage(title: string, message: string, status: number): NextResponse {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5}</style>
</head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p>You can close this tab.</p></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id)
    return resultPage("Not signed in", "Sign in to Mail Orbyt and try again.", 401);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(SOCIAL_OAUTH_STATE_COOKIE)?.value;
  const organisationId = cookieStore.get(SOCIAL_OAUTH_ORG_COOKIE)?.value;
  const platform = parseSocialPlatform(cookieStore.get(SOCIAL_OAUTH_PLATFORM_COOKIE)?.value);
  const codeVerifier = cookieStore.get(SOCIAL_OAUTH_VERIFIER_COOKIE)?.value;
  for (const name of [
    SOCIAL_OAUTH_STATE_COOKIE,
    SOCIAL_OAUTH_ORG_COOKIE,
    SOCIAL_OAUTH_PLATFORM_COOKIE,
    SOCIAL_OAUTH_VERIFIER_COOKIE,
  ]) {
    cookieStore.delete(name);
  }

  if (providerError) return resultPage("Connection cancelled", providerError, 400);
  if (
    !code ||
    !state ||
    !expectedState ||
    !organisationId ||
    !platform ||
    state !== expectedState
  ) {
    return resultPage(
      "Connection failed",
      "Invalid or expired OAuth state — start the connection again.",
      400,
    );
  }

  try {
    await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "social:manage",
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return resultPage(
        "Not allowed",
        "You do not have permission to connect social accounts.",
        403,
      );
    }
    throw error;
  }

  try {
    const connection = await completeSocialOAuth({
      organisationId,
      connectedByUserId: session.user.id,
      platform,
      code,
      codeVerifier,
    });
    return resultPage(
      "Account connected",
      `Connected ${platform} account ${connection.externalHandle}. The agent starts in dry-run with autonomy off until you change its settings.`,
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return resultPage("Connection failed", message, 502);
  }
}
