import type { OrganisationRole } from "@mail-orbyt/database";
import { hasPermission, type Permission } from "@mail-orbyt/authentication";

/**
 * Every scope backed by a real permission check. Keyed as a
 * `Record<Permission, true>` so adding a Permission without listing it here
 * is a compile error — a permission missing from this list can never be
 * granted over OAuth, which silently breaks every MCP tool that requires it.
 */
const PERMISSION_SCOPES: Record<Permission, true> = {
  "billing:manage": true,
  "organisation:delete": true,
  "organisation:transfer_ownership": true,
  "members:manage": true,
  "campaigns:manage": true,
  "inboxes:manage": true,
  "leads:manage": true,
  "research:review": true,
  "conversations:review": true,
  "analytics:view": true,
  "social:manage": true,
  "social:review": true,
  "social:kill_switch": true,
};
const ALL_PERMISSION_SCOPES = Object.keys(PERMISSION_SCOPES) as Permission[];

export const PROFILE_SCOPE = "profile";

/**
 * OAuth-only read scope (not a Permission): read-only access to leads, used
 * by lead_orbyt's tool gating. Every org member holds it; `leads:manage`
 * implies it (see scopeIncludes).
 */
export const LEADS_READ_SCOPE = "leads:read";

/** Every scope the authorization server can ever grant — used to advertise `scopes_supported` in the OAuth metadata document. */
export const ALL_SCOPES: string[] = [PROFILE_SCOPE, LEADS_READ_SCOPE, ...ALL_PERMISSION_SCOPES];

export function parseScope(scope: string): string[] {
  return scope.split(" ").filter(Boolean);
}

/** The full set of scopes a given role is entitled to grant, regardless of what a client requests. */
export function scopesGrantedByRole(role: OrganisationRole): string[] {
  const granted = ALL_PERMISSION_SCOPES.filter((permission) => hasPermission(role, permission));
  return [PROFILE_SCOPE, LEADS_READ_SCOPE, ...granted];
}

/** Intersects requested scopes against what the role actually grants — never returns a scope the user doesn't hold. */
export function intersectScopes(requestedScope: string, role: OrganisationRole): string {
  const granted = new Set(scopesGrantedByRole(role));
  return parseScope(requestedScope)
    .filter((scope) => granted.has(scope))
    .join(" ");
}

export function scopeIncludes(
  scope: string,
  required: Permission | typeof PROFILE_SCOPE | typeof LEADS_READ_SCOPE,
): boolean {
  const held = parseScope(scope);
  if (required === LEADS_READ_SCOPE && held.includes("leads:manage")) return true;
  return held.includes(required);
}
