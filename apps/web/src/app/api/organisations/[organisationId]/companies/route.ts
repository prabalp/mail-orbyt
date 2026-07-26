import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { listCompanies } from "@mail-orbyt/leads";
import { prisma } from "@mail-orbyt/database";
import { paginationSchema } from "@mail-orbyt/validation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const url = new URL(request.url);
  const pagination = paginationSchema.parse(Object.fromEntries(url.searchParams));
  const search = url.searchParams.get("search") ?? undefined;

  const result = await listCompanies(prisma, { organisationId, ...pagination, search });
  return NextResponse.json(result);
}
