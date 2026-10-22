import type { Metadata } from "next";
import { Bree_Serif, Cinzel, DM_Sans, Geist_Mono, Inter, Libre_Franklin } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { EVENT_YEAR } from "@/lib/eventSchedule";
import { isTestingMode, testingAssetPath } from "@/lib/testingMode";
import { isRsvpLookupTestingEnabled } from "@/lib/rsvp/testing";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const breeSerif = Bree_Serif({
  variable: "--font-bree-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["700"],
});

const libreFranklin = Libre_Franklin({
  variable: "--font-libre-franklin",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400"],
});

const SITE = "https://dipsgiving.com";
const isLocalDemoReview = process.env.NEXT_PUBLIC_RSVP_LOCAL_DEMO === "true";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  ...(isTestingMode || isLocalDemoReview ? { robots: { index: false, follow: false } } : {}),
  title: "Dipsgiving — The Ultimate Dip Showdown",
  description: `Join the 5th Annual Dipsgiving on December 5, ${EVENT_YEAR} at 4 PM in Fort Myers, Florida. Bring a dip, taste the competition, and cheer on your favorites.`,
  icons: {
    icon: [
      { url: testingAssetPath("/favicon-dipsgiving.ico") },
      { url: testingAssetPath("/favicon.svg"), type: "image/svg+xml" },
      { url: testingAssetPath("/favicon-96x96.png"), type: "image/png", sizes: "96x96" },
    ],
    apple: [{ url: testingAssetPath("/apple-touch-icon.png"), sizes: "180x180" }],
    other: [{ rel: "manifest", url: testingAssetPath("/site.webmanifest") }],
  },
  openGraph: {
    title: "Dipsgiving",
    description: "Celebrate the art of dip — one scoop at a time.",
    url: SITE,
    siteName: "Dipsgiving",
    images: [
      {
        url: "/og-image-5th-2026.png",
        width: 1536,
        height: 1024,
        alt: "5th Annual Dipsgiving — December 5, 2026",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dipsgiving",
    description: "Celebrate the art of dip — one scoop at a time.",
    images: ["/og-image-5th-2026.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${breeSerif.variable} ${geistMono.variable} ${cinzel.variable} ${libreFranklin.variable} ${inter.variable} antialiased bg-background text-foreground`}
      >
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-5 focus:py-3 focus:text-espresso">Skip to content</a>
        {isLocalDemoReview && (
          <aside className="border-b border-forest/15 bg-gold px-4 py-2.5 text-center text-xs leading-relaxed text-espresso sm:text-sm" aria-label="Local development notice">
            Development preview — demo data only.
          </aside>
        )}
        {isTestingMode && (
          <aside className="border-b border-forest/15 bg-gold px-4 py-2.5 text-center text-xs leading-relaxed text-espresso sm:text-sm" aria-label="Design preview notice">
            <strong>Design preview</strong> — {isRsvpLookupTestingEnabled
              ? "RSVP changes are for testing only. Voting is disabled."
              : "submissions and voting are disabled."}
          </aside>
        )}
        <Nav />
        <div id="main-content" tabIndex={-1}>{children}</div>
        <Footer />
      </body>
    </html>
  );
}
