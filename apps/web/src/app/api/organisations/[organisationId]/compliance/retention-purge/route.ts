import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { purgeStaleData } from "@mail-orbyt/compliance";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

const purgeSchema = z.object({ retentionDays: z.number().int().min(1).max(3650).default(90) });

/** Manually triggers a retention purge for this organisation — deletes DISCARDED email drafts and raw import rows older than the retention window. Never touches suppression entries, sent emails, or meetings. */
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
      permission: "organisation:delete",
    });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const body = purgeSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const result = await purgeStaleData(prisma, organisationId, body.data.retentionDays);
  return NextResponse.json(result);
}
