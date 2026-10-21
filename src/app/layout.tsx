import type { Metadata } from "next";
import { Bree_Serif, Cinzel, DM_Sans, Geist_Mono, Inter, Libre_Franklin } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { EVENT_YEAR } from "@/lib/eventSchedule";

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

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Dipsgiving — The Ultimate Dip Showdown",
  description: `Join the 5th Annual Dipsgiving on December 5, ${EVENT_YEAR} at 4 PM in Fort Myers, Florida. Bring a dip, taste the competition, and cheer on your favorites.`,
  icons: {
    icon: [
      { url: "/favicon-dipsgiving.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    other: [{ rel: "manifest", url: "/site.webmanifest" }],
  },
  openGraph: {
    title: "Dipsgiving",
    description: "Celebrate the art of dip — one scoop at a time.",
    url: SITE,
    siteName: "Dipsgiving",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Dipsgiving — The Ultimate Dip Showdown",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dipsgiving",
    description: "Celebrate the art of dip — one scoop at a time.",
    images: ["/og-image.png"],
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
        <Nav />
        <div id="main-content" tabIndex={-1}>{children}</div>
        <Footer />
      </body>
    </html>
  );
}
