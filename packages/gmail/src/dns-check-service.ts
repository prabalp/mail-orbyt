import type { PrismaClient } from "@mail-orbyt/database";
import { checkDomainDns } from "./dns-check";

type Prisma = Pick<PrismaClient, "domainDnsCheck">;

/** Runs (or reruns) the SPF/DKIM/DMARC check for a domain and upserts the result — one row per (organisationId, domain), so rechecking updates rather than duplicates. */
export async function runDomainDnsCheck(
  prisma: Prisma,
  organisationId: string,
  domain: string,
  dkimSelector?: string,
) {
  const result = await checkDomainDns(domain, dkimSelector);

  return prisma.domainDnsCheck.upsert({
    where: { organisationId_domain: { organisationId, domain } },
    create: {
      organisationId,
      domain,
      dkimSelector,
      spfStatus: result.spf.status,
      spfRecord: result.spf.record,
      dkimStatus: result.dkim.status,
      dkimRecord: result.dkim.record,
      dmarcStatus: result.dmarc.status,
      dmarcRecord: result.dmarc.record,
      checkedAt: new Date(),
    },
    update: {
      dkimSelector,
      spfStatus: result.spf.status,
      spfRecord: result.spf.record,
      dkimStatus: result.dkim.status,
      dkimRecord: result.dkim.record,
      dmarcStatus: result.dmarc.status,
      dmarcRecord: result.dmarc.record,
      checkedAt: new Date(),
    },
  });
}

export async function listDomainDnsChecks(prisma: Prisma, organisationId: string) {
  return prisma.domainDnsCheck.findMany({
    where: { organisationId },
    orderBy: { domain: "asc" },
  });
}
