import { NextResponse } from "next/server";
import { z } from "zod";
import { SOCIAL_PLATFORMS, createSocialPolicyRule, listSocialPolicyRules } from "@/lib/social";
import { handleSocialRoute, readJsonBody } from "@/lib/social-route";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

const createSchema = z.object({
  kind: z.enum(["BANNED_TOPIC", "BANNED_PHRASE", "ALLOWED_TOPIC", "REQUIRE_APPROVAL_KEYWORD"]),
  pattern: z.string().trim().min(1).max(500),
  isRegex: z.boolean().default(false),
  /** Omit to apply the rule on every platform. */
  platform: z.enum(SOCIAL_PLATFORMS).optional(),
});

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;
  return handleSocialRoute(request, { organisationId }, async () =>
    NextResponse.json(await listSocialPolicyRules(organisationId)),
  );
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;
  return handleSocialRoute(request, { organisationId, permission: "social:manage" }, async (actor) => {
    const body = createSchema.safeParse(await readJsonBody(request));
    if (!body.success) return NextResponse.json({ error: "Invalid request", details: body.error.flatten() }, { status: 400 });
    const rule = await createSocialPolicyRule(organisationId, actor.userId, {
      ...body.data,
      platform: body.data.platform ?? null,
    });
    return NextResponse.json(rule, { status: 201 });
  });
}
