// next.config.ts
import type { NextConfig } from "next";

// Review current source under /testing on development/preview builds. Explicit
// Vercel production builds keep the live site's existing routes and settings.
// This explicit local-only review uses the normal routes and existing admin UI
// against a fixed demo emulator. Hosting environments can never enable it.
const localDemoReview = !process.env.VERCEL && !process.env.VERCEL_ENV &&
  process.env.DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST === "true";

const developmentPreview = !localDemoReview &&
  process.env.VERCEL_ENV !== "production" &&
  (process.env.VERCEL_ENV === "preview" ||
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DESIGN_PREVIEW === "true");

const rsvpLookupTesting = developmentPreview &&
  process.env.DIPSGIVING_RSVP_LOOKUP_TESTING === "true";

// The approved release uses the existing private production connection. Preview
// builds and inherited emulator settings must never activate live competition.
const productionMultiDip = process.env.VERCEL_ENV === "production" &&
  process.env.DIPSGIVING_RSVP_LOOKUP_PRODUCTION === "true" &&
  process.env.DIPSGIVING_MULTI_DIP_PRODUCTION === "true" &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "dipsgiving" &&
  !process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST;

const nextConfig: NextConfig = {
  ...(developmentPreview ? { basePath: "/testing" } : {}),
  env: {
    NEXT_PUBLIC_DESIGN_PREVIEW: developmentPreview ? "true" : "false",
    NEXT_PUBLIC_RSVP_LOOKUP_TESTING: rsvpLookupTesting ? "true" : "false",
    NEXT_PUBLIC_RSVP_LOCAL_DEMO: localDemoReview ? "true" : "false",
    NEXT_PUBLIC_RSVP_MULTI_DIP: productionMultiDip || (localDemoReview &&
      process.env.DIPSGIVING_MULTI_DIP_TESTING === "true" &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "demo-dipsgiving-rsvp-test") ? "true" : "false",
  },
  eslint: {
    // ⚠️ Temporarily ignore ESLint errors in production builds
    ignoreDuringBuilds: true,
  },
  async headers() {
    if (developmentPreview || localDemoReview) {
      // Next automatically adds the base path when this is a /testing build.
      return [{
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      }, {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, private" }],
      }];
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
      {
        source: "/api/rsvp",
        headers: [{ key: "Cache-Control", value: "no-store, private" }],
      },
      {
        source: "/api/dips",
        headers: [{ key: "Cache-Control", value: "no-store, private" }],
      },
      {
        source: "/api/vote",
        headers: [{ key: "Cache-Control", value: "no-store, private" }],
      },
      {
        source: "/api/champions",
        headers: [{ key: "Cache-Control", value: "no-store, private" }],
      },
      {
        source: "/api/admin/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, private" }],
      },
      {
        source: "/testing/api/dips",
        headers: [{ key: "Cache-Control", value: "no-store, private" }],
      },
    ];
  },
  async rewrites() {
    return {
      // Testing builds serve current App Router source, not the older static
      // snapshot. Production keeps all seven existing export rewrites.
      beforeFiles: developmentPreview ? [] : [
        { source: "/testing/api/dips", destination: "/api/dips" },
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
