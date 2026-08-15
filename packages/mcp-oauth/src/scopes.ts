import type { OrganisationRole } from "@mail-orbyt/database";
import { hasPermission, type Permission } from "@mail-orbyt/authentication";

/** Every scope backed by a real permission check, plus the bare "profile" scope for membership-only routes (no specific permission required). */
const ALL_PERMISSION_SCOPES: Permission[] = [
  "billing:manage",
  "organisation:delete",
  "organisation:transfer_ownership",
  "members:manage",
  "campaigns:manage",
  "inboxes:manage",
  "leads:manage",
  "research:review",
  "conversations:review",
  "analytics:view",
];

export const PROFILE_SCOPE = "profile";

/** Every scope the authorization server can ever grant — used to advertise `scopes_supported` in the OAuth metadata document. */
export const ALL_SCOPES: string[] = [PROFILE_SCOPE, ...ALL_PERMISSION_SCOPES];

export function parseScope(scope: string): string[] {
  return scope.split(" ").filter(Boolean);
}

/** The full set of scopes a given role is entitled to grant, regardless of what a client requests. */
export function scopesGrantedByRole(role: OrganisationRole): string[] {
  const granted = ALL_PERMISSION_SCOPES.filter((permission) => hasPermission(role, permission));
  return [PROFILE_SCOPE, ...granted];
}

/** Intersects requested scopes against what the role actually grants — never returns a scope the user doesn't hold. */
export function intersectScopes(requestedScope: string, role: OrganisationRole): string {
  const granted = new Set(scopesGrantedByRole(role));
  return parseScope(requestedScope)
    .filter((scope) => granted.has(scope))
    .join(" ");
}

export function scopeIncludes(scope: string, required: Permission | typeof PROFILE_SCOPE): boolean {
  return parseScope(scope).includes(required);
}
