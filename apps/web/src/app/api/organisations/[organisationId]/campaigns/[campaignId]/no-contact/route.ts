import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { emailSchema } from "@mail-orbyt/validation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import {
  addToCampaignNoContactList,
  getCampaignNoContactList,
  removeFromCampaignNoContactList,
} from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string }>;
}

const addSchema = z.object({
  emails: z.array(emailSchema).min(1).max(1000),
  note: z.string().trim().max(500).optional(),
});
const removeSchema = z.object({ email: emailSchema });

async function authenticate(
  request: Request,
  organisationId: string,
  write: boolean,
): Promise<NextResponse | null> {
  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      ...(write ? { permission: "campaigns:manage" as const } : {}),
    });
    return null;
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}

function notFoundOrThrow(error: unknown): NextResponse {
  if (error instanceof Error && error.message.startsWith("Campaign not found")) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  throw error;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, campaignId } = await params;
  const denied = await authenticate(request, organisationId, false);
  if (denied) return denied;
  try {
    return NextResponse.json({
      entries: await getCampaignNoContactList(organisationId, campaignId),
    });
  } catch (error) {
    return notFoundOrThrow(error);
  }
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, campaignId } = await params;
  const denied = await authenticate(request, organisationId, true);
  if (denied) return denied;
  const body = addSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(
      await addToCampaignNoContactList(
        organisationId,
        campaignId,
        body.data.emails,
        body.data.note,
      ),
    );
  } catch (error) {
    return notFoundOrThrow(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, campaignId } = await params;
  const denied = await authenticate(request, organisationId, true);
  if (denied) return denied;
  const body = removeSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  try {
    const removed = await removeFromCampaignNoContactList(
      organisationId,
      campaignId,
      body.data.email,
    );
    return NextResponse.json({ removed });
  } catch (error) {
    return notFoundOrThrow(error);
  }
}
