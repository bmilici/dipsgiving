"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";

const competitionLinks = [
  { href: "/dips", label: "Dip List" },
  { href: "/vote", label: "Vote" },
  { href: "/winners", label: "Champions" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const linkStyle = "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-[#eee6d9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b74727]";
  return (
    <nav aria-label="Main navigation" className="sticky top-0 z-50 border-b border-[#ded3c2] bg-[#faf6ed]/95 text-[#35291f] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-8">
        <Link href="/" onClick={() => setOpen(false)} className="text-xl font-extrabold tracking-tight">Dipsgiving<span className="text-[#b74727]">.</span></Link>
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className={linkStyle}>Home</Link>
          <Link href="/register/dip" aria-current={pathname === "/register/dip" ? "page" : undefined} className={linkStyle}>Register a dip</Link>
          <details className="group relative" onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }}>
            <summary className={`${linkStyle} flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden`}>The Competition <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
            <div className="absolute right-0 top-full mt-3 w-48 rounded-xl border border-[#ded3c2] bg-[#faf6ed] p-2 shadow-lg">
              {competitionLinks.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={event => event.currentTarget.closest("details")?.removeAttribute("open")} className={`${linkStyle} block`}>{link.label}</Link>)}
            </div>
          </details>
          <Link href="/register" aria-current={pathname === "/register" ? "page" : undefined} className="ml-2 rounded-full bg-[#b74727] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#94391f] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b74727]">RSVP Now</Link>
        </div>
        <button type="button" onClick={() => setOpen(!open)} aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" className="rounded-lg p-2 hover:bg-[#eee6d9] md:hidden">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>
      {open && <div id="mobile-navigation" className="border-t border-[#ded3c2] px-6 pb-5 pt-3 md:hidden">
        <Link href="/" onClick={() => setOpen(false)} className={`${linkStyle} block`}>Home</Link>
        <Link href="/register/dip" onClick={() => setOpen(false)} className={`${linkStyle} block`}>Register a dip</Link>
        <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-widest text-[#706052]">The Competition</p>
        {competitionLinks.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={() => setOpen(false)} className={`${linkStyle} block`}>{link.label}</Link>)}
        <Link href="/register" onClick={() => setOpen(false)} className="mt-4 block rounded-full bg-[#b74727] px-5 py-3 text-center text-sm font-semibold text-white hover:bg-[#94391f]">RSVP Now</Link>
      </div>}
    </nav>
  );
}
