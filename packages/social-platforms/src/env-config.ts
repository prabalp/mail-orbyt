import { loadEnv } from "@mail-orbyt/config";
import type { SocialAdapterConfig } from "./index";
import type { SocialPlatformName } from "./types";

/** Assembles getAdapterForPlatform's config from whichever *_OAUTH_* env vars are set — a deployment may only have some platforms' apps configured. */
export function buildSocialAdapterConfigFromEnv(): SocialAdapterConfig {
  const env = loadEnv();
  return {
    linkedIn:
      env.LINKEDIN_OAUTH_CLIENT_ID && env.LINKEDIN_OAUTH_CLIENT_SECRET
        ? { clientId: env.LINKEDIN_OAUTH_CLIENT_ID, clientSecret: env.LINKEDIN_OAUTH_CLIENT_SECRET }
        : undefined,
    twitter:
      env.TWITTER_OAUTH_CLIENT_ID && env.TWITTER_OAUTH_CLIENT_SECRET
        ? { clientId: env.TWITTER_OAUTH_CLIENT_ID, clientSecret: env.TWITTER_OAUTH_CLIENT_SECRET }
        : undefined,
    reddit:
      env.REDDIT_OAUTH_CLIENT_ID && env.REDDIT_OAUTH_CLIENT_SECRET && env.REDDIT_USER_AGENT
        ? {
            clientId: env.REDDIT_OAUTH_CLIENT_ID,
            clientSecret: env.REDDIT_OAUTH_CLIENT_SECRET,
            userAgent: env.REDDIT_USER_AGENT,
          }
        : undefined,
    meta:
      env.META_OAUTH_APP_ID && env.META_OAUTH_APP_SECRET
        ? { appId: env.META_OAUTH_APP_ID, appSecret: env.META_OAUTH_APP_SECRET }
        : undefined,
  };
}

export function isPlatformConfigured(platform: SocialPlatformName): boolean {
  const config = buildSocialAdapterConfigFromEnv();
  switch (platform) {
    case "LINKEDIN":
      return config.linkedIn !== undefined;
    case "TWITTER":
      return config.twitter !== undefined;
    case "REDDIT":
      return config.reddit !== undefined;
    case "INSTAGRAM":
    case "THREADS":
      return config.meta !== undefined;
  }
}

/**
 * Every platform shares one callback route (apps/web's
 * /api/social/oauth/callback — the platform travels in a cookie), so each
 * platform's *_OAUTH_REDIRECT_URI defaults to it when unset. Whatever this
 * returns must be registered verbatim as the redirect URI in that
 * platform's developer console.
 */
export function socialRedirectUri(platform: SocialPlatformName): string {
  const env = loadEnv();
  const fallback = `${env.APP_URL.replace(/\/$/, "")}/api/social/oauth/callback`;
  switch (platform) {
    case "LINKEDIN":
      return env.LINKEDIN_OAUTH_REDIRECT_URI ?? fallback;
    case "TWITTER":
      return env.TWITTER_OAUTH_REDIRECT_URI ?? fallback;
    case "REDDIT":
      return env.REDDIT_OAUTH_REDIRECT_URI ?? fallback;
    case "INSTAGRAM":
    case "THREADS":
      return env.META_OAUTH_REDIRECT_URI ?? fallback;
  }
}
