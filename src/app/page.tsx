"use client";

import Link from "next/link";
import Sponsors from "@/components/Sponsors"; // ✅ NEW
import { useEventSettings } from "@/lib/eventSettings";

function Pill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-white/90 px-5 py-3 text-center shadow-sm">
      <div className="text-2xl font-bold text-orange-700">{value}</div>
      <div className="text-xs uppercase tracking-wide text-orange-600/80">
        {label}
      </div>
    </div>
  );
}

export default function Page() {
  const eventSettings = useEventSettings();

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50">
      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 text-center">
        <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-orange-900 sm:text-5xl">
          {eventSettings.eventName}
        </h1>
        <p className="mb-8 text-orange-800/85">
          Date and time {eventSettings.dateLabel === "TBD" ? "TBD" : "announced"}.
        </p>

        <div className="mx-auto mb-8 grid max-w-xl grid-cols-2 gap-3">
          <Pill label="Date" value={eventSettings.dateLabel} />
          <Pill label="Time" value={eventSettings.timeLabel} />
        </div>

        {/* Two buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Link
            href="/register"
            className="rounded-xl bg-orange-600 px-8 py-3 text-lg font-semibold text-white shadow-sm hover:bg-orange-700 transition"
          >
            RSVP
          </Link>
          <Link
            href="/register/dip"
            className="rounded-xl bg-amber-100 px-8 py-3 text-lg font-semibold text-orange-800 shadow-sm hover:bg-amber-200 transition"
          >
            Register Dip (Already RSVP’d)
          </Link>
        </div>
      </section>

      {/* About */}
      <section className="border-t border-amber-200/20 bg-[#0f3b3a] py-14 text-[#f9e7b1]">
        <div className="mx-auto max-w-5xl px-4 space-y-6 text-center">
          <p className="tracking-[0.2em] text-xs text-amber-300/90 uppercase">
            {eventSettings.eventNumberLabel}
          </p>
          <h2 className="text-4xl sm:text-5xl font-semibold leading-tight">
            Dipsgiving
          </h2>
          <p className="text-emerald-100/85">
            Bring a bathing suit &amp; a dip —
            <span className="font-medium"> we have the booze &amp; dippers</span>.
            One form per dip, please!
          </p>
          <p className="text-emerald-100/85">
            For questions please reach out to Erika at{" "}
            <a
              href="sms:+13016611626"
              className="underline decoration-amber-300/70 hover:decoration-amber-300"
            >
              (301) 661-1626{" "}
            </a>
            .
          </p>
          <p className="text-emerald-100/85">
            Location:{" "}
            <a
              href="https://maps.google.com/?q=10600+Highgrove+Place+Fort+Myers+Florida+33913"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-amber-300/70 hover:decoration-amber-300"
            >
              10600 Highgrove Place, Fort Myers, Florida 33913
            </a>
          </p>
          {/* Gate code */}
          <p className="text-sm text-amber-300/90 font-medium tracking-wide">
            Gate Code: <span className="text-[#f9e7b1]">18445</span>
          </p>
        </div>
      </section>

      {/* ✅ Sponsors go here, between About and footer */}
      <Sponsors />

      <footer className="border-t border-orange-200/60 bg-white/60 py-8">
        <p className="text-center text-sm text-orange-800/70">
          dipsgiving.com • © {new Date().getFullYear()}
        </p>
      </footer>
    </main>
  );
}
