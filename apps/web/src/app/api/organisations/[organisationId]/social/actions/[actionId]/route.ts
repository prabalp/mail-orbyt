import { NextResponse } from "next/server";
import { getSocialAction } from "@/lib/social";
import { handleSocialRoute } from "@/lib/social-route";

interface RouteParams {
  params: Promise<{ organisationId: string; actionId: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, actionId } = await params;
  return handleSocialRoute(request, { organisationId }, async () => {
    const action = await getSocialAction(organisationId, actionId);
    if (!action) return NextResponse.json({ error: "Social action not found" }, { status: 404 });
    return NextResponse.json(action);
  });
}
