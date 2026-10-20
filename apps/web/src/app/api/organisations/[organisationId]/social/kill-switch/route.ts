import { NextResponse } from "next/server";
import { z } from "zod";
import { SOCIAL_PLATFORMS, setSocialKillSwitch } from "@/lib/social";
import { handleSocialRoute, readJsonBody } from "@/lib/social-route";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

const bodySchema = z.object({
  active: z.boolean(),
  /** Omit to stop/resume every platform for this organisation at once. */
  platform: z.enum(SOCIAL_PLATFORMS).optional(),
});

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;
  return handleSocialRoute(request, { organisationId, permission: "social:kill_switch" }, async (actor) => {
    const body = bodySchema.safeParse(await readJsonBody(request));
    if (!body.success) return NextResponse.json({ error: "Invalid request", details: body.error.flatten() }, { status: 400 });
    return NextResponse.json(
      await setSocialKillSwitch(organisationId, actor.userId, body.data.active, body.data.platform ?? null),
    );
  });
}
