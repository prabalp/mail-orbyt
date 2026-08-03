import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createInboxSignature, listInboxSignatures } from "@/lib/gmail";

interface RouteParams {
  params: Promise<{ organisationId: string; inboxId: string }>;
}

const createSchema = z.object({
  label: z.string().min(1).max(100),
  content: z.string().min(1).max(2000),
  isDefault: z.boolean().optional(),
});

async function requireManagePermission(userId: string, organisationId: string) {
  await requireOrganisationMembership(prisma, {
    userId,
    organisationId,
    permission: "inboxes:manage",
  });
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, inboxId } = await params;

  try {
    await requireOrganisationMembership(prisma, { userId: session.user.id, organisationId });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const signatures = await listInboxSignatures(organisationId, inboxId);
  if (signatures === null) return NextResponse.json({ error: "Inbox not found" }, { status: 404 });
  return NextResponse.json({ signatures });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, inboxId } = await params;

  try {
    await requireManagePermission(session.user.id, organisationId);
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const body = createSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const signature = await createInboxSignature(organisationId, inboxId, body.data);
  if (!signature) return NextResponse.json({ error: "Inbox not found" }, { status: 404 });
  return NextResponse.json(signature, { status: 201 });
}
