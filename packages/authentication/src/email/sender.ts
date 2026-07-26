/**
 * Transactional email provider interface (verification, password reset,
 * invitations). Consistent with the rest of the codebase's rule that
 * external providers are injected, never called directly from route
 * handlers or React components.
 */
export interface TransactionalEmail {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(email: TransactionalEmail): Promise<void>;
}

/**
 * Development/default implementation: logs the email instead of sending it.
 * No real transactional email provider (SES, Postmark, Resend, ...) is
 * wired up yet — swap this out by implementing EmailSender and constructing
 * it wherever auth flows are assembled (see apps/web's auth wiring).
 */
export class ConsoleEmailSender implements EmailSender {
  async send(email: TransactionalEmail): Promise<void> {
    console.log(`[email:dev] to=${email.to} subject="${email.subject}"\n${email.text}`);
  }
}
