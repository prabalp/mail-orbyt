import { NextResponse } from "next/server";
import { z } from "zod";
import { approveSocialAction } from "@/lib/social";
import { handleSocialRoute, readJsonBody } from "@/lib/social-route";

interface RouteParams {
  params: Promise<{ organisationId: string; actionId: string }>;
}

const bodySchema = z.object({ notes: z.string().max(2000).optional() });

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, actionId } = await params;
  return handleSocialRoute(request, { organisationId, permission: "social:review" }, async (actor) => {
    const body = bodySchema.safeParse((await readJsonBody(request)) ?? {});
    if (!body.success) return NextResponse.json({ error: "Invalid request", details: body.error.flatten() }, { status: 400 });
    return NextResponse.json(await approveSocialAction(organisationId, actionId, actor.userId, body.data.notes));
  });
}
