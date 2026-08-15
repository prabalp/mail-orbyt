import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { updateOrganisationMeeting } from "@/lib/analytics";

interface RouteParams {
  params: Promise<{ organisationId: string; meetingId: string }>;
}

const updateSchema = z.object({
  status: z.enum(["SCHEDULED", "COMPLETED", "NO_SHOW", "CANCELLED"]).optional(),
  qualified: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  scheduledFor: z.coerce.date().optional(),
});

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, meetingId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "conversations:review",
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const body = updateSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const meeting = await updateOrganisationMeeting(organisationId, meetingId, body.data);
  if (!meeting) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  return NextResponse.json(meeting);
}
