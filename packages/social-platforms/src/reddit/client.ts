/**
 * Reddit's OAuth API calls. All requests (per Reddit's API rules) must carry
 * a descriptive User-Agent — see reddit/oauth.ts's RedditOAuthConfig.
 *
 * Reddit has no direct "publish a top-level post" analog shared with
 * comment-replies, and posting always targets a specific subreddit. Since
 * `SocialPlatformAdapter.publishPost` only takes `(accessToken, content)`,
 * this adapter uses a documented JSON convention: `content` must be a
 * JSON string of `{ subreddit: string; title: string; text: string }`.
 * Callers building Reddit posts must serialize that shape before calling
 * publishPost.
 */
import type { PlatformAccountIdentity, PublishResult, RawInboundEvent } from "../types";

const API_BASE = "https://oauth.reddit.com";

export class RedditApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedditApiError";
  }
}

function authHeaders(accessToken: string, userAgent: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, "User-Agent": userAgent };
}

export async function fetchAccountIdentity(
  accessToken: string,
  userAgent: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlatformAccountIdentity> {
  const response = await fetchImpl(`${API_BASE}/api/v1/me`, {
    headers: authHeaders(accessToken, userAgent),
  });

  if (!response.ok) {
    throw new RedditApiError(`Fetching Reddit identity failed with status ${response.status}`);
  }

  const data = (await response.json()) as { id?: string; name?: string };
  if (!data.id || !data.name) {
    throw new RedditApiError("Reddit /api/v1/me response was missing id/name.");
  }

  return { externalAccountId: data.id, handle: data.name };
}

interface RedditPostContent {
  subreddit: string;
  title: string;
  text: string;
}

/** See the file header comment: `content` must be a JSON-encoded RedditPostContent. */
export async function publishPost(
  accessToken: string,
  userAgent: string,
  content: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  let parsed: RedditPostContent;
  try {
    parsed = JSON.parse(content) as RedditPostContent;
  } catch {
    throw new RedditApiError(
      "Reddit publishPost expects `content` to be a JSON string of { subreddit, title, text }.",
    );
  }
  if (!parsed.subreddit || !parsed.title || !parsed.text) {
    throw new RedditApiError("Reddit post content was missing subreddit/title/text.");
  }

  const response = await fetchImpl(`${API_BASE}/api/submit`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken, userAgent),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      sr: parsed.subreddit,
      title: parsed.title,
      text: parsed.text,
      kind: "self",
      api_type: "json",
    }),
  });

  if (!response.ok) {
    throw new RedditApiError(`Submitting Reddit post failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    json?: { errors?: unknown[]; data?: { name?: string } };
  };
  const errors = data.json?.errors ?? [];
  const postId = data.json?.data?.name;
  if (errors.length > 0 || !postId) {
    throw new RedditApiError(`Reddit rejected the submission: ${JSON.stringify(errors)}`);
  }

  return { externalPostId: postId };
}

/** `thingId` is a Reddit fullname (e.g. "t1_xxxxx" for a comment, "t3_xxxxx" for a post). */
export async function publishReply(
  accessToken: string,
  userAgent: string,
  thingId: string,
  content: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  const response = await fetchImpl(`${API_BASE}/api/comment`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken, userAgent),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      thing_id: thingId,
      text: content,
      api_type: "json",
    }),
  });

  if (!response.ok) {
    throw new RedditApiError(`Submitting Reddit comment failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    json?: { errors?: unknown[]; data?: { things?: { data?: { name?: string } }[] } };
  };
  const errors = data.json?.errors ?? [];
  const commentId = data.json?.data?.things?.[0]?.data?.name;
  if (errors.length > 0 || !commentId) {
    throw new RedditApiError(`Reddit rejected the comment: ${JSON.stringify(errors)}`);
  }

  return { externalPostId: commentId };
}

interface RedditListingChild {
  kind: string;
  data: {
    name?: string;
    id?: string;
    author?: string;
    body?: string;
    subject?: string;
    context?: string;
    created_utc?: number;
    link_id?: string;
  };
}

/** Combines unread private messages and username mentions into a single inbound-events feed. */
export async function pollForEvents(
  accessToken: string,
  userAgent: string,
  username: string,
  since: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<RawInboundEvent[]> {
  const [unreadResponse, mentionsResponse] = await Promise.all([
    fetchImpl(`${API_BASE}/message/unread`, { headers: authHeaders(accessToken, userAgent) }),
    fetchImpl(`${API_BASE}/user/${encodeURIComponent(username)}/mentions`, {
      headers: authHeaders(accessToken, userAgent),
    }),
  ]);

  if (!unreadResponse.ok) {
    throw new RedditApiError(`Fetching Reddit unread mail failed with status ${unreadResponse.status}`);
  }
  if (!mentionsResponse.ok) {
    throw new RedditApiError(`Fetching Reddit mentions failed with status ${mentionsResponse.status}`);
  }

  const [unreadData, mentionsData] = (await Promise.all([
    unreadResponse.json(),
    mentionsResponse.json(),
  ])) as [{ data?: { children?: RedditListingChild[] } }, { data?: { children?: RedditListingChild[] } }];

  const sinceSeconds = since.getTime() / 1000;
  const events: RawInboundEvent[] = [];

  for (const child of unreadData.data?.children ?? []) {
    const createdUtc = child.data.created_utc;
    if (!child.data.name || !createdUtc || createdUtc < sinceSeconds) continue;
    events.push({
      externalEventId: child.data.name,
      externalThreadId: child.data.context ?? child.data.link_id,
      eventType: "DM",
      authorHandle: child.data.author ?? "unknown",
      contentText: child.data.body ?? child.data.subject ?? "",
      rawPayload: child,
      occurredAt: new Date(createdUtc * 1000),
    });
  }

  for (const child of mentionsData.data?.children ?? []) {
    const createdUtc = child.data.created_utc;
    if (!child.data.name || !createdUtc || createdUtc < sinceSeconds) continue;
    events.push({
      externalEventId: child.data.name,
      externalThreadId: child.data.link_id,
      eventType: "MENTION",
      authorHandle: child.data.author ?? "unknown",
      contentText: child.data.body ?? "",
      rawPayload: child,
      occurredAt: new Date(createdUtc * 1000),
    });
  }

  return events;
}
