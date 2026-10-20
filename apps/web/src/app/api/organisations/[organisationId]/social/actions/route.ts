import { NextResponse } from "next/server";
import { z } from "zod";
import { SOCIAL_PLATFORMS, listSocialActions } from "@/lib/social";
import { handleSocialRoute } from "@/lib/social-route";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

const querySchema = z.object({
  status: z
    .enum([
      "PENDING_POLICY_CHECK",
      "PENDING_HUMAN_APPROVAL",
      "APPROVED",
      "REJECTED_BY_POLICY",
      "REJECTED_BY_HUMAN",
      "DRY_RUN_SIMULATED",
      "PUBLISHED",
      "FAILED",
      "KILLED",
    ])
    .optional(),
  platform: z.enum(SOCIAL_PLATFORMS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;
  return handleSocialRoute(request, { organisationId }, async () => {
    const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success)
      return NextResponse.json(
        { error: "Invalid request", details: query.error.flatten() },
        { status: 400 },
      );
    return NextResponse.json(await listSocialActions(organisationId, query.data));
  });
}
