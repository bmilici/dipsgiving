// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ⚠️ Temporarily ignore ESLint errors in production builds
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/Testing/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/Testing.txt",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/Testing", destination: "/Testing/index.html" },
        { source: "/Testing/register", destination: "/Testing/register.html" },
        { source: "/Testing/register/dip", destination: "/Testing/register/dip.html" },
        { source: "/Testing/dips", destination: "/Testing/dips.html" },
        { source: "/Testing/vote", destination: "/Testing/vote.html" },
        { source: "/Testing/winners", destination: "/Testing/winners.html" },
        // Exported App Router navigation fetches the homepage payload here.
        { source: "/Testing.txt", destination: "/Testing/index.txt" },
      ],
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
