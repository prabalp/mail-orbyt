import { NextResponse } from "next/server";
import { deleteSocialPolicyRule } from "@/lib/social";
import { handleSocialRoute } from "@/lib/social-route";

interface RouteParams {
  params: Promise<{ organisationId: string; ruleId: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, ruleId } = await params;
  return handleSocialRoute(request, { organisationId, permission: "social:manage" }, async (actor) => {
    const deleted = await deleteSocialPolicyRule(organisationId, actor.userId, ruleId);
    if (!deleted) return NextResponse.json({ error: "Policy rule not found" }, { status: 404 });
    return NextResponse.json(deleted);
  });
}
