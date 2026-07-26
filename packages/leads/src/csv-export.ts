import { stringify } from "csv-stringify/sync";

/**
 * Spreadsheet formula injection ("CSV injection"): a field starting with
 * =, +, -, @, tab, or CR opens as a formula in Excel/Sheets when the CSV is
 * later opened, letting a malicious lead record (e.g. a company name of
 * `=cmd|'/c calc'!A1`) execute code or exfiltrate data on whoever opens the
 * export. Prefixing such values with a single quote (as Excel/Sheets/most
 * spreadsheet apps recommend) neutralizes it while keeping the value
 * human-readable.
 */
const DANGEROUS_LEADING_CHARS = ["=", "+", "-", "@", "\t", "\r"];

export function sanitizeCsvField(value: string): string {
  if (value.length === 0) return value;
  return DANGEROUS_LEADING_CHARS.includes(value[0] as string) ? `'${value}` : value;
}

export interface CsvExportRow {
  [column: string]: string;
}

export function buildSanitizedCsv(columns: string[], rows: CsvExportRow[]): string {
  const sanitizedRows = rows.map((row) => {
    const sanitized: CsvExportRow = {};
    for (const column of columns) {
      sanitized[column] = sanitizeCsvField(row[column] ?? "");
    }
    return sanitized;
  });

  return stringify(sanitizedRows, { header: true, columns });
}
