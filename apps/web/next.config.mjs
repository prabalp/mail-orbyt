import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const webDir = path.dirname(fileURLToPath(import.meta.url));
const prismaClientEntry = require.resolve("@prisma/client", {
  paths: [path.resolve(webDir, "../../packages/database")],
});
const prismaClientDir = path.dirname(prismaClientEntry);
const prismaGeneratedDir = path.resolve(prismaClientDir, "../.prisma/client");

// Next bundles `.prisma/client` into `.next/server`, then the query engine
// binary (which lives beside the generated client) cannot be found. Point
// those imports at the real files so Node loads them unbundled.
function externalizePrisma(request) {
  if (!request) return undefined;
  if (request === "@prisma/client") return prismaClientEntry;
  if (request.startsWith("@prisma/client/")) {
    return path.join(prismaClientDir, request.slice("@prisma/client/".length));
  }
  const generatedMarker = ".prisma/client";
  const generatedIdx = request.indexOf(generatedMarker);
  if (generatedIdx !== -1) {
    if (path.isAbsolute(request)) return request;
    const rest = request.slice(generatedIdx + generatedMarker.length).replace(/^\//, "");
    return path.join(prismaGeneratedDir, rest);
  }
  const clientMarker = "@prisma/client";
  const clientIdx = request.indexOf(clientMarker);
  if (clientIdx !== -1 && (path.isAbsolute(request) || request.includes("node_modules"))) {
    return request;
  }
  return undefined;
}

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
  // The generated client lives in `.prisma/client` (pnpm), which Next's
  // default external list does not cover. Bundling it makes the query
  // engine binary resolve next to `.next/server` instead of node_modules.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
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
  webpack: (config, { isServer }) => {
    // In this pnpm monorepo, node_modules alone spans 500+ directories
    // (workspace symlinks + the .pnpm store) — watching all of it blows
    // past the OS file-descriptor limit (EMFILE) regardless of ulimit.
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/node_modules/**", "**/.git/**", "**/.turbo/**", "**/.next/**", "**/dist/**"],
    };
    if (isServer) {
      const previous = config.externals;
      config.externals = [
        ({ request }, callback) => {
          const target = externalizePrisma(request);
          if (target) {
            callback(null, `commonjs ${target}`);
            return;
          }
          callback();
        },
        ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
      ];
    }
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
    "@mail-orbyt/social-generation",
    "@mail-orbyt/social-platforms",
    "@mail-orbyt/social-policy",
    "@mail-orbyt/social-scheduling",
  ],
};

export default nextConfig;
