import { NextResponse } from "next/server";
import { disconnectOrganisationSocialConnection } from "@/lib/social";
import { handleSocialRoute } from "@/lib/social-route";

interface RouteParams {
  params: Promise<{ organisationId: string; connectionId: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, connectionId } = await params;
  return handleSocialRoute(request, { organisationId, permission: "social:manage" }, async (actor) => {
    const updated = await disconnectOrganisationSocialConnection(organisationId, connectionId, actor.userId);
    if (!updated) return NextResponse.json({ error: "Social connection not found" }, { status: 404 });
    return NextResponse.json(updated);
  });
}
