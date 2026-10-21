"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { siteNavigation } from "@/lib/siteNavigation";

export default function Nav() {
  const pathname = usePathname();
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const open = openPathname === pathname;

  useEffect(() => {
    setOpenPathname(null);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenPathname(null);
      menuButton.current?.focus();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function linkClass(href: string, mobile = false) {
    const active = pathname === href;
    const base = `inline-flex min-h-11 items-center rounded-full px-4 py-2.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold ${mobile ? "w-full justify-center" : "justify-center"}`;

    if (href === "/register") {
      return `${base} bg-burnt-orange text-white hover:bg-[#9f3f25] ${active ? "ring-2 ring-gold ring-offset-2 ring-offset-forest" : ""}`;
    }

    return `${base} ${active ? "bg-cream/10 text-cream underline decoration-gold decoration-2 underline-offset-8" : "text-cream hover:bg-cream/10 hover:underline hover:decoration-gold hover:underline-offset-8"}`;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-cream/15 bg-forest text-cream shadow-[0_3px_18px_rgba(43,36,32,0.08)]">
      <nav aria-label="Main navigation" className="festival-container">
        <div className="flex min-h-18 items-center justify-between gap-4 sm:min-h-20">
          <Link
            href="/"
            onClick={() => setOpenPathname(null)}
            className="inline-flex min-h-11 items-center rounded-lg font-display text-3xl tracking-tight transition-colors hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold sm:text-[2.1rem]"
            aria-label="Dipsgiving home"
          >
            Dipsgiving
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {siteNavigation.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={linkClass(link.href)}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <button
            ref={menuButton}
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-cream/30 transition-colors hover:border-gold hover:bg-cream/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold lg:hidden"
            onClick={() => setOpenPathname(open ? null : pathname)}
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>

        <div
          id="mobile-navigation"
          hidden={!open}
          className={`${open ? "festival-menu-enter" : ""} border-t border-cream/15 pb-5 pt-4 lg:hidden`}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {siteNavigation.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpenPathname(null)}
                aria-current={pathname === link.href ? "page" : undefined}
                className={linkClass(link.href, true)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </header>
  );
}
