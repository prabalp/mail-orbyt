/**
 * Threads API calls. Threads is a distinct product surface from the main
 * Graph API — it lives at graph.threads.net, not graph.facebook.com — even
 * though it shares Facebook Login for OAuth (see meta/oauth.ts). Publishing
 * is the same two-step container-then-publish flow as Instagram.
 */
import type { PlatformAccountIdentity, PublishResult } from "../types";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

export class ThreadsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThreadsApiError";
  }
}

export async function fetchAccountIdentity(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlatformAccountIdentity> {
  const response = await fetchImpl(
    `${THREADS_API_BASE}/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`,
  );

  if (!response.ok) {
    throw new ThreadsApiError(`Fetching Threads identity failed with status ${response.status}`);
  }

  const data = (await response.json()) as { id?: string; username?: string };
  if (!data.id) {
    throw new ThreadsApiError("Threads /me response was missing id.");
  }

  return { externalAccountId: data.id, handle: data.username ?? data.id };
}

async function createAndPublishContainer(
  threadsUserId: string,
  accessToken: string,
  params: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<PublishResult> {
  const containerResponse = await fetchImpl(`${THREADS_API_BASE}/${threadsUserId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: accessToken }),
  });

  if (!containerResponse.ok) {
    throw new ThreadsApiError(`Creating Threads container failed with status ${containerResponse.status}`);
  }

  const containerData = (await containerResponse.json()) as { id?: string };
  if (!containerData.id) {
    throw new ThreadsApiError("Threads container response was missing id.");
  }

  const publishResponse = await fetchImpl(`${THREADS_API_BASE}/${threadsUserId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: containerData.id, access_token: accessToken }),
  });

  if (!publishResponse.ok) {
    throw new ThreadsApiError(`Publishing Threads post failed with status ${publishResponse.status}`);
  }

  const publishData = (await publishResponse.json()) as { id?: string };
  if (!publishData.id) {
    throw new ThreadsApiError("Threads publish response was missing id.");
  }

  return { externalPostId: publishData.id };
}

export async function publishPost(
  accessToken: string,
  threadsUserId: string,
  content: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  return createAndPublishContainer(
    threadsUserId,
    accessToken,
    { media_type: "TEXT", text: content },
    fetchImpl,
  );
}

export async function publishReply(
  accessToken: string,
  threadsUserId: string,
  replyToId: string,
  content: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  return createAndPublishContainer(
    threadsUserId,
    accessToken,
    { media_type: "TEXT", text: content, reply_to_id: replyToId },
    fetchImpl,
  );
}
