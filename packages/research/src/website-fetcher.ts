import { assertSafeUrl, UnsafeUrlError } from "./ssrf-guard";

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB — plenty for HTML, bounds memory/abuse

export interface FetchedWebsite {
  finalUrl: string;
  httpStatus: number;
  html: string;
}

export class WebsiteFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebsiteFetchError";
  }
}

async function readBodyWithLimit(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return response.text();

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new WebsiteFetchError(`Response exceeded ${MAX_BODY_BYTES} byte limit`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf-8");
}

/**
 * Fetches a public webpage for deterministic extraction (JSON-LD/Open
 * Graph/meta tags). Every redirect hop is independently re-validated by the
 * SSRF guard (not just the initial URL) — a same-origin redirect to a
 * private IP is exactly the kind of thing an SSRF exploit relies on.
 * Redirects are followed manually rather than via `fetch`'s automatic
 * `redirect: "follow"` specifically so each hop can be checked before it's
 * taken.
 */
export async function fetchWebsite(url: string): Promise<FetchedWebsite> {
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (hop === MAX_REDIRECTS) {
      throw new WebsiteFetchError(`Exceeded ${MAX_REDIRECTS} redirects`);
    }

    const safeUrl = await assertSafeUrl(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(safeUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "MailOrbytResearchBot/1.0 (+deterministic public-page fetch)" },
      });
    } catch (error) {
      if (error instanceof UnsafeUrlError) throw error;
      throw new WebsiteFetchError(
        `Failed to fetch ${currentUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new WebsiteFetchError(`Redirect response with no Location header from ${currentUrl}`);
      }
      currentUrl = new URL(location, safeUrl).toString();
      continue;
    }

    const html = await readBodyWithLimit(response);
    return { finalUrl: safeUrl.toString(), httpStatus: response.status, html };
  }

  throw new WebsiteFetchError(`Exceeded ${MAX_REDIRECTS} redirects`);
}
