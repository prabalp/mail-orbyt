import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { listCompanies } from "@mail-orbyt/leads";
import { prisma } from "@mail-orbyt/database";
import { paginationSchema } from "@mail-orbyt/validation";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  try {
    await authenticateOrganisationRequest(request, { organisationId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
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
