import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@mail-orbyt/database";
import { checkCname, checkVerificationTxt } from "./dns";

type Prisma = Pick<PrismaClient, "trackingDomain">;

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, "");
}

function generateVerificationToken(): string {
  return randomBytes(20).toString("hex");
}

/** Creates or replaces the organisation's tracking domain, resetting it to PENDING — any prior verification is invalidated since the domain (and therefore its DNS records) has changed. */
export async function upsertTrackingDomain(prisma: Prisma, organisationId: string, domain: string) {
  const normalized = normalizeDomain(domain);
  return prisma.trackingDomain.upsert({
    where: { organisationId },
    create: {
      organisationId,
      domain: normalized,
      verificationToken: generateVerificationToken(),
      status: "PENDING",
    },
    update: {
      domain: normalized,
      verificationToken: generateVerificationToken(),
      status: "PENDING",
      verifiedAt: null,
    },
  });
}

/** Re-runs the CNAME + TXT DNS checks for the organisation's tracking domain and updates its status accordingly. No-op (returns null) if the org hasn't set one. */
export async function verifyTrackingDomain(
  prisma: Prisma,
  organisationId: string,
  cnameTarget: string,
) {
  const existing = await prisma.trackingDomain.findUnique({ where: { organisationId } });
  if (!existing) return null;

  const [cnameStatus, txtStatus] = await Promise.all([
    checkCname(existing.domain, cnameTarget),
    checkVerificationTxt(existing.domain, existing.verificationToken),
  ]);
  const verified = cnameStatus === "PASS" && txtStatus === "PASS";
  const now = new Date();

  return prisma.trackingDomain.update({
    where: { organisationId },
    data: {
      status: verified ? "VERIFIED" : "FAILED",
      lastCheckedAt: now,
      verifiedAt: verified ? (existing.verifiedAt ?? now) : existing.verifiedAt,
    },
  });
}

/** Returns the organisation's tracking domain only when it's currently VERIFIED — the send path's single fail-open check for whether to embed a pixel at all. */
export async function getVerifiedTrackingDomain(
  prisma: Prisma,
  organisationId: string,
): Promise<string | null> {
  const record = await prisma.trackingDomain.findUnique({ where: { organisationId } });
  return record?.status === "VERIFIED" ? record.domain : null;
}

/** Used by the reverse proxy's on-demand-TLS "ask" callback: true only if some organisation has this exact domain verified. */
export async function isApprovedForTls(prisma: Prisma, domain: string): Promise<boolean> {
  const record = await prisma.trackingDomain.findUnique({
    where: { domain: normalizeDomain(domain) },
  });
  return record?.status === "VERIFIED";
}
