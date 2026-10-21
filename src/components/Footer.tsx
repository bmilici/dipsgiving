import Link from "next/link";
import { EVENT_YEAR } from "@/lib/eventSchedule";
import { siteNavigation } from "@/lib/siteNavigation";

export default function Footer() {
  return (
    <footer className="border-t-4 border-gold bg-forest text-cream">
      <div className="festival-container pb-6 pt-10 sm:pb-7 sm:pt-12">
        <div className="flex flex-col gap-7 border-b border-cream/20 pb-7 md:flex-row md:items-start md:justify-between md:gap-12">
          <div>
            <Link
              href="/"
              aria-label="Dipsgiving home"
              className="inline-flex min-h-11 items-center rounded-lg font-display text-4xl tracking-tight transition-colors hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
            >
              Dipsgiving<span aria-hidden="true" className="ml-0.5 text-gold">.</span>
            </Link>
            <p className="mt-3 text-sm text-cream/85 sm:text-base">
              Made with love. Served with chips.
            </p>
          </div>

          <nav aria-label="Footer navigation" className="grid grid-cols-2 gap-x-7 gap-y-1 sm:grid-cols-3 sm:gap-x-9">
            {siteNavigation.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex min-h-11 items-center rounded-md text-sm font-medium transition-colors hover:underline hover:decoration-gold hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-2 pt-6 text-xs text-cream/75 sm:flex-row sm:items-center sm:justify-between sm:text-sm">
          <p>© {EVENT_YEAR} Dipsgiving.</p>
          <p className="text-cream/85">Good friends. Great dips. Bragging rights.</p>
        </div>
      </div>
    </footer>
  );
}
