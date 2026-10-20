import { NextResponse } from "next/server";
import { z } from "zod";
import { draftSocialPost } from "@/lib/social";
import { handleSocialRoute, readJsonBody } from "@/lib/social-route";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

const bodySchema = z.object({
  connectionId: z.string().min(1),
  brief: z.string().trim().min(1).max(2000),
  voiceInstructions: z.string().max(2000).optional(),
});

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;
  return handleSocialRoute(request, { organisationId, permission: "social:manage" }, async () => {
    const body = bodySchema.safeParse(await readJsonBody(request));
    if (!body.success)
      return NextResponse.json(
        { error: "Invalid request", details: body.error.flatten() },
        { status: 400 },
      );
    return NextResponse.json(await draftSocialPost(organisationId, body.data), { status: 201 });
  });
}
