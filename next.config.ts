// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ⚠️ Temporarily ignore ESLint errors in production builds
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: "/NicoGames",
        destination: "/NicoGames/index.html",
      },
    ];
  },
};

export default nextConfig;
