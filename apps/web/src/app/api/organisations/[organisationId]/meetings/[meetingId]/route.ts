import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, meetingId } = await params;

  try {
    await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "conversations:review",
    });
  } catch (error) {
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
