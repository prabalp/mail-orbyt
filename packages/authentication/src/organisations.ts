import type { Organisation, PrismaClient } from "@mail-orbyt/database";
import { recordAuditEvent } from "./audit";

type Prisma = Pick<
  PrismaClient,
  "organisation" | "organisationMembership" | "auditEvent" | "$transaction"
>;

/** Deterministic (no AI) slug generation: lowercase, hyphenated, ASCII-only. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks (e.g. "e-with-acute-accent" -> "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function findAvailableSlug(prisma: Prisma, baseSlug: string): Promise<string> {
  const candidate = baseSlug || "organisation";
  let slug = candidate;
  let suffix = 1;
  // Bounded by realistic collision counts; a well-behaved slug space will
  // resolve on the first or second attempt.
  while (await prisma.organisation.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${candidate}-${suffix}`;
  }
  return slug;
}

export interface CreateOrganisationParams {
  name: string;
  ownerUserId: string;
}

/**
 * Creates the organisation and its OWNER membership in one transaction —
 * an organisation must never exist without an owner, and vice versa.
 */
export async function createOrganisation(
  prisma: Prisma,
  params: CreateOrganisationParams,
): Promise<Organisation> {
  const slug = await findAvailableSlug(prisma, slugify(params.name));

  const organisation = await prisma.$transaction(async (tx) => {
    const org = await tx.organisation.create({ data: { name: params.name.trim(), slug } });
    await tx.organisationMembership.create({
      data: { organisationId: org.id, userId: params.ownerUserId, role: "OWNER" },
    });
    return org;
  });

  await recordAuditEvent(prisma, {
    type: "ORGANISATION_CREATED",
    organisationId: organisation.id,
    userId: params.ownerUserId,
  });

  return organisation;
}

/**
 * Thrown when the caller's typed confirmation doesn't match — the one
 * guard this function enforces itself rather than trusting the route/tool
 * layer, since nothing about deleting an organisation is undoable and every
 * child row (leads, campaigns, conversations, inboxes, everything) goes
 * with it via the schema's cascade deletes.
 */
export class OrganisationNameMismatchError extends Error {
  constructor() {
    super("The typed name doesn't match this organisation's name.");
    this.name = "OrganisationNameMismatchError";
  }
}

export interface DeleteOrganisationParams {
  organisationId: string;
  /** Must exactly equal the organisation's current name — the human-in-the-loop check for an operation with no undo. */
  confirmName: string;
  deletedByUserId: string;
}

/**
 * Deletes an organisation and everything scoped to it. Relies entirely on
 * the schema's cascade deletes (every organisation-scoped table's FK is
 * onDelete: Cascade) rather than manually deleting each table — same
 * reasoning as packages/compliance's deleteLeadData: the one place a future
 * model could silently forget to cascade is the schema itself, not this
 * function.
 *
 * The audit event deliberately omits `organisationId` — AuditEvent's own FK
 * to Organisation is also onDelete: Cascade, so a row that pointed at the
 * organisation being deleted would be deleted along with it in the same
 * transaction, erasing the very record of the deletion. The organisation's
 * id/name/slug are captured in metadata instead, which survives.
 */
export async function deleteOrganisation(
  prisma: Pick<PrismaClient, "organisation" | "auditEvent">,
  params: DeleteOrganisationParams,
): Promise<boolean> {
  const organisation = await prisma.organisation.findUnique({
    where: { id: params.organisationId },
  });
  if (!organisation) return false;

  if (params.confirmName !== organisation.name) {
    throw new OrganisationNameMismatchError();
  }

  await prisma.organisation.delete({ where: { id: params.organisationId } });

  await recordAuditEvent(prisma, {
    type: "ORGANISATION_DELETED",
    userId: params.deletedByUserId,
    metadata: {
      organisationId: organisation.id,
      organisationName: organisation.name,
      organisationSlug: organisation.slug,
    },
  });

  return true;
}
