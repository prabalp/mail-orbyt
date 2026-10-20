export {
  encryptSocialToken,
  decryptSocialToken,
  SocialTokenDecryptionError,
} from "./token-crypto";

export type {
  PlatformTokens,
  PlatformAccountIdentity,
  RawInboundEvent,
  PublishResult,
  SocialPlatformAdapter,
  SocialPlatformName,
} from "./types";

export {
  connectSocialAccount,
  listSocialConnections,
  disconnectSocialAccount,
  getValidAccessToken,
  type ConnectSocialAccountParams,
} from "./connection-service";

export * as linkedInOAuth from "./linkedin/oauth";
export * as linkedInClient from "./linkedin/client";
export { LinkedInOAuthError, type LinkedInOAuthConfig } from "./linkedin/oauth";
export { LinkedInApiError } from "./linkedin/client";

export * as twitterOAuth from "./twitter/oauth";
export * as twitterClient from "./twitter/client";
export { TwitterOAuthError, type TwitterOAuthConfig } from "./twitter/oauth";
export { TwitterApiError } from "./twitter/client";

export * as redditOAuth from "./reddit/oauth";
export * as redditClient from "./reddit/client";
export { RedditOAuthError, type RedditOAuthConfig } from "./reddit/oauth";
export { RedditApiError } from "./reddit/client";

export * as metaOAuth from "./meta/oauth";
export * as instagramClient from "./meta/instagram-client";
export * as threadsClient from "./meta/threads-client";
export { MetaOAuthError, type MetaOAuthConfig } from "./meta/oauth";
export { InstagramApiError } from "./meta/instagram-client";
export { ThreadsApiError } from "./meta/threads-client";
export { verifyMetaWebhookSignature } from "./meta/webhook-verify";
export {
  buildSocialAdapterConfigFromEnv,
  isPlatformConfigured,
  socialRedirectUri,
} from "./env-config";

import * as linkedInOAuthModule from "./linkedin/oauth";
import * as linkedInClientModule from "./linkedin/client";
import * as twitterOAuthModule from "./twitter/oauth";
import * as twitterClientModule from "./twitter/client";
import * as redditOAuthModule from "./reddit/oauth";
import * as redditClientModule from "./reddit/client";
import * as metaOAuthModule from "./meta/oauth";
import * as instagramClientModule from "./meta/instagram-client";
import * as threadsClientModule from "./meta/threads-client";
import type { SocialPlatformAdapter, SocialPlatformName } from "./types";

/**
 * Configuration needed to build each platform's adapter. All fields are
 * optional at the type level because a deployment may only have some
 * platforms' OAuth apps configured (see packages/config's *_OAUTH_* env
 * vars, all `.optional()`); callers should validate the fields required for
 * the platform(s) they actually use before calling getAdapterForPlatform.
 */
export interface SocialAdapterConfig {
  linkedIn?: { clientId: string; clientSecret: string };
  twitter?: { clientId: string; clientSecret: string };
  reddit?: { clientId: string; clientSecret: string; userAgent: string };
  meta?: { appId: string; appSecret: string };
}

/**
 * Assembles a platform's oauth.ts + client.ts functions into the
 * `SocialPlatformAdapter` shape. This is the entry point later worker code
 * (posting/reply/poll jobs) calls to get a uniform interface regardless of
 * platform.
 *
 * Note: X/Twitter's OAuth flow requires PKCE (a code_verifier persisted
 * between the authorization redirect and the callback) which doesn't fit
 * this interface's stateless `buildAuthorizationUrl(state, redirectUri)`
 * signature — callers connecting Twitter should use
 * `twitterOAuth.generateCodeVerifier`/`deriveCodeChallenge` directly rather
 * than this adapter's `buildAuthorizationUrl`/`exchangeCodeForTokens`, which
 * are provided only to satisfy the shared interface (and will throw if the
 * verifier isn't threaded through some other way, e.g. by wrapping the
 * config with a closure over a stored verifier per `state`).
 */
