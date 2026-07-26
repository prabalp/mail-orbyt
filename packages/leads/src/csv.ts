import { Readable } from "node:stream";
import { parse } from "csv-parse";

export interface ParsedCsvRow {
  rowNumber: number;
  /** Raw string values keyed by the CSV's original header — no normalization applied yet. */
  values: Record<string, string>;
}

export interface ParseCsvResult {
  headers: string[];
  rows: ParsedCsvRow[];
}

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

/**
 * Parses an entire CSV buffer using a streaming parser (constant memory
 * regardless of row count — csv-parse never materializes the whole file as
 * a single string/array internally). Handles quoted commas, embedded
 * newlines, UTF-8 (including BOM), and blank lines (skipped) via the
 * underlying library rather than hand-rolled splitting.
 */
export async function parseCsv(input: Buffer | string): Promise<ParseCsvResult> {
  return new Promise((resolve, reject) => {
    const rows: ParsedCsvRow[] = [];
    let headers: string[] = [];
    let rowNumber = 0;

    const parser = parse({
      bom: true,
      skip_empty_lines: true,
      trim: false,
      relax_column_count: true,
    });

    parser.on("readable", () => {
      let record: string[] | null;
      while ((record = parser.read() as string[] | null) !== null) {
        if (headers.length === 0) {
          headers = record.map((header) => header.trim());
          continue;
        }
        rowNumber += 1;
        const values: Record<string, string> = {};
        headers.forEach((header, index) => {
          values[header] = record?.[index] ?? "";
        });
        rows.push({ rowNumber, values });
      }
    });

    parser.on("error", (error) => reject(new CsvParseError(error.message)));
    parser.on("end", () => resolve({ headers, rows }));

    Readable.from(input).pipe(parser);
  });
}
