import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { buildSanitizedCsv } from "@mail-orbyt/leads";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const EXPORT_COLUMNS = [
  "firstName",
  "lastName",
  "email",
  "title",
  "company",
  "linkedinUrl",
  "websiteUrl",
  "industry",
  "city",
  "state",
  "country",
  "status",
];

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

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

  const leads = await prisma.lead.findMany({
    where: { organisationId },
    include: { company: true },
    orderBy: { createdAt: "desc" },
  });

  const csv = buildSanitizedCsv(
    EXPORT_COLUMNS,
    leads.map((lead) => ({
      firstName: lead.firstName ?? "",
      lastName: lead.lastName ?? "",
      email: lead.email ?? "",
      title: lead.title ?? "",
      company: lead.company?.name ?? "",
      linkedinUrl: lead.linkedinUrl ?? "",
      websiteUrl: lead.websiteUrl ?? "",
      industry: lead.industry ?? "",
      city: lead.city ?? "",
      state: lead.state ?? "",
      country: lead.country ?? "",
      status: lead.status,
    })),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-export.csv"`,
    },
  });
}
