import bcrypt from "bcryptjs";
import { z } from "zod";

const BCRYPT_COST_FACTOR = 12;

/**
 * Minimum password policy enforced at sign-up and reset time. Kept in one
 * place so the sign-up form, reset form, and any future admin tooling can
 * share the exact same rule.
 */
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((value) => /[a-z]/.test(value), "Password must contain a lowercase letter")
  .refine((value) => /[A-Z]/.test(value), "Password must contain an uppercase letter")
  .refine((value) => /[0-9]/.test(value), "Password must contain a number");

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, BCRYPT_COST_FACTOR);
}

export async function verifyPassword(
  plainTextPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
