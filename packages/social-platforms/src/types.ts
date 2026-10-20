/**
 * Shared shapes for every social platform adapter (LinkedIn, X/Twitter,
 * Reddit, Instagram, Threads). Each platform implements
 * `SocialPlatformAdapter` by composing its own oauth.ts (authorization URL +
 * token exchange/refresh) and client.ts (identity + posting/reply/poll REST
 * calls) — see index.ts's `getAdapterForPlatform` for the assembly.
 */

export interface PlatformTokens {
  accessToken: string;
  refreshToken?: string;
  /** Absent means the token is non-expiring or long-lived without a known TTL (e.g. some Meta tokens). */
  expiresInSeconds?: number;
  scopes: string[];
}

export interface PlatformAccountIdentity {
  /** The platform's stable user/page id — not the handle, which can change. */
  externalAccountId: string;
  handle: string;
}

export interface RawInboundEvent {
  externalEventId: string;
  externalThreadId?: string;
  eventType: "MENTION" | "COMMENT" | "DM" | "KEYWORD_MATCH";
  authorHandle: string;
  contentText: string;
  rawPayload: unknown;
  occurredAt: Date;
}

export interface PublishResult {
  externalPostId: string;
}

export type SocialPlatformName = "LINKEDIN" | "TWITTER" | "REDDIT" | "INSTAGRAM" | "THREADS";

export interface SocialPlatformAdapter {
  platform: SocialPlatformName;
  supportsWebhook: boolean;
  buildAuthorizationUrl(state: string, redirectUri: string): string;
  exchangeCodeForTokens(code: string, redirectUri: string): Promise<PlatformTokens>;
  refreshAccessToken?(refreshToken: string): Promise<PlatformTokens>;
  fetchAccountIdentity(accessToken: string): Promise<PlatformAccountIdentity>;
  publishPost(accessToken: string, content: string): Promise<PublishResult>;
  publishReply(accessToken: string, threadOrCommentId: string, content: string): Promise<PublishResult>;
  pollForEvents?(accessToken: string, since: Date): Promise<RawInboundEvent[]>;
}
