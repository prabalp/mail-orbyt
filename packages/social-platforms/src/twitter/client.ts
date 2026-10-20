/**
 * X/Twitter API v2 REST calls: identity, posting, replying and mentions
 * polling.
 */
import type { PlatformAccountIdentity, PublishResult, RawInboundEvent } from "../types";

const API_BASE = "https://api.twitter.com/2";

export class TwitterApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwitterApiError";
  }
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function fetchAccountIdentity(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlatformAccountIdentity> {
  const response = await fetchImpl(`${API_BASE}/users/me`, { headers: authHeaders(accessToken) });

  if (!response.ok) {
    throw new TwitterApiError(`Fetching Twitter user failed with status ${response.status}`);
  }

  const data = (await response.json()) as { data?: { id?: string; username?: string } };
  if (!data.data?.id) {
    throw new TwitterApiError("Twitter users/me response was missing data.id.");
  }

  return { externalAccountId: data.data.id, handle: data.data.username ?? data.data.id };
}

export async function publishPost(
  accessToken: string,
  content: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  const response = await fetchImpl(`${API_BASE}/tweets`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ text: content }),
  });

  if (!response.ok) {
    throw new TwitterApiError(`Publishing tweet failed with status ${response.status}`);
  }

  const data = (await response.json()) as { data?: { id?: string } };
  if (!data.data?.id) {
    throw new TwitterApiError("Tweet creation response was missing data.id.");
  }

  return { externalPostId: data.data.id };
}

export async function publishReply(
  accessToken: string,
  inReplyToTweetId: string,
  content: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  const response = await fetchImpl(`${API_BASE}/tweets`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      text: content,
      reply: { in_reply_to_tweet_id: inReplyToTweetId },
    }),
  });

  if (!response.ok) {
    throw new TwitterApiError(`Publishing tweet reply failed with status ${response.status}`);
  }

  const data = (await response.json()) as { data?: { id?: string } };
  if (!data.data?.id) {
    throw new TwitterApiError("Tweet reply response was missing data.id.");
  }

  return { externalPostId: data.data.id };
}

export async function pollForEvents(
  accessToken: string,
  externalAccountId: string,
  since: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<RawInboundEvent[]> {
  const url = new URL(`${API_BASE}/users/${externalAccountId}/mentions`);
  url.searchParams.set("start_time", since.toISOString());
  url.searchParams.set("tweet.fields", "created_at,author_id,conversation_id");
  url.searchParams.set("expansions", "author_id");

  const response = await fetchImpl(url.toString(), { headers: authHeaders(accessToken) });
  if (!response.ok) {
    throw new TwitterApiError(`Fetching Twitter mentions failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    data?: {
      id: string;
      text: string;
      author_id?: string;
      conversation_id?: string;
      created_at?: string;
    }[];
    includes?: { users?: { id: string; username: string }[] };
  };

  const usernameById = new Map(
    (data.includes?.users ?? []).map((user) => [user.id, user.username]),
  );

  return (data.data ?? []).map((tweet) => ({
    externalEventId: tweet.id,
    externalThreadId: tweet.conversation_id,
    eventType: "MENTION" as const,
    authorHandle:
      (tweet.author_id && usernameById.get(tweet.author_id)) ?? tweet.author_id ?? "unknown",
    contentText: tweet.text,
    rawPayload: tweet,
    occurredAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
  }));
}
