import { Resend } from "resend";

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
 * Used when RESEND_API_KEY is unset (see apps/web's email wiring).
 */
export class ConsoleEmailSender implements EmailSender {
  async send(email: TransactionalEmail): Promise<void> {
    console.log(`[email:dev] to=${email.to} subject="${email.subject}"\n${email.text}`);
  }
}

function resendErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) {
    return String((cause as { message: unknown }).message);
  }
  return String(cause);
}

export class ResendSendError extends Error {
  constructor(cause: unknown) {
    super(`Resend request failed: ${resendErrorMessage(cause)}`);
    this.name = "ResendSendError";
  }
}

export class ResendEmailSender implements EmailSender {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(email: TransactionalEmail): Promise<void> {
    const result = await this.client.emails.send({
      from: this.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
    });
    if (result.error) throw new ResendSendError(result.error);
  }
}
