import type { PrismaClient } from "@mail-orbyt/database";
import type { ObjectStorage } from "@mail-orbyt/storage";
import { applyColumnMapping, suggestColumnMapping, type CanonicalColumn } from "./column-mapping";
import { parseCsv } from "./csv";
import {
  decideDuplicateAction,
  findWithinBatchDuplicates,
  mapRowToLeadFields,
  mergeOverwrite,
  mergeUpdateBlanksOnly,
  type LeadScalarFields,
} from "./duplicates";
import {
  extractDomain,
  normalizeCountry,
  normalizeEmail,
  normalizeJobTitle,
  normalizeName,
  normalizeState,
  normalizeUrl,
  normalizeWhitespace,
} from "./normalize";
import { validateMappedRow, type MappedRow } from "./row-validation";

const PREVIEW_ROW_COUNT = 20;

export interface ImportPreview {
  headers: string[];
  suggestedMapping: Record<CanonicalColumn, string | null>;
  totalRowCount: number;
  previewRows: { rowNumber: number; row: MappedRow; errors: string[] }[];
}

/**
 * Parses a CSV and produces a preview WITHOUT writing anything to the
 * database — used by the import wizard's mapping/validation step before the
 * user confirms and a background job actually runs.
 */
export async function previewImport(
  csvBuffer: Buffer,
  columnMapping?: Record<CanonicalColumn, string | null>,
): Promise<ImportPreview> {
  const parsed = await parseCsv(csvBuffer);
  const mapping = columnMapping ?? suggestColumnMapping(parsed.headers);

  const previewRows = parsed.rows.slice(0, PREVIEW_ROW_COUNT).map(({ rowNumber, values }) => {
    const mappedRow = applyColumnMapping(values, mapping);
    const result = validateMappedRow(mappedRow);
    return {
      rowNumber,
      row: result.valid ? result.row : mappedRow,
      errors: result.valid ? [] : result.errors,
    };
  });

  return {
    headers: parsed.headers,
    suggestedMapping: mapping,
    totalRowCount: parsed.rows.length,
    previewRows,
  };
}

function normalizeRow(row: MappedRow): MappedRow {
  return {
    first_name: row.first_name ? normalizeName(row.first_name) : undefined,
    last_name: row.last_name ? normalizeName(row.last_name) : undefined,
    title: row.title ? normalizeJobTitle(row.title) : undefined,
    company: row.company ? normalizeWhitespace(row.company) : undefined,
    linkedin_url: row.linkedin_url ? normalizeUrl(row.linkedin_url) : undefined,
    website_url: row.website_url ? normalizeUrl(row.website_url) : undefined,
    email: row.email ? normalizeEmail(row.email) : undefined,
    industry: row.industry ? normalizeWhitespace(row.industry) : undefined,
    city: row.city ? normalizeWhitespace(row.city) : undefined,
    state: row.state ? normalizeState(row.state) : undefined,
    country: row.country ? normalizeCountry(row.country) : undefined,
    total_mails: row.total_mails?.trim() || undefined,
    emails: row.emails?.trim() || undefined,
  };
}

type Prisma = Pick<
  PrismaClient,
  | "importBatch"
  | "importRow"
  | "lead"
  | "company"
  | "leadListMembership"
  | "leadImportedEmail"
  | "$transaction"
>;

async function resolveCompanyId(
  prisma: Prisma,
  organisationId: string,
  companyName: string | undefined,
  websiteUrl: string | undefined,
): Promise<string | undefined> {
  if (!companyName) return undefined;
  const domain = websiteUrl ? extractDomain(websiteUrl) : null;

  if (domain) {
    const existing = await prisma.company.findUnique({
      where: { organisationId_domain: { organisationId, domain } },
    });
    if (existing) return existing.id;
  }

  const created = await prisma.company.create({
    data: { organisationId, name: companyName, domain, websiteUrl },
  });
  return created.id;
}

/**
 * The actual import job body — safe to run more than once for the same
 * batch (queue redelivery, worker crash mid-run). Each CSV row is
 * checkpointed via its ImportRow: a row already in a terminal status (or
 * already linked to a lead) is skipped on retry rather than reprocessed,
 * so a partial rerun can never create duplicate leads.
 */
