import type { NextConfig } from "next";

// Only initialize OpenNext Cloudflare bindings when explicitly running in a
// Cloudflare-style dev context. This avoids local Node/Windows weirdness.
if (
  process.env.CLOUDFLARE === "1" ||
  process.env.WORKERS_RS === "1" ||
  process.env.NEXT_RUNTIME === "edge"
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");
    initOpenNextCloudflareForDev();
  } catch {
    // Ignore when not actually running in Cloudflare/OpenNext dev mode.
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: true,

  // Keep native / heavy server-only packages out of the webpack bundle.
  serverExternalPackages: [
    "playwright",
    "@cloudflare/playwright",
    "better-sqlite3",
  ],

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("playwright", "@cloudflare/playwright", "better-sqlite3");
    }

    return config;
  },
};

export default nextConfig;
