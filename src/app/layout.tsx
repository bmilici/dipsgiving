import type { Metadata } from "next";
import { Cinzel, Geist, Geist_Mono, Inter, Libre_Franklin } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav"; // ⬅️ bring back the top tabs

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
  title: "Dipsgiving",
  description: "Official Dipsgiving site — date and time TBD.",
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
        alt: "Dipsgiving — 5th Annual Celebration of Dips",
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
        className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${libreFranklin.variable} ${inter.variable} antialiased bg-amber-50 text-orange-900`}
      >
        {/* Global tabs: About / RSVP / Register / Dip List */}
        <Nav />

        {children}
      </body>
    </html>
  );
}
