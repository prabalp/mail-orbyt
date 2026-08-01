import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

const bodySchema = z.object({
  emailPromptInstructions: z.string().max(2000).optional(),
  calendlyUrl: z.union([z.string().url(), z.literal("")]).optional(),
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

  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: organisationId },
  });
  return NextResponse.json({
    emailPromptInstructions: organisation.emailPromptInstructions,
    calendlyUrl: organisation.calendlyUrl,
  });
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId } = await params;

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

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const organisation = await prisma.organisation.update({
    where: { id: organisationId },
    data: {
      emailPromptInstructions: parsed.data.emailPromptInstructions || null,
      calendlyUrl: parsed.data.calendlyUrl || null,
    },
  });

  return NextResponse.json({
    emailPromptInstructions: organisation.emailPromptInstructions,
    calendlyUrl: organisation.calendlyUrl,
  });
}
