import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ organisationId: string; batchId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, batchId } = await params;

  try {
    await requireOrganisationMembership(prisma, { userId: session.user.id, organisationId });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.organisationId !== organisationId) {
    return NextResponse.json({ error: "Import batch not found" }, { status: 404 });
  }

  return NextResponse.json({ batch });
}
