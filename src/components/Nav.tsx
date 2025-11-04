"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();

  const linkClasses = (path: string) =>
    `px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 ${
      pathname === path
        ? "bg-orange-600 text-white"
        : "text-orange-800 hover:bg-orange-100"
    }`;

  return (
    <nav className="sticky top-0 z-50 bg-amber-50/95 backdrop-blur-md border-b border-orange-200">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-3">
        {/* Logo / Title */}
        <Link href="/" className="text-lg font-semibold text-orange-800">
          Dipsgiving
        </Link>

        {/* Tabs */}
        <div className="flex space-x-2">
          <Link href="/" className={linkClasses("/")}>
            About
          </Link>
          <Link href="/register" className={linkClasses("/register")}>
            RSVP
          </Link>
          <Link href="/register/dip" className={linkClasses("/register/dip")}>
            Register
          </Link>
          <Link href="/dips" className={linkClasses("/dips")}>
            Dip List
          </Link>
        </div>
      </div>
    </nav>
  );
}
