/**
 * Instagram Graph API calls (comment replies + media publishing). Media
 * publishing is a two-step container-then-publish flow, as required by the
 * Graph API: create a media container with the content, then publish it.
 */
import type { PlatformAccountIdentity, PublishResult } from "../types";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class InstagramApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstagramApiError";
  }
}

/**
 * Resolves the Instagram professional account behind the given user token
 * via the user's Facebook Pages (Instagram accounts are always linked to a
 * Page under Facebook Login for Business).
 */
export async function fetchAccountIdentity(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlatformAccountIdentity> {
  const pagesResponse = await fetchImpl(
    `${GRAPH_BASE}/me/accounts?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!pagesResponse.ok) {
    throw new InstagramApiError(`Fetching linked Pages failed with status ${pagesResponse.status}`);
  }

  const data = (await pagesResponse.json()) as {
    data?: { instagram_business_account?: { id?: string; username?: string } }[];
  };
  const igAccount = data.data?.find(
    (page) => page.instagram_business_account?.id,
  )?.instagram_business_account;

  if (!igAccount?.id) {
    throw new InstagramApiError("No Instagram business account is linked to this user's Pages.");
  }

  return { externalAccountId: igAccount.id, handle: igAccount.username ?? igAccount.id };
}

interface InstagramPostContent {
  imageUrl: string;
  caption: string;
}

/**
 * Instagram has no text-only post type — every post requires media. Since
 * `SocialPlatformAdapter.publishPost` only takes `(accessToken, content)`,
 * this adapter uses the same documented JSON-string convention as Reddit's
 * publishPost: `content` must be a JSON string of
 * `{ imageUrl: string; caption: string }`.
 */
export async function publishPost(
  accessToken: string,
  igUserId: string,
  content: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  let parsed: InstagramPostContent;
  try {
    parsed = JSON.parse(content) as InstagramPostContent;
  } catch {
    throw new InstagramApiError(
      "Instagram publishPost expects `content` to be a JSON string of { imageUrl, caption }.",
    );
  }
  if (!parsed.imageUrl || !parsed.caption) {
    throw new InstagramApiError("Instagram post content was missing imageUrl/caption.");
  }
  const { imageUrl, caption } = parsed;

  const containerResponse = await fetchImpl(`${GRAPH_BASE}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: accessToken }),
  });

  if (!containerResponse.ok) {
    throw new InstagramApiError(
      `Creating IG media container failed with status ${containerResponse.status}`,
    );
  }

  const containerData = (await containerResponse.json()) as { id?: string };
  if (!containerData.id) {
    throw new InstagramApiError("IG media container response was missing id.");
  }

  const publishResponse = await fetchImpl(`${GRAPH_BASE}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: containerData.id, access_token: accessToken }),
  });

  if (!publishResponse.ok) {
    throw new InstagramApiError(`Publishing IG media failed with status ${publishResponse.status}`);
  }

  const publishData = (await publishResponse.json()) as { id?: string };
  if (!publishData.id) {
    throw new InstagramApiError("IG media publish response was missing id.");
  }

  return { externalPostId: publishData.id };
}

export async function publishReply(
  accessToken: string,
  igCommentId: string,
  content: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  const response = await fetchImpl(`${GRAPH_BASE}/${igCommentId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message: content, access_token: accessToken }),
  });

  if (!response.ok) {
    throw new InstagramApiError(
      `Publishing IG comment reply failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as { id?: string };
  if (!data.id) {
    throw new InstagramApiError("IG comment reply response was missing id.");
  }

  return { externalPostId: data.id };
}
