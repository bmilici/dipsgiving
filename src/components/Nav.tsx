"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

export default function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Home" },
    { href: "/register", label: "RSVP" },
    { href: "/register/dip", label: "Register Dip" },
    { href: "/dips", label: "Dip List" },
    { href: "/vote", label: "Vote" },
    { href: "/winners", label: "Champions" },
    { href: "/drinkemon", label: "Drinkemon" },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-orange-800/95 backdrop-blur-sm text-amber-50 shadow-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 lg:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="text-xl font-bold tracking-wide hover:text-amber-200 transition-colors"
        >
          Dipsgiving
        </Link>

        {/* Mobile Menu Button */}
        <button
          className="lg:hidden p-2 rounded-lg hover:bg-orange-700/50 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-200/50"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>

        {/* Desktop Links */}
        <div className="hidden lg:flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                pathname === link.href
                  ? "bg-amber-200/20 text-amber-200"
                  : "hover:bg-orange-700/50 hover:text-amber-200"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Mobile Dropdown */}
      <div
        className={`lg:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="bg-orange-700/90 backdrop-blur-sm px-4 py-3 space-y-1 border-t border-orange-600/50">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-3 rounded-lg text-base font-medium transition-all ${
                pathname === link.href
                  ? "bg-amber-200/20 text-amber-200"
                  : "text-amber-50 hover:bg-orange-600/50 hover:text-amber-200"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
