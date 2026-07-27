import type { Lead, LeadStatus, Prisma, PrismaClient } from "@mail-orbyt/database";
import type { Pagination } from "@mail-orbyt/validation";

type LeadsPrisma = Pick<PrismaClient, "lead">;

export interface ListLeadsParams extends Pagination {
  organisationId: string;
  search?: string;
  status?: LeadStatus;
  companyId?: string;
}

export interface ListLeadsResult {
  leads: Lead[];
  totalCount: number;
}

/**
 * A search term is matched per-word (AND across words, OR across fields per
 * word) rather than as one literal substring — searching the full "First
 * Last" name a user actually sees in the UI must match a lead whose
 * firstName and lastName are two separate columns, neither of which
 * contains the combined string. A single-word search behaves exactly as a
 * plain substring search would.
 */
function buildSearchFilter(search: string): Prisma.LeadWhereInput {
  const words = search.trim().split(/\s+/).filter(Boolean);
  return {
    AND: words.map((word) => ({
      OR: [
        { firstName: { contains: word, mode: "insensitive" as const } },
        { lastName: { contains: word, mode: "insensitive" as const } },
        { email: { contains: word, mode: "insensitive" as const } },
        { title: { contains: word, mode: "insensitive" as const } },
      ],
    })),
  };
}

/**
 * All lead queries take an already-validated organisationId — the caller
 * (an API route) must have gone through
 * requireOrganisationMembership first. This function does not re-check
 * membership; it only ever scopes by the organisationId it's given.
 */
export async function listLeads(
  prisma: LeadsPrisma,
  params: ListLeadsParams,
): Promise<ListLeadsResult> {
  const where: Prisma.LeadWhereInput = {
    organisationId: params.organisationId,
    status: params.status ?? "ACTIVE",
    ...(params.companyId ? { companyId: params.companyId } : {}),
    ...(params.search ? buildSearchFilter(params.search) : {}),
  };

  const [leads, totalCount] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.lead.count({ where }),
  ]);

  return { leads, totalCount };
}

export async function getLead(
  prisma: LeadsPrisma,
  organisationId: string,
  leadId: string,
): Promise<Lead | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.organisationId !== organisationId) return null;
  return lead;
}

export async function archiveLeads(
  prisma: LeadsPrisma,
  organisationId: string,
  leadIds: string[],
): Promise<number> {
  const result = await prisma.lead.updateMany({
    where: { id: { in: leadIds }, organisationId },
    data: { status: "ARCHIVED" },
  });
  return result.count;
}

export async function unarchiveLeads(
  prisma: LeadsPrisma,
  organisationId: string,
  leadIds: string[],
): Promise<number> {
  const result = await prisma.lead.updateMany({
    where: { id: { in: leadIds }, organisationId },
    data: { status: "ACTIVE" },
  });
  return result.count;
}
