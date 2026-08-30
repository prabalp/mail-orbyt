import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { upsertTrackingDomain } from "@mail-orbyt/tracking";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

// Bare hostname/subdomain — no scheme, no path (e.g. "track.acme.example").
const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
    "Enter a bare domain, e.g. track.acme.example",
  );

const bodySchema = z.object({ domain: domainSchema });

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  try {
    await authenticateOrganisationRequest(request, { organisationId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const env = loadEnv();
  const trackingDomain = await prisma.trackingDomain.findUnique({ where: { organisationId } });

  return NextResponse.json({
    trackingDomain,
    cnameTarget: env.TRACKING_CNAME_TARGET ?? null,
    verificationTxtName: trackingDomain ? `_mail-orbyt-verify.${trackingDomain.domain}` : null,
  });
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "inboxes:manage",
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const trackingDomain = await upsertTrackingDomain(prisma, organisationId, parsed.data.domain);
  return NextResponse.json({ trackingDomain });
}
