// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ⚠️ Temporarily ignore ESLint errors in production builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
