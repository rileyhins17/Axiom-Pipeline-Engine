import type { NextConfig } from "next";

// Only initialize OpenNext Cloudflare bindings when running in CF dev mode.
// On bare Node.js (e.g. Raspberry Pi), this package won't be installed.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");
  initOpenNextCloudflareForDev();
} catch {
  // Not running on Cloudflare — skip OpenNext initialization
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["@cloudflare/playwright", "playwright", "better-sqlite3"],
  typedRoutes: true,
};

export default nextConfig;
