import { z } from "zod";
import type { CanonicalColumn } from "./column-mapping";

export type MappedRow = Partial<Record<CanonicalColumn, string>>;

const optionalTrimmed = z
  .string()
  .transform((value) => value.trim())
  .optional()
  .transform((value) => (value === "" ? undefined : value));

export const mappedRowSchema = z
  .object({
    first_name: optionalTrimmed,
    last_name: optionalTrimmed,
    title: optionalTrimmed,
    company: optionalTrimmed,
    linkedin_url: optionalTrimmed,
    website_url: optionalTrimmed,
    email: z
      .string()
      .transform((value) => value.trim())
      .optional()
      .transform((value) => (value === "" ? undefined : value))
      .refine((value) => value === undefined || z.string().email().safeParse(value).success, {
        message: "Invalid email address",
      }),
    industry: optionalTrimmed,
    city: optionalTrimmed,
    state: optionalTrimmed,
    country: optionalTrimmed,
  })
  .refine(
    (row) => Boolean(row.email || row.first_name || row.last_name || row.company),
    "Row has no email, name, or company — nothing to import",
  );

export type RowValidationResult =
  { valid: true; row: MappedRow } | { valid: false; errors: string[] };

export function validateMappedRow(row: MappedRow): RowValidationResult {
  const result = mappedRowSchema.safeParse(row);
  if (result.success) {
    return { valid: true, row: result.data };
  }
  return { valid: false, errors: result.error.issues.map((issue) => issue.message) };
}
