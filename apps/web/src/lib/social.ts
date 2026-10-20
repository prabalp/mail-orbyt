import { randomBytes } from "node:crypto";
import { resolveOrgAiConfig } from "@mail-orbyt/ai-settings";
import { recordAuditEvent } from "@mail-orbyt/authentication";
import {
  prisma,
  type SocialAction,
  type SocialAutonomyConfig,
  type SocialConnection,
  type SocialPlatform,
  type SocialPolicyRule,
  type SocialPolicyRuleKind,
} from "@mail-orbyt/database";
import {
  buildSocialUserPrompt,
  computeCompositeConfidence,
  generateSocialContent,
  getAiSocialGenerator,
  isAiConfigured,
  validateSocialContent,
} from "@mail-orbyt/social-generation";
import {
  buildSocialAdapterConfigFromEnv,
  connectSocialAccount,
  disconnectSocialAccount,
  getAdapterForPlatform,
  isPlatformConfigured,
  listSocialConnections,
  socialRedirectUri,
  twitterOAuth,
} from "@mail-orbyt/social-platforms";
import { evaluateSocialAction, invalidateKillSwitchCache } from "@mail-orbyt/social-policy";
import { enqueueSocialPublishJob } from "@mail-orbyt/social-scheduling";
import { redisConnection } from "@/lib/queue";

export const SOCIAL_PLATFORMS = ["LINKEDIN", "TWITTER", "REDDIT", "INSTAGRAM", "THREADS"] as const;

export const SOCIAL_OAUTH_STATE_COOKIE = "socialOAuthState";
export const SOCIAL_OAUTH_ORG_COOKIE = "socialOAuthOrganisationId";
export const SOCIAL_OAUTH_PLATFORM_COOKIE = "socialOAuthPlatform";
/** X/Twitter's PKCE code_verifier, held between the redirect and the callback. */
export const SOCIAL_OAUTH_VERIFIER_COOKIE = "socialOAuthCodeVerifier";

export class SocialRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SocialRequestError";
  }
}

export function parseSocialPlatform(value: string | null | undefined): SocialPlatform | null {
  const upper = value?.toUpperCase();
  return SOCIAL_PLATFORMS.find((platform) => platform === upper) ?? null;
}

export function createSocialOAuthState(): string {
  return randomBytes(24).toString("hex");
}

// ---------------------------------------------------------------------------
// OAuth connect flow
// ---------------------------------------------------------------------------

export function buildSocialAuthorization(
  platform: SocialPlatform,
  state: string,
): { url: string; codeVerifier?: string } {
  if (!isPlatformConfigured(platform)) {
    throw new SocialRequestError(
      `${platform} is not configured on this deployment — set its OAuth client id/secret env vars first.`,
      400,
    );
  }
  const config = buildSocialAdapterConfigFromEnv();
  const redirectUri = socialRedirectUri(platform);

  if (platform === "TWITTER") {
    const codeVerifier = twitterOAuth.generateCodeVerifier();
    const url = twitterOAuth.buildAuthorizationUrl(
      config.twitter!,
      state,
      redirectUri,
      twitterOAuth.deriveCodeChallenge(codeVerifier),
    );
    return { url, codeVerifier };
  }

  return { url: getAdapterForPlatform(platform, config).buildAuthorizationUrl(state, redirectUri) };
}

