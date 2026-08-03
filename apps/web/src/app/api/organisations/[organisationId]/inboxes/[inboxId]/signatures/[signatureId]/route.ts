import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { deleteInboxSignature, setDefaultInboxSignature, updateInboxSignature } from "@/lib/gmail";

interface RouteParams {
  params: Promise<{ organisationId: string; inboxId: string; signatureId: string }>;
}

const patchSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(2000).optional(),
  isDefault: z.literal(true).optional(),
});

async function requireManagePermission(userId: string, organisationId: string) {
  await requireOrganisationMembership(prisma, {
    userId,
    organisationId,
    permission: "inboxes:manage",
  });
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, inboxId, signatureId } = await params;

  try {
    await requireManagePermission(session.user.id, organisationId);
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const body = patchSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  if (body.data.isDefault) {
    const signature = await setDefaultInboxSignature(organisationId, inboxId, signatureId);
    if (!signature) return NextResponse.json({ error: "Signature not found" }, { status: 404 });
    return NextResponse.json(signature);
  }

  const { label, content } = body.data;
  const signature = await updateInboxSignature(organisationId, inboxId, signatureId, {
    label,
    content,
  });
  if (!signature) return NextResponse.json({ error: "Signature not found" }, { status: 404 });
  return NextResponse.json(signature);
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, inboxId, signatureId } = await params;

  try {
    await requireManagePermission(session.user.id, organisationId);
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const signature = await deleteInboxSignature(organisationId, inboxId, signatureId);
  if (!signature) return NextResponse.json({ error: "Signature not found" }, { status: 404 });
  return NextResponse.json(signature);
}
