// next.config.ts
import type { NextConfig } from "next";

// This branch is reviewed under /testing on development deployments only.
// An explicit production deployment always retains the normal routes and mode.
const developmentPreview =
  process.env.VERCEL_ENV !== "production" &&
  (process.env.VERCEL_ENV === "preview" ||
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DESIGN_PREVIEW === "true");

const nextConfig: NextConfig = {
  basePath: developmentPreview ? "/testing" : "",
  env: {
    NEXT_PUBLIC_DESIGN_PREVIEW: developmentPreview ? "true" : "false",
  },
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
