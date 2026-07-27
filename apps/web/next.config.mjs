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
