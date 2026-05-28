// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ⚠️ Temporarily ignore ESLint errors in production builds
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        {
          source: "/NicoGames",
          destination: "/NicoGames/index.html",
        },
        {
          source: "/Games",
          destination: "/Games/index.html",
        },
        {
          source: "/games",
          destination: "/Games/index.html",
        },
        {
          source: "/dev/games",
          destination: "/dev/games/index.html",
        },
        {
          source: "/FirstGradeMath",
          destination: "/FirstGradeMath/index.html",
        },
        {
          source: "/firstgrademath",
          destination: "/FirstGradeMath/index.html",
        },
        {
          source: "/CheetahSafariAdventure",
          destination: "/CheetahSafariAdventure/index.html",
        },
        {
          source: "/cheetahsafariadventure",
          destination: "/CheetahSafariAdventure/index.html",
        },
        {
          source: "/TitanicAdventureAcademy",
          destination: "/TitanicAdventureAcademy/index.html",
        },
        {
          source: "/titanicadventureacademy",
          destination: "/TitanicAdventureAcademy/index.html",
        },
        {
          source: "/DesmondGame",
          destination: "/DesmondGame/index.html",
        },
        {
          source: "/desmondgame",
          destination: "/DesmondGame/index.html",
        },
      ],
    };
  },
};

export default nextConfig;
