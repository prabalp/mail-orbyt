/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
