/**
 * Public base URL for redirects. Behind a reverse proxy, `request.url` reflects the
 * internal listener (e.g. http://localhost:3000), so prefer the configured public URL.
 */
export function publicUrl(path: string, request: Request): URL {
  const base = process.env.APP_URL || process.env.AUTH_URL || request.url;
  return new URL(path, base);
}
