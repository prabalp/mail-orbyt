import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { confirmFact, editFact, rejectFact } from "@mail-orbyt/research";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ organisationId: string; factId: string }>;
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("edit"), value: z.string().trim().min(1).max(2000) }),
]);

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, factId } = await params;

  try {
    await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "research:review",
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

  const result =
    parsed.data.action === "confirm"
      ? await confirmFact(prisma, organisationId, factId)
      : parsed.data.action === "reject"
        ? await rejectFact(prisma, organisationId, factId)
        : await editFact(prisma, organisationId, factId, parsed.data.value);

  if (!result) {
    return NextResponse.json({ error: "Fact not found" }, { status: 404 });
  }

  return NextResponse.json({ fact: result });
}
