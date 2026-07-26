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
