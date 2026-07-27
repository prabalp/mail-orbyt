import { prisma } from "@mail-orbyt/database";
import { createResearchJob, enqueueResearchJob, listFacts } from "@mail-orbyt/research";
import { redisConnection } from "@/lib/queue";

export interface StartResearchParams {
  organisationId: string;
  subjectType: "LEAD" | "COMPANY";
  leadId?: string;
  companyId?: string;
  requestedByUserId: string;
}

export async function startResearchJob(params: StartResearchParams) {
  const job = await createResearchJob(prisma, params);
  await enqueueResearchJob(redisConnection, { researchJobId: job.id });
  return job;
}

export async function getResearchState(params: {
  organisationId: string;
  subjectType: "LEAD" | "COMPANY";
  leadId?: string;
  companyId?: string;
}) {
  const [facts, latestJob] = await Promise.all([
    listFacts(prisma, params),
    prisma.researchJob.findFirst({
      where: {
        organisationId: params.organisationId,
        leadId: params.leadId,
        companyId: params.companyId,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { facts, latestJob };
}