export async function completeSocialOAuth(params: {
  organisationId: string;
  connectedByUserId: string;
  platform: SocialPlatform;
  code: string;
  codeVerifier?: string;
}): Promise<SocialConnection> {
  const config = buildSocialAdapterConfigFromEnv();
  const adapter = getAdapterForPlatform(params.platform, config);
  const redirectUri = socialRedirectUri(params.platform);

  let tokens;
  if (params.platform === "TWITTER") {
    if (!params.codeVerifier) {
      throw new SocialRequestError("Missing PKCE verifier — restart the X connection.", 400);
    }
    tokens = await twitterOAuth.exchangeCodeForTokens(
      config.twitter!,
      params.code,
      redirectUri,
      params.codeVerifier,
    );
  } else {
    tokens = await adapter.exchangeCodeForTokens(params.code, redirectUri);
  }

  const identity = await adapter.fetchAccountIdentity(tokens.accessToken);

  const connection = await connectSocialAccount(prisma, {
    organisationId: params.organisationId,
    platform: params.platform,
    connectedByUserId: params.connectedByUserId,
    externalAccountId: identity.externalAccountId,
    externalHandle: identity.handle,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresInSeconds: tokens.expiresInSeconds,
    scopes: tokens.scopes,
  });

  await recordAuditEvent(prisma, {
    type: "SOCIAL_CONNECTION_ADDED",
    organisationId: params.organisationId,
    userId: params.connectedByUserId,
    metadata: { connectionId: connection.id, platform: params.platform, handle: identity.handle },
  });

  return connection;
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

/** Never includes token material — encrypted or otherwise. */
export function toConnectionDto(connection: SocialConnection) {
  return {
    id: connection.id,
    platform: connection.platform,
    externalHandle: connection.externalHandle,
    externalAccountId: connection.externalAccountId,
    status: connection.status,
    scopes: connection.scopes,
    lastSyncedAt: connection.lastSyncedAt,
    createdAt: connection.createdAt,
  };
}

export async function listOrganisationSocialConnections(organisationId: string) {
  const connections = await listSocialConnections(prisma, organisationId);
  return {
    connections: connections.map(toConnectionDto),
    configuredPlatforms: SOCIAL_PLATFORMS.filter((platform) => isPlatformConfigured(platform)),
  };
}

export async function disconnectOrganisationSocialConnection(
  organisationId: string,
  connectionId: string,
  userId: string,
) {
  const updated = await disconnectSocialAccount(prisma, organisationId, connectionId);
  if (!updated) return null;
  await recordAuditEvent(prisma, {
    type: "SOCIAL_CONNECTION_REMOVED",
    organisationId,
    userId,
    metadata: { connectionId, platform: updated.platform },
  });
  return toConnectionDto(updated);
}

// ---------------------------------------------------------------------------
// Autonomy config + kill switch
// ---------------------------------------------------------------------------

function toAutonomyDto(config: SocialAutonomyConfig) {
  return {
    id: config.id,
    platform: config.platform,
    autonomyEnabled: config.autonomyEnabled,
    dryRunMode: config.dryRunMode,
    killSwitchActive: config.killSwitchActivatedAt !== null,
    killSwitchActivatedAt: config.killSwitchActivatedAt,
    maxActionsPerHour: config.maxActionsPerHour,
    maxActionsPerDay: config.maxActionsPerDay,
    requireApprovalBelowConfidence: config.requireApprovalBelowConfidence,
    updatedAt: config.updatedAt,
  };
}

export async function getSocialAutonomy(organisationId: string) {
  const configs = await prisma.socialAutonomyConfig.findMany({
    where: { organisationId },
    orderBy: { createdAt: "asc" },
  });
  return {
    configs: configs.map(toAutonomyDto),
    note:
      configs.length === 0
        ? "No autonomy config yet — the agent is fail-closed: autonomy off, dry-run on, every draft escalates to human review."
        : "A platform-specific row fully overrides the org-wide (platform: null) row for that platform.",
  };
}

/**
 * Prisma can't upsert on a compound unique that includes a NULL column (the
 * org-wide row has platform: null), so both scopes use find-then-write.
 */
async function findOrCreateAutonomyRow(organisationId: string, platform: SocialPlatform | null) {
  const existing = await prisma.socialAutonomyConfig.findFirst({
    where: { organisationId, platform },
  });
  if (existing) return existing;

  // Seed a new platform row from the org-wide row so creating it (e.g. to
  // flip one setting) doesn't silently reset every other setting to the
  // schema defaults.
  const orgWide = platform
    ? await prisma.socialAutonomyConfig.findFirst({ where: { organisationId, platform: null } })
    : null;
  return prisma.socialAutonomyConfig.create({
    data: {
      organisationId,
      platform,
      ...(orgWide
        ? {
            autonomyEnabled: orgWide.autonomyEnabled,
            dryRunMode: orgWide.dryRunMode,
            maxActionsPerHour: orgWide.maxActionsPerHour,
            maxActionsPerDay: orgWide.maxActionsPerDay,
            requireApprovalBelowConfidence: orgWide.requireApprovalBelowConfidence,
          }
        : {}),
    },
  });
}

export async function updateSocialAutonomy(
  organisationId: string,
  platform: SocialPlatform | null,
  changes: {
    autonomyEnabled?: boolean;
    dryRunMode?: boolean;
    maxActionsPerHour?: number;
    maxActionsPerDay?: number;
    requireApprovalBelowConfidence?: number;
  },
) {
  const row = await findOrCreateAutonomyRow(organisationId, platform);
  const updated = await prisma.socialAutonomyConfig.update({
    where: { id: row.id },
    data: changes,
  });
  return toAutonomyDto(updated);
}

export async function setSocialKillSwitch(
  organisationId: string,
  userId: string,
  active: boolean,
  platform: SocialPlatform | null,
) {
  const row = await findOrCreateAutonomyRow(organisationId, platform);
  const updated = await prisma.socialAutonomyConfig.update({
    where: { id: row.id },
    data: active
      ? { killSwitchActivatedAt: new Date(), killSwitchActivatedByUserId: userId }
      : { killSwitchActivatedAt: null, killSwitchActivatedByUserId: null },
  });

  // Write-through: the publish worker caches kill-switch state for a few
  // seconds, so drop the cache now rather than waiting for it to expire.
  await invalidateKillSwitchCache(redisConnection, organisationId);

  await recordAuditEvent(prisma, {
    type: active ? "SOCIAL_KILL_SWITCH_ACTIVATED" : "SOCIAL_KILL_SWITCH_DEACTIVATED",
    organisationId,
    userId,
    metadata: { platform: platform ?? "ALL" },
  });

  // Deactivating only the org-wide row does NOT clear a platform-specific
  // kill switch (either one halts that platform) — surface any that remain.
  const stillActive = await prisma.socialAutonomyConfig.findMany({
    where: { organisationId, killSwitchActivatedAt: { not: null } },
    select: { platform: true },
  });

  return {
    config: toAutonomyDto(updated),
    killSwitchStillActiveFor: stillActive.map((entry) => entry.platform ?? "ALL"),
  };
}

// ---------------------------------------------------------------------------
// Policy rules
// ---------------------------------------------------------------------------

function toRuleDto(rule: SocialPolicyRule) {
  return {
    id: rule.id,
    kind: rule.kind,
    pattern: rule.pattern,
    isRegex: rule.isRegex,
    platform: rule.platform,
    createdAt: rule.createdAt,
  };
}

export async function listSocialPolicyRules(organisationId: string) {
  const rules = await prisma.socialPolicyRule.findMany({
    where: { organisationId },
    orderBy: { createdAt: "asc" },
  });
  return { rules: rules.map(toRuleDto) };
}

export async function createSocialPolicyRule(
  organisationId: string,
  userId: string,
  input: {
    kind: SocialPolicyRuleKind;
    pattern: string;
    isRegex: boolean;
    platform: SocialPlatform | null;
  },
) {
  if (input.isRegex) {
    try {
      new RegExp(input.pattern, "i");
    } catch {
      // Rejected here because the rule engine treats an invalid regex as a
      // non-match — saving one would silently never block anything.
      throw new SocialRequestError(`Invalid regular expression: ${input.pattern}`, 400);
    }
  }
  const rule = await prisma.socialPolicyRule.create({
    data: { organisationId, createdByUserId: userId, ...input },
  });
  await recordAuditEvent(prisma, {
    type: "SOCIAL_POLICY_RULE_CHANGED",
    organisationId,
    userId,
    metadata: { change: "created", ruleId: rule.id, kind: rule.kind },
  });
  return toRuleDto(rule);
}

export async function deleteSocialPolicyRule(
  organisationId: string,
  userId: string,
  ruleId: string,
) {
  const rule = await prisma.socialPolicyRule.findUnique({ where: { id: ruleId } });
  if (!rule || rule.organisationId !== organisationId) return null;
  await prisma.socialPolicyRule.delete({ where: { id: ruleId } });
  await recordAuditEvent(prisma, {
    type: "SOCIAL_POLICY_RULE_CHANGED",
    organisationId,
    userId,
    metadata: { change: "deleted", ruleId, kind: rule.kind },
  });
  return toRuleDto(rule);
}

// ---------------------------------------------------------------------------
// Actions (the audit log) + human review
// ---------------------------------------------------------------------------

export function toActionDto(action: SocialAction, options: { includePrompt?: boolean } = {}) {
  return {
    id: action.id,
    connectionId: action.connectionId,
    platform: action.platform,
    actionType: action.actionType,
    status: action.status,
    triggerSource: action.triggerSource,
    triggerEventId: action.triggerEventId,
    generatedContent: action.generatedContent,
    generationModel: action.generationModel,
    policyConfidence: action.policyConfidence,
    policyDecision: action.policyDecision,
    policyEvaluation: action.policyEvaluation,
    reviewedByUserId: action.reviewedByUserId,
    reviewedAt: action.reviewedAt,
    reviewNotes: action.reviewNotes,
    externalPostId: action.externalPostId,
    publishedAt: action.publishedAt,
    failureReason: action.failureReason,
    createdAt: action.createdAt,
    ...(options.includePrompt ? { generationPrompt: action.generationPrompt } : {}),
  };
}

export async function listSocialActions(
  organisationId: string,
  filters: { status?: SocialAction["status"]; platform?: SocialPlatform; limit: number },
) {
  const actions = await prisma.socialAction.findMany({
    where: { organisationId, status: filters.status, platform: filters.platform },
    orderBy: { createdAt: "desc" },
    take: filters.limit,
  });
  return { actions: actions.map((action) => toActionDto(action)) };
}

export async function getSocialAction(organisationId: string, actionId: string) {
  const action = await prisma.socialAction.findUnique({
    where: { id: actionId },
    include: { triggerEvent: true },
  });
  if (!action || action.organisationId !== organisationId) return null;
  return {
    ...toActionDto(action, { includePrompt: true }),
    triggerEvent: action.triggerEvent
      ? {
          id: action.triggerEvent.id,
          eventType: action.triggerEvent.eventType,
          authorHandle: action.triggerEvent.authorHandle,
          authorIsFirstTimeContact: action.triggerEvent.authorIsFirstTimeContact,
          contentText: action.triggerEvent.contentText,
          receivedAt: action.triggerEvent.receivedAt,
        }
      : null,
  };
}

/**
 * Approval only flips the status and enqueues the job — the publish worker
 * still re-checks the kill switch and rate limit before any network call,
 * exactly as for an autonomous action. The conditional update makes a
 * double-click (or two reviewers at once) approve at most once.
 */
export async function approveSocialAction(
  organisationId: string,
  actionId: string,
  userId: string,
  notes?: string,
) {
  const result = await prisma.socialAction.updateMany({
    where: { id: actionId, organisationId, status: "PENDING_HUMAN_APPROVAL" },
    data: {
      status: "APPROVED",
      reviewedByUserId: userId,
      reviewedAt: new Date(),
      reviewNotes: notes,
    },
  });
  if (result.count === 0) return reviewConflict(organisationId, actionId);

  await enqueueSocialPublishJob(redisConnection, { socialActionId: actionId });
  return { action: await getSocialAction(organisationId, actionId), queuedForPublish: true };
}

export async function rejectSocialAction(
  organisationId: string,
  actionId: string,
  userId: string,
  notes?: string,
) {
  const result = await prisma.socialAction.updateMany({
    where: { id: actionId, organisationId, status: "PENDING_HUMAN_APPROVAL" },
    data: {
      status: "REJECTED_BY_HUMAN",
      reviewedByUserId: userId,
      reviewedAt: new Date(),
      reviewNotes: notes,
    },
  });
  if (result.count === 0) return reviewConflict(organisationId, actionId);
  return { action: await getSocialAction(organisationId, actionId) };
}

async function reviewConflict(organisationId: string, actionId: string): Promise<never> {
  const action = await prisma.socialAction.findUnique({ where: { id: actionId } });
  if (!action || action.organisationId !== organisationId) {
    throw new SocialRequestError("Social action not found", 404);
  }
  throw new SocialRequestError(
    `Only actions awaiting human approval can be reviewed; this one is ${action.status}.`,
    409,
  );
}

// ---------------------------------------------------------------------------
// Proactive posts
// ---------------------------------------------------------------------------

/**
 * Reddit posts need a subreddit + title and Instagram posts need an image,
 * neither of which a single generated text body provides — so proactive
 * posting is limited to the text-first platforms for now.
 */
const PROACTIVE_POST_PLATFORMS: ReadonlySet<SocialPlatform> = new Set([
  "LINKEDIN",
  "TWITTER",
  "THREADS",
]);

/**
 * Drafts a new post and hands it to the policy engine, which decides
 * whether it publishes (ALLOW), waits for review (ESCALATE), is simulated
 * (DRY_RUN), or is blocked (DENY). There is intentionally no path here that
 * posts without going through evaluateSocialAction.
 */
export async function draftSocialPost(
  organisationId: string,
  input: { connectionId: string; brief: string; voiceInstructions?: string },
) {
  const connection = await prisma.socialConnection.findUnique({
    where: { id: input.connectionId },
  });
  if (!connection || connection.organisationId !== organisationId) {
    throw new SocialRequestError("Social connection not found", 404);
  }
  if (connection.status !== "CONNECTED") {
    throw new SocialRequestError(`Social connection is ${connection.status}, not CONNECTED.`, 409);
  }
  if (!PROACTIVE_POST_PLATFORMS.has(connection.platform)) {
    throw new SocialRequestError(
      `Proactive posts aren't supported on ${connection.platform} yet (supported: LinkedIn, X, Threads).`,
      400,
    );
  }

  const aiConfig = await resolveOrgAiConfig(prisma, organisationId);
  if (!isAiConfigured(aiConfig)) {
    throw new SocialRequestError("No AI provider is configured for this organisation.", 409);
  }

  const generationInput = {
    platform: connection.platform,
    actionKind: "POST" as const,
    voiceInstructions: [
      `What to post about: ${input.brief}`,
      input.voiceInstructions ? `Voice: ${input.voiceInstructions}` : undefined,
    ]
      .filter(Boolean)
      .join("\n"),
  };
  const generated = await generateSocialContent(getAiSocialGenerator(aiConfig), generationInput);
  const validation = validateSocialContent(generated.content, generationInput);
  const compositeConfidence = computeCompositeConfidence(
    generated.modelSelfReportedConfidence,
    validation,
  );

  const result = await evaluateSocialAction(prisma, redisConnection, {
    organisationId,
    connectionId: connection.id,
    platform: connection.platform,
    actionType: "POST",
    content: validation.fixedContent,
    compositeConfidence,
    isFirstTimeContact: false,
    sentiment: "neutral",
    triggerSource: "manual",
    generationPrompt: buildSocialUserPrompt(generationInput),
    generationModel: aiConfig.model ?? "default",
  });

  if (result.decision === "ALLOW") {
    await enqueueSocialPublishJob(redisConnection, { socialActionId: result.actionId });
  }

  return {
    decision: result.decision,
    validationViolations: validation.violations,
    modelReasoning: generated.reasoning,
    action: await getSocialAction(organisationId, result.actionId),
  };
}
