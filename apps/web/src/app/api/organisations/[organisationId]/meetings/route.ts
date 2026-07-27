import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createOrganisationMeeting, listOrganisationMeetings } from "@/lib/analytics";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

const createSchema = z.object({
  leadId: z.string().min(1),
  campaignId: z.string().optional(),
  conversationId: z.string().optional(),
  scheduledFor: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId } = await params;

  try {
    await requireOrganisationMembership(prisma, { userId: session.user.id, organisationId });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const meetings = await listOrganisationMeetings(organisationId);
  return NextResponse.json({ meetings });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId } = await params;

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

  const body = createSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const meeting = await createOrganisationMeeting({
      organisationId,
      ...body.data,
      createdByUserId: session.user.id,
    });
    return NextResponse.json(meeting, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
}
