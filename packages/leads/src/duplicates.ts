import type { DuplicateStrategy } from "@mail-orbyt/database";
import type { MappedRow } from "./row-validation";

export type DuplicateAction =
  "CREATE" | "UPDATE_BLANKS" | "OVERWRITE" | "SKIP" | "REJECT" | "CREATE_SEPARATE";

/** Pure decision: given whether a matching lead already exists (by email, within the org) and the batch's chosen strategy, what should happen to this row. */
export function decideDuplicateAction(
  strategy: DuplicateStrategy,
  existingLeadFound: boolean,
): DuplicateAction {
  if (!existingLeadFound) return "CREATE";

  switch (strategy) {
    case "SKIP":
      return "SKIP";
    case "UPDATE_BLANKS":
      return "UPDATE_BLANKS";
    case "OVERWRITE":
      return "OVERWRITE";
    case "REJECT":
      return "REJECT";
    case "ALLOW_SEPARATE":
      return "CREATE_SEPARATE";
    default: {
      const exhaustiveCheck: never = strategy;
      throw new Error(`Unhandled duplicate strategy: ${String(exhaustiveCheck)}`);
    }
  }
}

export interface LeadScalarFields {
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  linkedinUrl?: string | null;
  websiteUrl?: string | null;
  email?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

/**
 * Translates a validated CSV row (snake_case canonical columns) into the
 * Lead model's own (camelCase) field names. `company` is intentionally
 * excluded — resolving it to a companyId is a separate lookup/creation step
 * (see import-batch.ts), not a plain scalar merge.
 */
export function mapRowToLeadFields(row: MappedRow): LeadScalarFields {
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    title: row.title,
    linkedinUrl: row.linkedin_url,
    websiteUrl: row.website_url,
    email: row.email,
    industry: row.industry,
    city: row.city,
    state: row.state,
    country: row.country,
  };
}

/** Fills only fields that are currently empty on the existing record; never overwrites an existing non-empty value. */
export function mergeUpdateBlanksOnly<T extends object>(existing: T, incoming: Partial<T>): T {
  const existingRecord = existing as Record<string, unknown>;
  const merged = { ...existingRecord };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    const currentValue = existingRecord[key];
    if (currentValue === null || currentValue === undefined || currentValue === "") {
      merged[key] = value;
    }
  }
  return merged as T;
}

/** Incoming values take precedence wherever present; existing values are kept only for fields the incoming row didn't provide. */
export function mergeOverwrite<T extends object>(existing: T, incoming: Partial<T>): T {
  const merged = { ...(existing as Record<string, unknown>) };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    merged[key] = value;
  }
  return merged as T;
}

export interface RowWithEmail {
  rowNumber: number;
  email: string | undefined;
}

/**
 * Rows sharing the same (normalized) email within a single CSV file are
 * within-batch duplicates — every occurrence after the first is flagged.
 * Rows without an email are never flagged (there's no key to compare).
 */
export function findWithinBatchDuplicates(rows: RowWithEmail[]): Set<number> {
  const seen = new Set<string>();
  const duplicates = new Set<number>();

  for (const row of rows) {
    if (!row.email) continue;
    if (seen.has(row.email)) {
      duplicates.add(row.rowNumber);
    } else {
      seen.add(row.email);
    }
  }

  return duplicates;
}
