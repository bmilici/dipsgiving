"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

export default function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const links = [
    { href: "/", label: "About" },
    { href: "/register", label: "RSVP" },
    { href: "/register/dip", label: "Register" },
    { href: "/dips", label: "Dip List" },
  ];

  return (
    <nav className="bg-orange-800 text-amber-50 shadow-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link href="/" className="text-lg font-bold tracking-wide">
          Dipsgiving
        </Link>

        {/* Mobile Menu Button */}
        <button
          className="sm:hidden text-amber-100 focus:outline-none"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? "✕" : "☰"}
        </button>

        {/* Desktop Links */}
        <div className="hidden sm:flex gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`transition-colors ${
                pathname === link.href
                  ? "text-amber-200 font-semibold underline underline-offset-4"
                  : "hover:text-amber-200"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Mobile Dropdown */}
      {open && (
        <div className="sm:hidden bg-orange-700 px-4 pb-3 space-y-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`block py-1 ${
                pathname === link.href
                  ? "text-amber-200 font-semibold underline underline-offset-4"
                  : "text-amber-50 hover:text-amber-200"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
