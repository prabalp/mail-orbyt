import { ConsoleEmailSender, ResendEmailSender, type EmailSender } from "@mail-orbyt/authentication";
import { loadEnv } from "@mail-orbyt/config";

/**
 * Sends through Resend when RESEND_API_KEY is configured; otherwise falls
 * back to logging emails to the console (local dev without a key). Every
 * call site depends only on the EmailSender interface.
 */
function buildEmailSender(): EmailSender {
  const env = loadEnv();
  if (!env.RESEND_API_KEY) return new ConsoleEmailSender();
  return new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM_ADDRESS);
}

export const emailSender: EmailSender = buildEmailSender();
