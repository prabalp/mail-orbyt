import { randomBytes } from "node:crypto";
import { InMemoryObjectStorage } from "@mail-orbyt/storage";
import { previewImport, processImportBatch } from "@mail-orbyt/leads";
import { prisma } from "@mail-orbyt/database";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Runs against the real Postgres from docker-compose (not mocked) — this is
 * exactly the kind of DB-transaction-heavy orchestration logic (upserts,
 * idempotent retries, duplicate-strategy branching) that's easy to get
 * subtly wrong against a mock and have it look fine.
 */

function uniqueSlug(): string {
  return `test-org-${randomBytes(6).toString("hex")}`;
}

async function createTestOrganisation() {
  return prisma.organisation.create({ data: { name: "Import Test Org", slug: uniqueSlug() } });
}

async function createTestUser(email: string) {
  return prisma.user.create({ data: { email, name: "Test User" } });
}

describe("CSV lead import (end to end against real Postgres)", () => {
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    for (const organisationId of createdOrgIds) {
      await prisma.importRow.deleteMany({ where: { importBatch: { organisationId } } });
      await prisma.importBatch.deleteMany({ where: { organisationId } });
      await prisma.lead.deleteMany({ where: { organisationId } });
      await prisma.company.deleteMany({ where: { organisationId } });
      await prisma.organisation.delete({ where: { id: organisationId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("previewImport suggests a mapping and validates rows without writing anything", async () => {
    const csv = "First Name,Email\nJane,jane@example.com\nInvalid,not-an-email\n";
    const preview = await previewImport(Buffer.from(csv));

    expect(preview.suggestedMapping.first_name).toBe("First Name");
    expect(preview.suggestedMapping.email).toBe("Email");
    expect(preview.totalRowCount).toBe(2);
    expect(preview.previewRows[1]?.errors.join(" ")).toMatch(/Invalid email/);
  });

  it("imports new leads, creates companies, and is idempotent on reprocessing", async () => {
    const org = await createTestOrganisation();
    createdOrgIds.push(org.id);
    const user = await createTestUser(`owner-${uniqueSlug()}@example.com`);

    const csv = [
      "first_name,last_name,email,company,website_url",
      "Jane,Doe,jane@example.com,Acme Inc,https://acme.example.com",
      "John,Smith,john@example.com,Acme Inc,https://acme.example.com",
    ].join("\n");

    const storage = new InMemoryObjectStorage();
    await storage.putObject({ key: "test-batch.csv", body: csv });

    const batch = await prisma.importBatch.create({
      data: {
        organisationId: org.id,
        createdByUserId: user.id,
        fileName: "leads.csv",
        storageKey: "test-batch.csv",
        columnMapping: {
          first_name: "first_name",
          last_name: "last_name",
          email: "email",
          company: "company",
          website_url: "website_url",
          title: null,
          linkedin_url: null,
          industry: null,
          city: null,
          state: null,
          country: null,
        },
        duplicateStrategy: "SKIP",
      },
    });

    await processImportBatch(prisma, storage, batch.id);

    const leads = await prisma.lead.findMany({
      where: { organisationId: org.id },
      orderBy: { email: "asc" },
    });
    expect(leads).toHaveLength(2);
    expect(leads[0]?.email).toBe("jane@example.com");
    expect(leads[0]?.firstName).toBe("Jane");

    const companies = await prisma.company.findMany({ where: { organisationId: org.id } });
    expect(companies).toHaveLength(1);
    expect(companies[0]?.domain).toBe("acme.example.com");
    expect(leads.every((lead) => lead.companyId === companies[0]?.id)).toBe(true);

    const finishedBatch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(finishedBatch.status).toBe("COMPLETED");
    expect(finishedBatch.importedCount).toBe(2);

    // --- Idempotency: reprocessing the same (already-completed) batch must not duplicate leads ---
    await processImportBatch(prisma, storage, batch.id);
    const leadsAfterRerun = await prisma.lead.findMany({ where: { organisationId: org.id } });
    expect(leadsAfterRerun).toHaveLength(2);
  });

  it("applies the SKIP duplicate strategy against an existing lead", async () => {
    const org = await createTestOrganisation();
    createdOrgIds.push(org.id);
    const user = await createTestUser(`owner-${uniqueSlug()}@example.com`);

    await prisma.lead.create({
      data: { organisationId: org.id, email: "jane@example.com", firstName: "OriginalJane" },
    });

    const csv = "first_name,email\nUpdatedJane,jane@example.com\n";
    const storage = new InMemoryObjectStorage();
    await storage.putObject({ key: "skip-batch.csv", body: csv });

    const batch = await prisma.importBatch.create({
      data: {
        organisationId: org.id,
        createdByUserId: user.id,
        fileName: "leads.csv",
        storageKey: "skip-batch.csv",
        columnMapping: {
          first_name: "first_name",
          email: "email",
          last_name: null,
          company: null,
          website_url: null,
          title: null,
          linkedin_url: null,
          industry: null,
          city: null,
          state: null,
          country: null,
        },
        duplicateStrategy: "SKIP",
      },
    });

    await processImportBatch(prisma, storage, batch.id);

    const lead = await prisma.lead.findUniqueOrThrow({
      where: { organisationId_email: { organisationId: org.id, email: "jane@example.com" } },
    });
    expect(lead.firstName).toBe("OriginalJane");

    const finishedBatch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(finishedBatch.skippedCount).toBe(1);
    expect(finishedBatch.importedCount).toBe(0);
  });

  it("applies the OVERWRITE duplicate strategy against an existing lead", async () => {
    const org = await createTestOrganisation();
    createdOrgIds.push(org.id);
    const user = await createTestUser(`owner-${uniqueSlug()}@example.com`);

    await prisma.lead.create({
      data: {
        organisationId: org.id,
        email: "jane@example.com",
        firstName: "OriginalJane",
        title: "Old Title",
      },
    });

    const csv = "first_name,email\nUpdatedJane,jane@example.com\n";
    const storage = new InMemoryObjectStorage();
    await storage.putObject({ key: "overwrite-batch.csv", body: csv });

    const batch = await prisma.importBatch.create({
      data: {
        organisationId: org.id,
        createdByUserId: user.id,
        fileName: "leads.csv",
        storageKey: "overwrite-batch.csv",
        columnMapping: {
          first_name: "first_name",
          email: "email",
          last_name: null,
          company: null,
          website_url: null,
          title: null,
          linkedin_url: null,
          industry: null,
          city: null,
          state: null,
          country: null,
        },
        duplicateStrategy: "OVERWRITE",
      },
    });

    await processImportBatch(prisma, storage, batch.id);

    const lead = await prisma.lead.findUniqueOrThrow({
      where: { organisationId_email: { organisationId: org.id, email: "jane@example.com" } },
    });
    expect(lead.firstName).toBe("Updatedjane");
    // title wasn't in the incoming row, so OVERWRITE must leave it alone.
    expect(lead.title).toBe("Old Title");
  });

  it("skips within-file duplicate emails (same email twice in one CSV)", async () => {
    const org = await createTestOrganisation();
    createdOrgIds.push(org.id);
    const user = await createTestUser(`owner-${uniqueSlug()}@example.com`);

    const csv = ["first_name,email", "Jane,jane@example.com", "Jane Again,jane@example.com"].join(
      "\n",
    );
    const storage = new InMemoryObjectStorage();
    await storage.putObject({ key: "within-batch-dup.csv", body: csv });

    const batch = await prisma.importBatch.create({
      data: {
        organisationId: org.id,
        createdByUserId: user.id,
        fileName: "leads.csv",
        storageKey: "within-batch-dup.csv",
        columnMapping: {
          first_name: "first_name",
          email: "email",
          last_name: null,
          company: null,
          website_url: null,
          title: null,
          linkedin_url: null,
          industry: null,
          city: null,
          state: null,
          country: null,
        },
        duplicateStrategy: "SKIP",
      },
    });

    await processImportBatch(prisma, storage, batch.id);

    const leads = await prisma.lead.findMany({ where: { organisationId: org.id } });
    expect(leads).toHaveLength(1);

    const finishedBatch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(finishedBatch.importedCount).toBe(1);
    expect(finishedBatch.skippedCount).toBe(1);
  });

  it("records row-level errors for invalid rows without failing the whole batch", async () => {
    const org = await createTestOrganisation();
    createdOrgIds.push(org.id);
    const user = await createTestUser(`owner-${uniqueSlug()}@example.com`);

    const csv = ["first_name,email", "Jane,jane@example.com", "Bad,not-an-email"].join("\n");
    const storage = new InMemoryObjectStorage();
    await storage.putObject({ key: "bad-row.csv", body: csv });

    const batch = await prisma.importBatch.create({
      data: {
        organisationId: org.id,
        createdByUserId: user.id,
        fileName: "leads.csv",
        storageKey: "bad-row.csv",
        columnMapping: {
          first_name: "first_name",
          email: "email",
          last_name: null,
          company: null,
          website_url: null,
          title: null,
          linkedin_url: null,
          industry: null,
          city: null,
          state: null,
          country: null,
        },
        duplicateStrategy: "SKIP",
      },
    });

    await processImportBatch(prisma, storage, batch.id);

    const finishedBatch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(finishedBatch.importedCount).toBe(1);
    expect(finishedBatch.errorCount).toBe(1);

    const errorRow = await prisma.importRow.findFirstOrThrow({
      where: { importBatchId: batch.id, status: "ERROR" },
    });
    expect(errorRow.errorMessage).toMatch(/Invalid email/);
  });
});
