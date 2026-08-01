// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- intentional: see comment below
/// <reference path="./next-auth.d.ts" />
// The triple-slash reference above (a TS-only compiler directive, never
// emitted by SWC/webpack) makes the next-auth Session/JWT type augmentation
// part of this package's type graph for every consumer — an unreferenced
// sibling .d.ts file is otherwise invisible to a downstream project's tsc
// run. A real `import "./next-auth.d.ts"` was tried first and broke the
// Next.js build: webpack tried to parse the ambient declaration file as a
// runtime module and failed.

export {
  buildAuthConfig,
  EmailNotVerifiedError,
  type BuildAuthConfigParams,
} from "./auth.config";
export { createRedisRateLimiter, createNoopRateLimiter, type RateLimiter } from "./rate-limiter";
export { hashPassword, verifyPassword, passwordSchema } from "./password";
export {
  generateSecureToken,
  hashToken,
  isTokenExpired,
  tokenExpiryDate,
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
  INVITATION_TOKEN_TTL_MS,
} from "./tokens";
export { UnauthenticatedError, ForbiddenError } from "./errors";
export { requireOrganisationMembership } from "./tenant";
export { recordAuditEvent, type RecordAuditEventParams } from "./audit";
export { hasPermission, canAssignRole, ROLE_RANK, type Permission } from "./permissions";
export { signUp, EmailAlreadyInUseError, type SignUpParams } from "./signup";
export { verifyEmail } from "./email-verification";
export { requestPasswordReset, completePasswordReset } from "./password-reset";
export { createOrganisation, slugify, type CreateOrganisationParams } from "./organisations";
export {
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  type CreateInvitationParams,
  type CreateInvitationResult,
  type AcceptInvitationParams,
} from "./invitations";
export {
  updateMemberRole,
  removeMember,
  type UpdateMemberRoleParams,
  type RemoveMemberParams,
} from "./members";
export type { EmailSender, TransactionalEmail } from "./email/sender";
export { ConsoleEmailSender, ResendEmailSender, ResendSendError } from "./email/sender";
export { verificationEmail, passwordResetEmail, invitationEmail } from "./email/templates";
