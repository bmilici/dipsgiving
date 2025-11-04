import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav"; // ✅ Global navigation bar

/* --------------------------------------------------------------------------
   Fonts
-------------------------------------------------------------------------- */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/* --------------------------------------------------------------------------
   Metadata
-------------------------------------------------------------------------- */
const SITE = "https://www.dipsgiving.com"; 
// Once your domain is live, change this to: "https://dipsgiving.com"

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Dipsgiving",
  description: "Official Dipsgiving site — see you November 2025!",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico" }, // fallback
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#0f3b3a" }],
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
        alt: "Dipsgiving logo with chip and dip",
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

/* --------------------------------------------------------------------------
   Root Layout
-------------------------------------------------------------------------- */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-amber-50 text-orange-900`}
      >
        {/* 🔝 Global Navigation Bar */}
        <Nav />

        {/* 🔽 Page Content */}
        {children}
      </body>
    </html>
  );
}
