import { z } from "zod";

export const IMPORTED_EMAIL_TYPES = ["INITIAL", "FOLLOW_UP", "CLOSE_THE_LOOP"] as const;
export const MAX_IMPORTED_EMAILS = 10;

export type ImportedEmailType = (typeof IMPORTED_EMAIL_TYPES)[number];

export interface ImportedEmail {
  sequence: number;
  emailType: ImportedEmailType;
  subject: string;
  body: string;
}

const importedEmailSchema = z.object({
  sequence: z.number().int().positive(),
  type: z.enum(IMPORTED_EMAIL_TYPES),
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(4000),
});

export type ParsedImportedEmails =
  { ok: true; emails: ImportedEmail[] } | { ok: false; errors: string[] };

/**
 * Parses the optional CSV pair `total_mails` + `emails`. `emails` is a JSON
 * array of { sequence, type, subject, body }. Both columns must be present
 * together, and total_mails must equal the array length.
 */
export function parseImportedEmails(
  totalMails: string | undefined,
  emailsJson: string | undefined,
): ParsedImportedEmails {
  const countText = totalMails?.trim();
  const jsonText = emailsJson?.trim();
  if (!countText && !jsonText) return { ok: true, emails: [] };
  if (!countText || !jsonText) {
    return {
      ok: false,
      errors: ["total_mails and emails must both be present when either is set"],
    };
  }

  const count = Number(countText);
  if (
    !Number.isInteger(count) ||
    String(count) !== countText ||
    count < 1 ||
    count > MAX_IMPORTED_EMAILS
  ) {
    return {
      ok: false,
      errors: [`total_mails must be a whole number from 1 to ${MAX_IMPORTED_EMAILS}`],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, errors: ["emails must be a JSON array"] };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, errors: ["emails must be a JSON array"] };
  }
  if (parsed.length !== count) {
    return {
      ok: false,
      errors: [`emails has ${parsed.length} item(s) but total_mails is ${count}`],
    };
  }

  const emails: ImportedEmail[] = [];
  const errors: string[] = [];
  parsed.forEach((item, index) => {
    const result = importedEmailSchema.safeParse(item);
    if (!result.success) {
      errors.push(
        `emails[${index}]: ${result.error.issues.map((issue) => issue.message).join(", ")}`,
      );
      return;
    }
    emails.push({
      sequence: result.data.sequence,
      emailType: result.data.type,
      subject: result.data.subject,
      body: result.data.body,
    });
  });
  if (errors.length > 0) return { ok: false, errors };

  const sequences = emails.map((email) => email.sequence).sort((a, b) => a - b);
  const expected = Array.from({ length: count }, (_, index) => index + 1);
  if (sequences.some((sequence, index) => sequence !== expected[index])) {
    return {
      ok: false,
      errors: [`email sequences must be 1 through ${count} with no duplicates`],
    };
  }

  return { ok: true, emails };
}
