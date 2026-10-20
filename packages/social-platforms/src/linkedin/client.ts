/**
 * LinkedIn REST calls: identity (OpenID Connect userinfo), the Posts API for
 * publishing/replying, and a best-effort "poll for events" built from
 * comments on the account's own recent posts.
 */
import type { PlatformAccountIdentity, PublishResult, RawInboundEvent } from "../types";

const USERINFO_ENDPOINT = "https://api.linkedin.com/v2/userinfo";
const POSTS_ENDPOINT = "https://api.linkedin.com/rest/posts";
const SOCIAL_ACTIONS_ENDPOINT = "https://api.linkedin.com/rest/socialActions";
const LINKEDIN_API_VERSION = "202405";

export class LinkedInApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkedInApiError";
  }
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": LINKEDIN_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

export async function fetchAccountIdentity(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlatformAccountIdentity> {
  const response = await fetchImpl(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new LinkedInApiError(`Fetching LinkedIn userinfo failed with status ${response.status}`);
  }

  const data = (await response.json()) as { sub?: string; name?: string; email?: string };
  if (!data.sub) {
    throw new LinkedInApiError("LinkedIn userinfo response was missing sub (member id).");
  }

  return { externalAccountId: data.sub, handle: data.name ?? data.email ?? data.sub };
}

/** LinkedIn's Posts API requires the author as a URN (urn:li:person:{sub}). */
function memberUrn(externalAccountId: string): string {
  return `urn:li:person:${externalAccountId}`;
}

export async function publishPost(
  accessToken: string,
  externalAccountId: string,
  content: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  const response = await fetchImpl(POSTS_ENDPOINT, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      author: memberUrn(externalAccountId),
      commentary: content,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  if (!response.ok) {
    throw new LinkedInApiError(`Publishing LinkedIn post failed with status ${response.status}`);
  }

  const postId = response.headers.get("x-restli-id") ?? response.headers.get("x-linkedin-id");
  if (!postId) {
    throw new LinkedInApiError("LinkedIn post response was missing the x-restli-id header.");
  }

  return { externalPostId: postId };
}

/** Replies are posted as comments via the Social Actions API against the target post/comment URN. */
export async function publishReply(
  accessToken: string,
  externalAccountId: string,
  threadOrCommentUrn: string,
  content: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  const response = await fetchImpl(
    `${SOCIAL_ACTIONS_ENDPOINT}/${encodeURIComponent(threadOrCommentUrn)}/comments`,
    {
      method: "POST",
      headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({
        actor: memberUrn(externalAccountId),
        object: threadOrCommentUrn,
        message: { text: content },
      }),
    },
  );

  if (!response.ok) {
    throw new LinkedInApiError(`Publishing LinkedIn reply failed with status ${response.status}`);
  }

  const commentId = response.headers.get("x-restli-id") ?? response.headers.get("x-linkedin-id");
  if (!commentId) {
    throw new LinkedInApiError("LinkedIn comment response was missing the x-restli-id header.");
  }

  return { externalPostId: commentId };
}

/**
 * LinkedIn's standard-tier API has no general mentions/keyword search
 * endpoint. As a reasonable approximation, this polls comments on the
 * account's own recent posts (via the Social Actions API) rather than the
 * full mention surface a paid Marketing/Partner tier would expose. Reply
 * threads and DMs are out of scope for this poller.
 */
export async function pollForEvents(
  accessToken: string,
  externalAccountId: string,
  since: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<RawInboundEvent[]> {
  const authorUrn = memberUrn(externalAccountId);
  const postsResponse = await fetchImpl(
    `${POSTS_ENDPOINT}?author=${encodeURIComponent(authorUrn)}&q=author&count=20`,
    { headers: authHeaders(accessToken) },
  );

  if (!postsResponse.ok) {
    throw new LinkedInApiError(`Listing LinkedIn posts failed with status ${postsResponse.status}`);
  }

  const postsData = (await postsResponse.json()) as { elements?: { id?: string }[] };
  const events: RawInboundEvent[] = [];

  for (const post of postsData.elements ?? []) {
    if (!post.id) continue;
    const commentsResponse = await fetchImpl(
      `${SOCIAL_ACTIONS_ENDPOINT}/${encodeURIComponent(post.id)}/comments`,
      { headers: authHeaders(accessToken) },
    );
    if (!commentsResponse.ok) continue;

    const commentsData = (await commentsResponse.json()) as {
      elements?: {
        id?: string;
        actor?: string;
        message?: { text?: string };
        created?: { time?: number };
      }[];
    };

    for (const comment of commentsData.elements ?? []) {
      const createdAtMs = comment.created?.time;
      if (!comment.id || !createdAtMs || createdAtMs < since.getTime()) continue;
      events.push({
        externalEventId: comment.id,
        externalThreadId: post.id,
        eventType: "COMMENT",
        authorHandle: comment.actor ?? "unknown",
        contentText: comment.message?.text ?? "",
        rawPayload: comment,
        occurredAt: new Date(createdAtMs),
      });
    }
  }

  return events;
}
