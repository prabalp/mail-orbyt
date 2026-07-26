import { z } from "zod";

/** Prisma `cuid()` identifiers used throughout the schema. */
export const cuidSchema = z.string().cuid();

export const emailSchema = z.string().trim().toLowerCase().email().max(320);

export const urlSchema = z.string().trim().url().max(2048);

export const nonEmptyString = (max = 255) => z.string().trim().min(1).max(max);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type Pagination = z.infer<typeof paginationSchema>;

/** IANA timezone identifier, e.g. "America/New_York". Validated against the runtime's tz database. */
export const timezoneSchema = z.string().refine(
  (value) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Must be a valid IANA timezone identifier" },
);
