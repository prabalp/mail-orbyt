import { ConsoleEmailSender, type EmailSender } from "@mail-orbyt/authentication";

/**
 * No real transactional email provider is configured yet — emails are
 * logged to the server console. Swap this for a real EmailSender
 * implementation (SES/Postmark/Resend/...) when one is wired up; every
 * call site depends only on the EmailSender interface.
 */
export const emailSender: EmailSender = new ConsoleEmailSender();
