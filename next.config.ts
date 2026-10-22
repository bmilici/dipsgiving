// next.config.ts
import type { NextConfig } from "next";

// Review current source under /testing on development/preview builds. Explicit
// Vercel production builds keep the live site's existing routes and settings.
const developmentPreview =
  process.env.VERCEL_ENV !== "production" &&
  (process.env.VERCEL_ENV === "preview" ||
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DESIGN_PREVIEW === "true");

const rsvpLookupTesting = developmentPreview &&
  process.env.DIPSGIVING_RSVP_LOOKUP_TESTING === "true";

const nextConfig: NextConfig = {
  ...(developmentPreview ? { basePath: "/testing" } : {}),
  env: {
    NEXT_PUBLIC_DESIGN_PREVIEW: developmentPreview ? "true" : "false",
    NEXT_PUBLIC_RSVP_LOOKUP_TESTING: rsvpLookupTesting ? "true" : "false",
  },
  eslint: {
    // ⚠️ Temporarily ignore ESLint errors in production builds
    ignoreDuringBuilds: true,
  },
  async headers() {
    if (developmentPreview) {
      // Next automatically prefixes this rule with /testing, like Link URLs.
      return [{
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      }, ...(rsvpLookupTesting ? [{
        source: "/api/rsvp",
        headers: [{ key: "Cache-Control", value: "no-store, private" }],
      }] : [])];
    }
    return [
      {
        source: "/testing/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/testing.txt",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/testing/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  async rewrites() {
    return {
      // Testing builds serve current App Router source, not the older static
      // snapshot. Production keeps all seven existing export rewrites.
      beforeFiles: developmentPreview ? [] : [
        { source: "/testing", destination: "/testing/index.html" },
        { source: "/testing/register", destination: "/testing/register.html" },
        { source: "/testing/register/dip", destination: "/testing/register/dip.html" },
        { source: "/testing/dips", destination: "/testing/dips.html" },
        { source: "/testing/vote", destination: "/testing/vote.html" },
        { source: "/testing/winners", destination: "/testing/winners.html" },
        // Exported App Router navigation fetches the homepage payload here.
        { source: "/testing.txt", destination: "/testing/index.txt" },
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
