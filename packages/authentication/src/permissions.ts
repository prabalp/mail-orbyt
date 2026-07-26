import type { OrganisationRole } from "@mail-orbyt/database";

export type Permission =
  | "billing:manage"
  | "organisation:delete"
  | "organisation:transfer_ownership"
  | "members:manage"
  | "campaigns:manage"
  | "inboxes:manage"
  | "leads:manage"
  | "research:review"
  | "conversations:review"
  | "analytics:view";

const ROLE_PERMISSIONS: Record<OrganisationRole, ReadonlySet<Permission>> = {
  OWNER: new Set([
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
  ]),
  ADMIN: new Set([
    "members:manage",
    "campaigns:manage",
    "inboxes:manage",
    "leads:manage",
    "research:review",
    "conversations:review",
    "analytics:view",
  ]),
  MEMBER: new Set(["leads:manage", "campaigns:manage", "research:review", "conversations:review"]),
  VIEWER: new Set([]),
};

/** Total ordering used only to compare role "strength" (e.g. for invitation caps); not a permission check by itself. */
export const ROLE_RANK: Record<OrganisationRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

export function hasPermission(role: OrganisationRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function canAssignRole(actingRole: OrganisationRole, targetRole: OrganisationRole): boolean {
  // Only OWNER may grant or revoke OWNER; ADMIN may manage MEMBER/VIEWER/ADMIN
  // but never itself promote someone to OWNER.
  if (targetRole === "OWNER") return actingRole === "OWNER";
  return hasPermission(actingRole, "members:manage");
}
