const SECURITY_HEADERS = [
  // Never let this app be framed — blocks clickjacking outright.
  { key: "X-Frame-Options", value: "DENY" },
  // Belt-and-suspenders with X-Frame-Options for browsers that honor CSP
  // frame-ancestors instead.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Locks down powerful browser APIs this app never uses.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    // Conventional flat OAuth endpoint paths, aliased to their real routes.
    // Some MCP clients hardcode a fallback to these paths (relative to the
    // issuer root) instead of always honoring the discovered metadata's
    // exact endpoint URLs — serving both keeps us compatible either way.
    return [
      { source: "/register", destination: "/api/oauth/register" },
      { source: "/token", destination: "/api/oauth/token" },
      { source: "/revoke", destination: "/api/oauth/revoke" },
      { source: "/authorize", destination: "/oauth/authorize" },
    ];
  },
  webpack: (config) => {
    // In this pnpm monorepo, node_modules alone spans 500+ directories
    // (workspace symlinks + the .pnpm store) — watching all of it blows
    // past the OS file-descriptor limit (EMFILE) regardless of ulimit.
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/node_modules/**", "**/.git/**", "**/.turbo/**", "**/.next/**", "**/dist/**"],
    };
    return config;
  },
  transpilePackages: [
    "@mail-orbyt/config",
    "@mail-orbyt/database",
    "@mail-orbyt/logging",
    "@mail-orbyt/validation",
    "@mail-orbyt/design-system",
    "@mail-orbyt/authentication",
    "@mail-orbyt/leads",
    "@mail-orbyt/storage",
    "@mail-orbyt/research",
    "@mail-orbyt/gmail",
    "@mail-orbyt/campaigns",
    "@mail-orbyt/scheduling",
    "@mail-orbyt/conversations",
    "@mail-orbyt/analytics",
    "@mail-orbyt/compliance",
  ],
};

export default nextConfig;
