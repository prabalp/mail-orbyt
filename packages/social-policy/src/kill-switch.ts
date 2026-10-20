import type { PrismaClient } from "@mail-orbyt/database";
import { loadEnv } from "@mail-orbyt/config";
import type { Redis } from "ioredis";
import { ALL_SOCIAL_PLATFORMS, type SocialPlatformName } from "./types";

type Prisma = Pick<PrismaClient, "socialAutonomyConfig">;

const CACHE_TTL_SECONDS = 5;

export class KillSwitchActiveError extends Error {
  constructor(
    public readonly organisationId: string,
    public readonly platform: SocialPlatformName,
  ) {
    super(
      `Social autonomy kill switch is active for organisation ${organisationId} (${platform}).`,
    );
    this.name = "KillSwitchActiveError";
  }
}

function cacheKey(organisationId: string, platform: SocialPlatformName): string {
  return `social:killswitch:${organisationId}:${platform}`;
}

/**
 * Reads BOTH the org-wide (platform: null) and platform-specific
 * SocialAutonomyConfig rows — either one having its kill switch activated
 * halts that platform. Cached in Redis for a short TTL so a hot
 * polling/publish loop doesn't hammer Postgres on every job, but always
 * re-read from Postgres on a cache miss rather than trusting a stale
 * in-process boolean. The env-level EMERGENCY_STOP flag (see
 * @mail-orbyt/config, already used by the email outbox worker) is checked
 * first as a blanket, redeploy-only stop that overrides every org.
 */
export async function isKillSwitchActive(
  prisma: Prisma,
  redis: Redis,
  organisationId: string,
  platform: SocialPlatformName,
): Promise<boolean> {
  if (loadEnv().EMERGENCY_STOP) return true;

  const key = cacheKey(organisationId, platform);
  const cached = await redis.get(key);
  if (cached !== null) return cached === "1";

  const rows = await prisma.socialAutonomyConfig.findMany({
    where: { organisationId, OR: [{ platform: null }, { platform }] },
    select: { killSwitchActivatedAt: true },
  });
  const active = rows.some((row) => row.killSwitchActivatedAt !== null);

  await redis.set(key, active ? "1" : "0", "EX", CACHE_TTL_SECONDS);
  return active;
}

/**
 * Throws KillSwitchActiveError if the kill switch is active. Call this
 * synchronously, immediately before any live network call to a platform —
 * not just once when a job is decided or enqueued — since a job can sit
 * queued (poll interval, dry-run backlog, human-approval wait) long enough
 * for the switch to flip after that point.
 */
export async function checkAndThrowIfKilled(
  prisma: Prisma,
  redis: Redis,
  organisationId: string,
  platform: SocialPlatformName,
): Promise<void> {
  if (await isKillSwitchActive(prisma, redis, organisationId, platform)) {
    throw new KillSwitchActiveError(organisationId, platform);
  }
}

/**
 * Write-through cache invalidation. Call immediately after any write to
 * SocialAutonomyConfig.killSwitchActivatedAt (activation or deactivation),
 * for both the org-wide key and every platform-specific key, so a flip is
 * visible before the TTL would otherwise expire it.
 */
export async function invalidateKillSwitchCache(
  redis: Redis,
  organisationId: string,
): Promise<void> {
  await Promise.all(
    ALL_SOCIAL_PLATFORMS.map((platform) => redis.del(cacheKey(organisationId, platform))),
  );
}
