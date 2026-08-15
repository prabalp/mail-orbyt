import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { disconnectOrganisationInbox, updateInboxDailyLimit } from "@/lib/gmail";

interface RouteParams {
  params: Promise<{ organisationId: string; inboxId: string }>;
}

const patchSchema = z.object({ dailySendLimit: z.number().int().min(1).max(500) });

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, inboxId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "inboxes:manage",
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const body = patchSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const updated = await updateInboxDailyLimit(organisationId, inboxId, body.data.dailySendLimit);
  if (!updated) return NextResponse.json({ error: "Inbox not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, inboxId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "inboxes:manage",
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const updated = await disconnectOrganisationInbox(organisationId, inboxId);
  if (!updated) return NextResponse.json({ error: "Inbox not found" }, { status: 404 });
  return NextResponse.json(updated);
}
