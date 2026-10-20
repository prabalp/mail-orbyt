import type { PrismaClient } from "@mail-orbyt/database";
import type { SocialPlatformName } from "./types";

type Prisma = Pick<PrismaClient, "socialAutonomyConfig">;

export interface EffectiveAutonomyConfig {
  autonomyEnabled: boolean;
  dryRunMode: boolean;
  maxActionsPerHour: number;
  maxActionsPerDay: number;
  requireApprovalBelowConfidence: number;
}

/**
 * Matches the Prisma column defaults on SocialAutonomyConfig — used when an
 * organisation has no config row at all for a platform, so "unconfigured"
 * fails closed (autonomy off, dry-run on) rather than silently behaving as
 * if autonomy were enabled.
 */
const SCHEMA_DEFAULTS: EffectiveAutonomyConfig = {
  autonomyEnabled: false,
  dryRunMode: true,
  maxActionsPerHour: 5,
  maxActionsPerDay: 20,
  requireApprovalBelowConfidence: 0.85,
};

function toEffectiveConfig(row: {
  autonomyEnabled: boolean;
  dryRunMode: boolean;
  maxActionsPerHour: number;
  maxActionsPerDay: number;
  requireApprovalBelowConfidence: number;
}): EffectiveAutonomyConfig {
  return {
    autonomyEnabled: row.autonomyEnabled,
    dryRunMode: row.dryRunMode,
    maxActionsPerHour: row.maxActionsPerHour,
    maxActionsPerDay: row.maxActionsPerDay,
    requireApprovalBelowConfidence: row.requireApprovalBelowConfidence,
  };
}

/**
 * A platform-specific SocialAutonomyConfig row, when present, is used in
 * full in place of the org-wide row — there is no per-field merge between
 * the two, since the columns have non-null defaults and there is no way to
 * distinguish "operator explicitly chose the default" from "operator never
 * touched this field". Creating a platform row is how an operator fully
 * overrides the org default for that one platform.
 */
export async function loadEffectiveAutonomyConfig(
  prisma: Prisma,
  organisationId: string,
  platform: SocialPlatformName,
): Promise<EffectiveAutonomyConfig> {
  // Prisma's compound-unique findUnique input doesn't accept null for a
  // nullable column in the constraint (unique-index null semantics differ
  // in Postgres), so both lookups use findFirst — the @@unique constraint
  // still guarantees at most one row per (organisationId, platform).
  const platformRow = await prisma.socialAutonomyConfig.findFirst({
    where: { organisationId, platform },
  });
  if (platformRow) return toEffectiveConfig(platformRow);

  const orgWideRow = await prisma.socialAutonomyConfig.findFirst({
    where: { organisationId, platform: null },
  });
  if (orgWideRow) return toEffectiveConfig(orgWideRow);

  return SCHEMA_DEFAULTS;
}
