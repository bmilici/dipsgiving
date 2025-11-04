import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE = "https://dipsgiving.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Dipsgiving",
  description: "Official Dipsgiving site — see you November 22nd, 2025!",
  icons: {
    icon: [
      { url: "/favicon.svg?v=4", type: "image/svg+xml" }, // main full-color favicon
      { url: "/favicon.png?v=4", type: "image/png" },      // backup
      { url: "/favicon.ico?v=4" },                         // legacy fallback
    ],
    apple: [
      { url: "/apple-touch-icon.png?v=4", sizes: "180x180", type: "image/png" },
    ],
    other: [
      // optional monochrome Safari version; OK to keep since you have this file
      { rel: "mask-icon", url: "/safari-pinned-tab.svg?v=4", color: "#0f3b3a" },
    ],
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
        alt: "Dipsgiving 4th Annual — Celebrate the art of dip!",
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
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
