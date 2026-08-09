import type { Lead, LeadStatus, Prisma, PrismaClient } from "@mail-orbyt/database";
import type { Pagination } from "@mail-orbyt/validation";

type LeadsPrisma = Pick<PrismaClient, "lead">;

/** The filter half of a lead query, without pagination — what a "select all matching" action operates on. */
export interface LeadFilter {
  organisationId: string;
  search?: string;
  status?: LeadStatus;
  companyId?: string;
  leadListId?: string;
}

export interface ListLeadsParams extends LeadFilter, Pagination {}

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
        { industry: { contains: word, mode: "insensitive" as const } },
        { city: { contains: word, mode: "insensitive" as const } },
        { country: { contains: word, mode: "insensitive" as const } },
        // Searching a company name is how operators actually look for "everyone
        // at Acme", so the term is matched through the relation too.
        { company: { name: { contains: word, mode: "insensitive" as const } } },
      ],
    })),
  };
}

/**
 * The single source of truth for how a lead filter becomes a Prisma where
 * clause. Shared by listing, export, and bulk actions so "select all
 * matching" in the UI provably operates on the same set the user is looking
 * at — a second, drifting copy of this predicate is how a bulk delete ends
 * up hitting rows that were never on screen.
 */
export function buildLeadWhere(filter: LeadFilter): Prisma.LeadWhereInput {
  return {
    organisationId: filter.organisationId,
    status: filter.status ?? "ACTIVE",
    ...(filter.companyId ? { companyId: filter.companyId } : {}),
    ...(filter.leadListId
      ? { leadListMemberships: { some: { leadListId: filter.leadListId } } }
      : {}),
    ...(filter.search ? buildSearchFilter(filter.search) : {}),
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
  const where = buildLeadWhere(params);

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

/**
 * Resolves every lead ID matching a filter — the server-side half of the
 * table's "select all N matching" affordance. Returns IDs rather than full
 * rows so a 50k-lead selection stays a few megabytes of strings, and so the
 * caller (delete, export, enroll) can still apply its own per-ID logic.
 */
export async function listLeadIdsMatching(
  prisma: LeadsPrisma,
  filter: LeadFilter,
): Promise<string[]> {
  const leads = await prisma.lead.findMany({
    where: buildLeadWhere(filter),
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  return leads.map((lead) => lead.id);
}
