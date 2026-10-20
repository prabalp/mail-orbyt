/**
 * OAuth against Meta's Graph API (Facebook Login for Business), shared by
 * both Instagram and Threads adapters (Threads publishing itself uses a
 * separate graph.threads.net API surface — see threads-client.ts — but
 * authenticates through the same Facebook Login flow).
 */

const GRAPH_VERSION = "v21.0";
const AUTHORIZATION_ENDPOINT = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const TOKEN_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`;

// instagram_basic/instagram_manage_comments/instagram_content_publish cover
// reading + replying to comments and publishing IG media. pages_show_list
// and pages_read_engagement are required to resolve the connected Page/IG
// business account. threads_basic/threads_content_publish/threads_manage_replies
// cover the Threads API surface exposed through the same Facebook Login flow.
const META_SCOPES = [
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "threads_basic",
  "threads_content_publish",
  "threads_manage_replies",
];

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
}

export class MetaOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaOAuthError";
  }
}

export function buildAuthorizationUrl(
  config: Pick<MetaOAuthConfig, "appId">,
  state: string,
  redirectUri: string,
): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", META_SCOPES.join(","));
  return url.toString();
}

interface MetaTokenResponse {
  accessToken: string;
  expiresInSeconds?: number;
}

/** Step 1: exchange the authorization code for a short-lived user access token. */
export async function exchangeCodeForTokens(
  config: MetaOAuthConfig,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MetaTokenResponse> {
  const url = new URL(TOKEN_ENDPOINT);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new MetaOAuthError(`Token exchange failed with status ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new MetaOAuthError("Token exchange response was missing access_token.");
  }

  return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
}

/**
 * Step 2: exchange a short-lived token for a long-lived one (~60 days).
 * Meta long-lived tokens have no refresh_token — renewal is by repeating
 * this exchange with the still-valid long-lived token before it expires
 * (hence SocialConnection.encryptedRefreshToken is nullable for this
 * platform; see the schema comment).
 */
export async function exchangeForLongLivedToken(
  config: MetaOAuthConfig,
  shortLivedAccessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MetaTokenResponse> {
  const url = new URL(TOKEN_ENDPOINT);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedAccessToken);

  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new MetaOAuthError(`Long-lived token exchange failed with status ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new MetaOAuthError("Long-lived token exchange response was missing access_token.");
  }

  return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
}
