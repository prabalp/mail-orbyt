import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { verifyTrackingDomain } from "@mail-orbyt/tracking";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const env = loadEnv();
  if (!env.TRACKING_CNAME_TARGET) {
    return NextResponse.json(
      { error: "Tracking domains aren't configured on this deployment yet." },
      { status: 503 },
    );
  }

  const trackingDomain = await verifyTrackingDomain(
    prisma,
    organisationId,
    env.TRACKING_CNAME_TARGET,
  );
  if (!trackingDomain) {
    return NextResponse.json(
      { error: "No tracking domain set for this organisation." },
      { status: 404 },
    );
  }

  return NextResponse.json({ trackingDomain });
}
