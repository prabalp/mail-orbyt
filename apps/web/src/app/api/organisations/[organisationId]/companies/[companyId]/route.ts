import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { getCompany } from "@mail-orbyt/leads";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ organisationId: string; companyId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, companyId } = await params;

  try {
    await requireOrganisationMembership(prisma, { userId: session.user.id, organisationId });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const company = await getCompany(prisma, organisationId, companyId);
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const leads = await prisma.lead.findMany({
    where: { organisationId, companyId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ company, leads });
}