export function getAdapterForPlatform(
  platform: SocialPlatformName,
  config: SocialAdapterConfig,
): SocialPlatformAdapter {
  switch (platform) {
    case "LINKEDIN": {
      const linkedInConfig = requireConfig(config.linkedIn, "LinkedIn");
      return {
        platform: "LINKEDIN",
        supportsWebhook: false,
        buildAuthorizationUrl: (state, redirectUri) =>
          linkedInOAuthModule.buildAuthorizationUrl(linkedInConfig, state, redirectUri),
        exchangeCodeForTokens: async (code, redirectUri) => {
          const tokens = await linkedInOAuthModule.exchangeCodeForTokens(
            linkedInConfig,
            code,
            redirectUri,
          );
          return tokens;
        },
        refreshAccessToken: (refreshToken) =>
          linkedInOAuthModule.refreshAccessToken(linkedInConfig, refreshToken),
        fetchAccountIdentity: (accessToken) => linkedInClientModule.fetchAccountIdentity(accessToken),
        publishPost: async (accessToken, content) => {
          const identity = await linkedInClientModule.fetchAccountIdentity(accessToken);
          return linkedInClientModule.publishPost(accessToken, identity.externalAccountId, content);
        },
        publishReply: async (accessToken, threadOrCommentId, content) => {
          const identity = await linkedInClientModule.fetchAccountIdentity(accessToken);
          return linkedInClientModule.publishReply(
            accessToken,
            identity.externalAccountId,
            threadOrCommentId,
            content,
          );
        },
        pollForEvents: async (accessToken, since) => {
          const identity = await linkedInClientModule.fetchAccountIdentity(accessToken);
          return linkedInClientModule.pollForEvents(accessToken, identity.externalAccountId, since);
        },
      };
    }
    case "TWITTER": {
      const twitterConfig = requireConfig(config.twitter, "Twitter");
      return {
        platform: "TWITTER",
        supportsWebhook: false,
        buildAuthorizationUrl: (state, redirectUri) =>
          // See this function's doc comment: PKCE is not modeled by this
          // interface. This default uses a fresh, unpaired code_challenge —
          // callers needing a real PKCE flow should call
          // twitterOAuth.buildAuthorizationUrl directly instead.
          twitterOAuthModule.buildAuthorizationUrl(
            twitterConfig,
            state,
            redirectUri,
            twitterOAuthModule.deriveCodeChallenge(twitterOAuthModule.generateCodeVerifier()),
          ),
        exchangeCodeForTokens: () => {
          throw new Error(
            "Twitter requires PKCE — call twitterOAuth.exchangeCodeForTokens directly with the stored code_verifier instead of this adapter method.",
          );
        },
        refreshAccessToken: (refreshToken) =>
          twitterOAuthModule.refreshAccessToken(twitterConfig, refreshToken),
        fetchAccountIdentity: (accessToken) => twitterClientModule.fetchAccountIdentity(accessToken),
        publishPost: (accessToken, content) => twitterClientModule.publishPost(accessToken, content),
        publishReply: (accessToken, threadOrCommentId, content) =>
          twitterClientModule.publishReply(accessToken, threadOrCommentId, content),
        pollForEvents: async (accessToken, since) => {
          const identity = await twitterClientModule.fetchAccountIdentity(accessToken);
          return twitterClientModule.pollForEvents(accessToken, identity.externalAccountId, since);
        },
      };
    }
    case "REDDIT": {
      const redditConfig = requireConfig(config.reddit, "Reddit");
      return {
        platform: "REDDIT",
        supportsWebhook: false,
        buildAuthorizationUrl: (state, redirectUri) =>
          redditOAuthModule.buildAuthorizationUrl(redditConfig, state, redirectUri),
        exchangeCodeForTokens: (code, redirectUri) =>
          redditOAuthModule.exchangeCodeForTokens(redditConfig, code, redirectUri),
        refreshAccessToken: (refreshToken) =>
          redditOAuthModule.refreshAccessToken(redditConfig, refreshToken),
        fetchAccountIdentity: (accessToken) =>
          redditClientModule.fetchAccountIdentity(accessToken, redditConfig.userAgent),
        // See reddit/client.ts: `content` must be a JSON string of
        // { subreddit, title, text }.
        publishPost: (accessToken, content) =>
          redditClientModule.publishPost(accessToken, redditConfig.userAgent, content),
        publishReply: (accessToken, threadOrCommentId, content) =>
          redditClientModule.publishReply(accessToken, redditConfig.userAgent, threadOrCommentId, content),
        pollForEvents: async (accessToken, since) => {
          const identity = await redditClientModule.fetchAccountIdentity(
            accessToken,
            redditConfig.userAgent,
          );
          return redditClientModule.pollForEvents(
            accessToken,
            redditConfig.userAgent,
            identity.handle,
            since,
          );
        },
      };
    }
    case "INSTAGRAM": {
      const metaConfig = requireConfig(config.meta, "Meta");
      return {
        platform: "INSTAGRAM",
        supportsWebhook: true,
        buildAuthorizationUrl: (state, redirectUri) =>
          metaOAuthModule.buildAuthorizationUrl(metaConfig, state, redirectUri),
        exchangeCodeForTokens: async (code, redirectUri) => {
          const shortLived = await metaOAuthModule.exchangeCodeForTokens(metaConfig, code, redirectUri);
          const longLived = await metaOAuthModule.exchangeForLongLivedToken(
            metaConfig,
            shortLived.accessToken,
          );
          return { accessToken: longLived.accessToken, expiresInSeconds: longLived.expiresInSeconds, scopes: [] };
        },
        // Meta long-lived tokens have no refresh_token; renewal re-exchanges
        // the still-valid long-lived token itself (see meta/oauth.ts).
        refreshAccessToken: async (refreshToken) => {
          const longLived = await metaOAuthModule.exchangeForLongLivedToken(metaConfig, refreshToken);
          return { accessToken: longLived.accessToken, expiresInSeconds: longLived.expiresInSeconds, scopes: [] };
        },
        fetchAccountIdentity: (accessToken) => instagramClientModule.fetchAccountIdentity(accessToken),
        // `content` must be a JSON string of { imageUrl, caption } — see
        // meta/instagram-client.ts.
        publishPost: async (accessToken, content) => {
          const identity = await instagramClientModule.fetchAccountIdentity(accessToken);
          return instagramClientModule.publishPost(accessToken, identity.externalAccountId, content);
        },
        publishReply: (accessToken, threadOrCommentId, content) =>
          instagramClientModule.publishReply(accessToken, threadOrCommentId, content),
      };
    }
    case "THREADS": {
      const metaConfig = requireConfig(config.meta, "Meta");
      return {
        platform: "THREADS",
        supportsWebhook: true,
        buildAuthorizationUrl: (state, redirectUri) =>
          metaOAuthModule.buildAuthorizationUrl(metaConfig, state, redirectUri),
        exchangeCodeForTokens: async (code, redirectUri) => {
          const shortLived = await metaOAuthModule.exchangeCodeForTokens(metaConfig, code, redirectUri);
          const longLived = await metaOAuthModule.exchangeForLongLivedToken(
            metaConfig,
            shortLived.accessToken,
          );
          return { accessToken: longLived.accessToken, expiresInSeconds: longLived.expiresInSeconds, scopes: [] };
        },
        refreshAccessToken: async (refreshToken) => {
          const longLived = await metaOAuthModule.exchangeForLongLivedToken(metaConfig, refreshToken);
          return { accessToken: longLived.accessToken, expiresInSeconds: longLived.expiresInSeconds, scopes: [] };
        },
        fetchAccountIdentity: (accessToken) => threadsClientModule.fetchAccountIdentity(accessToken),
        publishPost: async (accessToken, content) => {
          const identity = await threadsClientModule.fetchAccountIdentity(accessToken);
          return threadsClientModule.publishPost(accessToken, identity.externalAccountId, content);
        },
        publishReply: async (accessToken, threadOrCommentId, content) => {
          const identity = await threadsClientModule.fetchAccountIdentity(accessToken);
          return threadsClientModule.publishReply(
            accessToken,
            identity.externalAccountId,
            threadOrCommentId,
            content,
          );
        },
      };
    }
    default: {
      const exhaustive: never = platform;
      throw new Error(`Unsupported social platform: ${String(exhaustive)}`);
    }
  }
}

function requireConfig<T>(value: T | undefined, label: string): T {
  if (!value) {
    throw new Error(`${label} OAuth is not configured for this deployment.`);
  }
  return value;
}
