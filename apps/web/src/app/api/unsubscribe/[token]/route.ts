import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { addSuppressionEntry } from "@mail-orbyt/leads";
import { verifyUnsubscribeToken } from "@mail-orbyt/scheduling";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * Public, unauthenticated unsubscribe. The signed token is the only
 * credential, and it can only unsubscribe the address it was issued for.
 * Serves two callers: the confirmation form on /unsubscribe/[token] (marked
 * with source=page, answered with a redirect back to that page) and mail
 * clients' List-Unsubscribe one-click POST (RFC 8058, answered with 200).
 * Always suppresses organisation-wide: unsubscribing from one campaign's
 * email means no more cold email from the organisation to that address.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { token } = await params;
  const env = loadEnv();
  const payload = verifyUnsubscribeToken(env.AUTH_SECRET, token);
  if (!payload) return NextResponse.json({ error: "Invalid unsubscribe link" }, { status: 400 });

  await addSuppressionEntry(prisma, {
    organisationId: payload.organisationId,
    type: "EMAIL",
    value: payload.email,
    reason: "UNSUBSCRIBE",
    note: "Unsubscribed via link in email",
  });

  const form = await request.formData().catch(() => null);
  if (form?.get("source") === "page") {
    // Redirect from APP_URL, not the request URL, which is the internal address behind the proxy.
    return NextResponse.redirect(new URL(`/unsubscribe/${token}?done=1`, env.APP_URL), 303);
  }
  return NextResponse.json({ unsubscribed: true });
}
