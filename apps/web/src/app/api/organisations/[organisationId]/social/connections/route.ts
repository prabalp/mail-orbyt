import { NextResponse } from "next/server";
import { listOrganisationSocialConnections } from "@/lib/social";
import { handleSocialRoute } from "@/lib/social-route";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;
  return handleSocialRoute(request, { organisationId }, async () =>
    NextResponse.json(await listOrganisationSocialConnections(organisationId)),
  );
}