export async function processImportBatch(
  prisma: Prisma,
  storage: ObjectStorage,
  importBatchId: string,
): Promise<void> {
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: importBatchId } });

  if (batch.status === "COMPLETED") return; // already done — idempotent no-op

  await prisma.importBatch.update({ where: { id: importBatchId }, data: { status: "PROCESSING" } });

  const csvBuffer = await storage.getObject(batch.storageKey);
  const parsed = await parseCsv(csvBuffer);
  const mapping = batch.columnMapping as Record<CanonicalColumn, string | null>;

  const mappedRows = parsed.rows.map(({ rowNumber, values }) => ({
    rowNumber,
    mapped: normalizeRow(applyColumnMapping(values, mapping)),
  }));
  const withinBatchDuplicates = findWithinBatchDuplicates(
    mappedRows.map(({ rowNumber, mapped }) => ({ rowNumber, email: mapped.email })),
  );

  let importedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const { rowNumber, mapped } of mappedRows) {
    const existingRow = await prisma.importRow.findUnique({
      where: { importBatchId_rowNumber: { importBatchId, rowNumber } },
    });
    if (existingRow && existingRow.status !== "PENDING") {
      // Already processed in a prior run of this batch — count it and move on.
      if (existingRow.status === "IMPORTED" || existingRow.status === "UPDATED") importedCount += 1;
      else if (existingRow.status === "SKIPPED") skippedCount += 1;
      else errorCount += 1;
      continue;
    }

    const validation = validateMappedRow(mapped);
    if (!validation.valid) {
      await prisma.importRow.upsert({
        where: { importBatchId_rowNumber: { importBatchId, rowNumber } },
        create: {
          importBatchId,
          rowNumber,
          rawData: mapped,
          status: "ERROR",
          errorMessage: validation.errors.join("; "),
        },
        update: { status: "ERROR", errorMessage: validation.errors.join("; ") },
      });
      errorCount += 1;
      continue;
    }

    if (withinBatchDuplicates.has(rowNumber) && batch.duplicateStrategy !== "ALLOW_SEPARATE") {
      await prisma.importRow.upsert({
        where: { importBatchId_rowNumber: { importBatchId, rowNumber } },
        create: {
          importBatchId,
          rowNumber,
          rawData: mapped,
          status: "SKIPPED",
          errorMessage: "Duplicate email within this file",
        },
        update: { status: "SKIPPED", errorMessage: "Duplicate email within this file" },
      });
      skippedCount += 1;
      continue;
    }

    const existingLead = validation.row.email
      ? await prisma.lead.findUnique({
          where: {
            organisationId_email: {
              organisationId: batch.organisationId,
              email: validation.row.email,
            },
          },
        })
      : null;

    const action = decideDuplicateAction(batch.duplicateStrategy, existingLead !== null);
    const companyId = await resolveCompanyId(
      prisma,
      batch.organisationId,
      validation.row.company,
      validation.row.website_url,
    );
    const leadFields = mapRowToLeadFields(validation.row);

    if (action === "SKIP" || action === "REJECT") {
      await prisma.importRow.upsert({
        where: { importBatchId_rowNumber: { importBatchId, rowNumber } },
        create: {
          importBatchId,
          rowNumber,
          rawData: mapped,
          status: "SKIPPED",
          errorMessage: `Duplicate lead (${action.toLowerCase()} strategy)`,
        },
        update: { status: "SKIPPED" },
      });
      skippedCount += 1;
      continue;
    }

    let leadId: string;
    let rowStatus: "IMPORTED" | "UPDATED";

    if (action === "CREATE" || action === "CREATE_SEPARATE") {
      const created = await prisma.lead.create({
        data: { organisationId: batch.organisationId, companyId, ...leadFields },
      });
      leadId = created.id;
      rowStatus = "IMPORTED";
    } else {
      // UPDATE_BLANKS/OVERWRITE only arise from decideDuplicateAction when
      // existingLeadFound was true, but we still check at runtime rather
      // than asserting it, since that invariant lives in another module.
      if (!existingLead) {
        throw new Error(`Expected an existing lead for row ${rowNumber} (action: ${action})`);
      }
      // Only merge the lead's own scalar fields — existingLead is the full
      // Prisma row (id, timestamps, companyId, fieldSources JSON, ...) and
      // must not be spread wholesale into an update payload.
      const existingScalars: LeadScalarFields = {
        firstName: existingLead.firstName,
        lastName: existingLead.lastName,
        title: existingLead.title,
        linkedinUrl: existingLead.linkedinUrl,
        websiteUrl: existingLead.websiteUrl,
        email: existingLead.email,
        industry: existingLead.industry,
        city: existingLead.city,
        state: existingLead.state,
        country: existingLead.country,
      };
      const merged =
        action === "UPDATE_BLANKS"
          ? mergeUpdateBlanksOnly(existingScalars, leadFields)
          : mergeOverwrite(existingScalars, leadFields);
      const updated = await prisma.lead.update({
        where: { id: existingLead.id },
        data: { ...merged, companyId: companyId ?? existingLead.companyId },
      });
      leadId = updated.id;
      rowStatus = "UPDATED";
    }

    // Every import names its audience, so the lead joins that list whether it
    // was created or matched an existing record — an operator re-importing an
    // updated CSV expects the whole file to be selectable as one list, not
    // just the rows that happened to be new. skipDuplicates makes this safe
    // on a batch retry.
    if (batch.leadListId) {
      await prisma.leadListMembership.createMany({
        data: [{ leadListId: batch.leadListId, leadId }],
        skipDuplicates: true,
      });
    }

    if (validation.importedEmails.length > 0) {
      const replace = action === "CREATE" || action === "CREATE_SEPARATE" || action === "OVERWRITE";
      const fillBlanks = action === "UPDATE_BLANKS";
      if (replace || fillBlanks) {
        const existingCount = fillBlanks
          ? await prisma.leadImportedEmail.count({ where: { leadId } })
          : 0;
        if (replace || existingCount === 0) {
          await prisma.$transaction([
            prisma.leadImportedEmail.deleteMany({ where: { leadId } }),
            prisma.leadImportedEmail.createMany({
              data: validation.importedEmails.map((email) => ({
                organisationId: batch.organisationId,
                leadId,
                sequence: email.sequence,
                emailType: email.emailType,
                subject: email.subject,
                body: email.body,
              })),
            }),
          ]);
        }
      }
    }

    await prisma.importRow.upsert({
      where: { importBatchId_rowNumber: { importBatchId, rowNumber } },
      create: { importBatchId, rowNumber, rawData: mapped, status: rowStatus, leadId },
      update: { status: rowStatus, leadId },
    });
    importedCount += 1;
  }

  await prisma.importBatch.update({
    where: { id: importBatchId },
    data: {
      status: "COMPLETED",
      totalRows: parsed.rows.length,
      importedCount,
      skippedCount,
      errorCount,
    },
  });
}
