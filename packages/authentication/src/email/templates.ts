import type { TransactionalEmail } from "./sender";

export function verificationEmail(params: {
  to: string;
  appUrl: string;
  rawToken: string;
}): TransactionalEmail {
  const link = `${params.appUrl}/verify-email?token=${params.rawToken}`;
  return {
    to: params.to,
    subject: "Verify your Mail Orbyt email address",
    text: `Confirm your email address by visiting:\n${link}\n\nThis link expires in 24 hours.`,
  };
}

export function passwordResetEmail(params: {
  to: string;
  appUrl: string;
  rawToken: string;
}): TransactionalEmail {
  const link = `${params.appUrl}/reset-password?token=${params.rawToken}`;
  return {
    to: params.to,
    subject: "Reset your Mail Orbyt password",
    text: `Reset your password by visiting:\n${link}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`,
  };
}

export function invitationEmail(params: {
  to: string;
  appUrl: string;
  rawToken: string;
  organisationName: string;
  inviterName: string;
}): TransactionalEmail {
  const link = `${params.appUrl}/invitations/${params.rawToken}/accept`;
  return {
    to: params.to,
    subject: `${params.inviterName} invited you to ${params.organisationName} on Mail Orbyt`,
    text: `${params.inviterName} invited you to join "${params.organisationName}" on Mail Orbyt.\n\nAccept the invitation:\n${link}\n\nThis link expires in 7 days.`,
  };
}
