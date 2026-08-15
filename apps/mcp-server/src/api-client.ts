import { loadEnv } from "@mail-orbyt/config";
import type { AuthenticatedActor } from "./auth-middleware.js";

/**
 * The one way anything in this app talks to apps/web: always with the
 * CALLER's own bearer token, never a service credential. Tools go through
 * the descriptor registry, which layers path templating and error
 * normalization on top; resources use this directly.
 */
export async function fetchOrganisationJson(
  actor: AuthenticatedActor,
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<string> {
  const appUrl = loadEnv().APP_URL;
  let url = `${appUrl}${path.replace("{organisationId}", actor.organisationId)}`;

  if (query) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      search.set(key, String(value));
    }
    const queryString = search.toString();
    if (queryString) url += `?${queryString}`;
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${actor.rawToken}` },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Mail Orbyt returned HTTP ${response.status} for ${path}: ${text.slice(0, 300)}`);
  }
  return text || "{}";
}
