import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { buildLeadWhere, buildSanitizedCsv } from "@mail-orbyt/leads";
import { prisma } from "@mail-orbyt/database";
import type { Prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
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

async function buildCsvResponse(
  where: Prisma.LeadWhereInput,
  fileName: string,
): Promise<NextResponse> {
  const leads = await prisma.lead.findMany({
    where,
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
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

async function authorize(request: Request, organisationId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  try {
    await requireOrganisationMembership(prisma, { userId: session.user.id, organisationId });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
  return null;
}

/**
 * Exports leads as CSV. With no query parameters this is every lead in the
 * organisation (both ACTIVE and ARCHIVED — an export is an archive of the
 * whole book, not of one view). Passing search/status/leadListId narrows it
 * to exactly what the leads table is showing, using the same predicate
 * builder the table itself queries through.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;
  const denied = await authorize(request, organisationId);
  if (denied) return denied;

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const statusParam = url.searchParams.get("status");
  const leadListId = url.searchParams.get("leadListId") ?? undefined;
  const hasFilter = Boolean(search || statusParam || leadListId);

  const where = hasFilter
    ? buildLeadWhere({
        organisationId,
        search,
        status: statusParam === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
        leadListId,
      })
    : { organisationId };

  return buildCsvResponse(where, hasFilter ? "leads-filtered-export.csv" : "leads-export.csv");
}

const selectionSchema = z.object({
  leadIds: z.array(z.string().min(1)).min(1).max(50000),
});

/**
 * Exports an explicitly chosen set of leads — the table's tick-boxes. POSTed
 * rather than passed as query parameters because a selection can run to tens
 * of thousands of IDs, well past any URL length limit. The query is still
 * scoped by organisationId, so IDs from another tenant simply don't match.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;
  const denied = await authorize(request, organisationId);
  if (denied) return denied;

  const parsed = selectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  return buildCsvResponse(
    { organisationId, id: { in: parsed.data.leadIds } },
    "leads-selection-export.csv",
  );
}
