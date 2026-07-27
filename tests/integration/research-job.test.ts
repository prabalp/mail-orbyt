import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { prisma } from "@mail-orbyt/database";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

/**
 * Runs the full research pipeline (fetch -> extract JSON-LD/OG -> map to
 * facts -> persist) against a real Postgres and a real local HTTP server
 * serving realistic HTML.
 *
 * The SSRF guard is mocked to a pass-through here ONLY because this test
 * server necessarily binds to 127.0.0.1 (loopback), which the guard
 * correctly — and unconditionally — blocks in production. Real SSRF
 * behavior (private ranges, cloud metadata IP, DNS-rebinding-style resolved
 * addresses, protocol restrictions) is exhaustively covered by
 * packages/research/src/ssrf-guard.test.ts, and website-fetcher.test.ts
 * covers real-HTTP redirect/size-limit behavior with this same mock — this
 * file's job is to prove the DB + extraction + persistence pipeline around
 * the fetch, not to re-prove the guard.
 */
vi.mock("../../packages/research/src/ssrf-guard", () => ({
  assertSafeUrl: vi.fn(async (url: string) => new URL(url)),
  UnsafeUrlError: class UnsafeUrlError extends Error {},
}));

const {
  NotConfiguredEnrichmentProvider,
  NotConfiguredNewsProvider,
  NotConfiguredSearchProvider,
  createResearchJob,
  processResearchJob,
} = await import("@mail-orbyt/research");

const providers = {
  search: new NotConfiguredSearchProvider(),
  news: new NotConfiguredNewsProvider(),
  enrichment: new NotConfiguredEnrichmentProvider(),
};

let server: Server;
const createdOrgIds: string[] = [];

function uniqueSlug(): string {
  return `research-test-org-${randomBytes(6).toString("hex")}`;
}

function startServer(html: string): Promise<string> {
  return new Promise((resolve) => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterAll(async () => {
  for (const organisationId of createdOrgIds) {
    await prisma.researchFact.deleteMany({ where: { organisationId } });
    await prisma.researchDocument.deleteMany({
      where: { source: { providerRun: { researchJob: { organisationId } } } },
    });
    await prisma.researchSource.deleteMany({
      where: { providerRun: { researchJob: { organisationId } } },
    });
    await prisma.researchProviderRun.deleteMany({ where: { researchJob: { organisationId } } });
    await prisma.researchJob.deleteMany({ where: { organisationId } });
    await prisma.company.deleteMany({ where: { organisationId } });
    await prisma.organisation.delete({ where: { id: organisationId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe("research job (end to end against real Postgres and a real HTTP server)", () => {
  it("fetches a company's website, extracts JSON-LD, and stores facts with source/evidence", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Research Test Org", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@type":"Organization","description":"Acme builds developer tools for platform teams.","award":"Best Places to Work 2025"}
        </script>
        <meta property="og:description" content="fallback description, should not be used since JSON-LD matched" />
        <title>Acme Inc</title>
      </head><body>Acme homepage</body></html>
    `;
    const baseUrl = await startServer(html);

    const company = await prisma.company.create({
      data: { organisationId: org.id, name: "Acme Inc", websiteUrl: baseUrl },
    });

    const job = await createResearchJob(prisma, {
      organisationId: org.id,
      subjectType: "COMPANY",
      companyId: company.id,
    });

    await processResearchJob(prisma, providers, job.id);

    const finishedJob = await prisma.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finishedJob.status).toBe("COMPLETED");

    const websiteRun = await prisma.researchProviderRun.findFirstOrThrow({
      where: { researchJobId: job.id, provider: "WEBSITE" },
    });
    expect(websiteRun.status).toBe("SUCCEEDED");

    const searchRun = await prisma.researchProviderRun.findFirstOrThrow({
      where: { researchJobId: job.id, provider: "SEARCH" },
    });
    expect(searchRun.status).toBe("SKIPPED_NOT_CONFIGURED");

    const facts = await prisma.researchFact.findMany({ where: { companyId: company.id } });
    expect(facts).toContainEqual(
      expect.objectContaining({
        category: "company_description",
        value: "Acme builds developer tools for platform teams.",
        extractionMethod: "JSON_LD",
        status: "OBSERVED",
        sourceUrl: `${baseUrl}/`,
      }),
    );
    expect(facts).toContainEqual(
      expect.objectContaining({ category: "awards", value: "Best Places to Work 2025" }),
    );

    // JSON-LD matched, so the Open Graph fallback description must NOT
    // have been stored as a separate/duplicate fact.
    expect(facts.some((f) => f.value.startsWith("fallback description"))).toBe(false);
  });

  it("is idempotent: rerunning a completed job does not duplicate facts", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Research Test Org 2", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const html = `<script type="application/ld+json">{"@type":"Organization","description":"Acme builds developer tools."}</script>`;
    const baseUrl = await startServer(html);

    const company = await prisma.company.create({
      data: { organisationId: org.id, name: "Acme Inc", websiteUrl: baseUrl },
    });
    const job = await createResearchJob(prisma, {
      organisationId: org.id,
      subjectType: "COMPANY",
      companyId: company.id,
    });

    await processResearchJob(prisma, providers, job.id);
    await processResearchJob(prisma, providers, job.id); // rerun the same (now-completed) job

    const facts = await prisma.researchFact.findMany({ where: { companyId: company.id } });
    expect(facts).toHaveLength(1);
  });

  it("records a FAILED website provider run when the subject has no website URL", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Research Test Org 3", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const company = await prisma.company.create({
      data: { organisationId: org.id, name: "No Website Inc" },
    });
    const job = await createResearchJob(prisma, {
      organisationId: org.id,
      subjectType: "COMPANY",
      companyId: company.id,
    });

    await processResearchJob(prisma, providers, job.id);

    const websiteRun = await prisma.researchProviderRun.findFirstOrThrow({
      where: { researchJobId: job.id, provider: "WEBSITE" },
    });
    expect(websiteRun.status).toBe("FAILED");
    expect(websiteRun.errorMessage).toMatch(/no website url/i);

    const finishedJob = await prisma.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finishedJob.status).toBe("COMPLETED"); // one provider failing doesn't fail the whole job
  });
});
