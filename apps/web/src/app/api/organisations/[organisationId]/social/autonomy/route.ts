import { NextResponse } from "next/server";
import { z } from "zod";
import { SOCIAL_PLATFORMS, getSocialAutonomy, updateSocialAutonomy } from "@/lib/social";
import { handleSocialRoute, readJsonBody } from "@/lib/social-route";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

const patchSchema = z
  .object({
    /** Omit for the org-wide default that applies to every platform without its own row. */
    platform: z.enum(SOCIAL_PLATFORMS).optional(),
    autonomyEnabled: z.boolean().optional(),
    dryRunMode: z.boolean().optional(),
    maxActionsPerHour: z.number().int().min(0).max(100).optional(),
    maxActionsPerDay: z.number().int().min(0).max(1000).optional(),
    requireApprovalBelowConfidence: z.number().min(0).max(1).optional(),
  })
  .refine(
    (value) =>
      value.maxActionsPerHour === undefined ||
      value.maxActionsPerDay === undefined ||
      value.maxActionsPerHour <= value.maxActionsPerDay,
    { message: "maxActionsPerHour cannot exceed maxActionsPerDay" },
  );

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;
  return handleSocialRoute(request, { organisationId }, async () =>
    NextResponse.json(await getSocialAutonomy(organisationId)),
  );
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;
  return handleSocialRoute(request, { organisationId, permission: "social:manage" }, async () => {
    const body = patchSchema.safeParse(await readJsonBody(request));
    if (!body.success)
      return NextResponse.json(
        { error: "Invalid request", details: body.error.flatten() },
        { status: 400 },
      );
    const { platform, ...changes } = body.data;
    return NextResponse.json(await updateSocialAutonomy(organisationId, platform ?? null, changes));
  });
}
