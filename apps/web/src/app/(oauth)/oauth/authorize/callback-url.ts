/** Shared by actions.ts (explicit "Allow" approval) and page.tsx (the silent skip-consent path) — both redirect back to the client's redirect_uri the same way. */
export function appendCallback(
  url: URL,
  params: { code?: string; error?: string; state: string },
): string {
  if (params.code) url.searchParams.set("code", params.code);
  if (params.error) url.searchParams.set("error", params.error);
  if (params.state) url.searchParams.set("state", params.state);
  return url.toString();
}
