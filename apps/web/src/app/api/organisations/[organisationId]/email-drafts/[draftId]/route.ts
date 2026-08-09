import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { deleteDraft, setDraftStatus } from "@/lib/email-drafts";

interface RouteParams {
  params: Promise<{ organisationId: string; draftId: string }>;
}

// "discard" used to live here alongside "approve". An unwanted draft is now
// DELETEd instead, so it leaves the panel rather than lingering as a
// DISCARDED row. The status itself still exists for rows created before this
// change, which the retention sweep continues to clean up.
const patchSchema = z.object({ action: z.literal("approve") });

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, draftId } = await params;

  try {
    await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "campaigns:manage",
    });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const draft = await prisma.emailDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.organisationId !== organisationId) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const body = patchSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const updated = await setDraftStatus(organisationId, draftId, "APPROVED");
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, draftId } = await params;

  try {
    await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "campaigns:manage",
    });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const draft = await prisma.emailDraft.findUnique({ where: { id: draftId } });
  // Also covers a draft another tab already deleted — idempotent from the
  // panel's point of view, since it reloads the list either way.
  if (!draft || draft.organisationId !== organisationId) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  await deleteDraft(organisationId, draftId);
  return new NextResponse(null, { status: 204 });
}
