import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { isApprovedForTls } from "@mail-orbyt/tracking";
import { NextResponse } from "next/server";

/**
 * Cloudflare-for-SaaS-style "ask" callback for a reverse proxy's on-demand
 * TLS (e.g. Caddy — see infra/Caddyfile.example): called once per new
 * hostname before it issues a certificate. Approves a hostname only if some
 * organisation has it as a VERIFIED tracking domain — this is what stops
 * on-demand TLS from being abused to mint a certificate for an arbitrary
 * domain. Guarded by a shared secret since it's otherwise a public oracle
 * for which domains are configured.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const env = loadEnv();
  if (!env.INTERNAL_ASK_SECRET) {
    return new NextResponse(null, { status: 403 });
  }

  const providedSecret = request.headers.get("x-internal-ask-secret");
  if (providedSecret !== env.INTERNAL_ASK_SECRET) {
    return new NextResponse(null, { status: 403 });
  }

  const domain = new URL(request.url).searchParams.get("domain");
  if (!domain) {
    return new NextResponse(null, { status: 400 });
  }

  const approved = await isApprovedForTls(prisma, domain);
  return new NextResponse(null, { status: approved ? 200 : 403 });
}
