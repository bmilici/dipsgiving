"use client";

import Link from "next/link";
import Sponsors from "@/components/Sponsors";
import { useEventSettings } from "@/lib/eventSettings";
import { Calendar, Clock, MapPin, MessageCircle } from "lucide-react";

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white/90 px-5 py-4 shadow-sm border border-orange-100">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
        {icon}
      </div>
      <div className="text-left">
        <p className="text-xs uppercase tracking-wide text-orange-600/80 font-medium">
          {label}
        </p>
        <p className="text-lg font-bold text-orange-800">{value}</p>
      </div>
    </div>
  );
}

export default function Page() {
  const eventSettings = useEventSettings();

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 via-amber-50 to-orange-50">
      {/* Hero */}
      <section className="relative mx-auto max-w-4xl px-4 py-12 sm:py-16 lg:py-20">
        <div className="text-center mb-10">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-orange-600">
            {eventSettings.eventNumberLabel}
          </p>
          <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-orange-900 sm:text-5xl lg:text-6xl text-balance">
            {eventSettings.eventName}
          </h1>
          <p className="text-lg text-orange-700/80 max-w-md mx-auto">
            Bring a bathing suit and a dip. We have the booze and dippers.
          </p>
        </div>

        {/* Info Cards */}
        <div className="mx-auto mb-10 grid max-w-lg grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoCard
            icon={<Calendar className="h-5 w-5" />}
            label="Date"
            value={eventSettings.dateLabel}
          />
          <InfoCard
            icon={<Clock className="h-5 w-5" />}
            label="Time"
            value={eventSettings.timeLabel}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-8 py-4 text-lg font-semibold text-white shadow-md hover:bg-orange-700 hover:shadow-lg transition-all active:scale-[0.98]"
          >
            RSVP Now
          </Link>
          <Link
            href="/register/dip"
            className="inline-flex items-center justify-center rounded-xl bg-white px-8 py-4 text-lg font-semibold text-orange-700 shadow-md border-2 border-orange-200 hover:bg-orange-50 hover:border-orange-300 transition-all active:scale-[0.98]"
          >
            Register Your Dip
          </Link>
        </div>
      </section>

      {/* Event Details */}
      <section className="bg-[#0f3b3a] py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-[#f9e7b1] mb-4">
              Event Details
            </h2>
            <p className="text-emerald-100/85 max-w-lg mx-auto text-pretty">
              Join us for an unforgettable celebration of dips. One form per dip, please!
            </p>
          </div>

          {/* Details Grid */}
          <div className="grid gap-6 sm:grid-cols-2 max-w-2xl mx-auto">
            {/* Location Card */}
            <a
              href="https://maps.google.com/?q=10600+Highgrove+Place+Fort+Myers+Florida+33913"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-4 rounded-2xl bg-white/10 backdrop-blur-sm p-5 hover:bg-white/15 transition-all border border-white/10"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-300/20 text-amber-300">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-300/90 mb-1">Location</p>
                <p className="text-[#f9e7b1] font-medium group-hover:text-amber-200 transition-colors">
                  10600 Highgrove Place
                </p>
                <p className="text-emerald-100/70 text-sm">
                  Fort Myers, Florida 33913
                </p>
                <p className="text-amber-300/80 text-sm mt-2 font-medium">
                  Gate Code: 18445
                </p>
              </div>
            </a>

            {/* Contact Card */}
            <a
              href="sms:+13016611626"
              className="group flex items-start gap-4 rounded-2xl bg-white/10 backdrop-blur-sm p-5 hover:bg-white/15 transition-all border border-white/10"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-300/20 text-amber-300">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-300/90 mb-1">Questions?</p>
                <p className="text-[#f9e7b1] font-medium group-hover:text-amber-200 transition-colors">
                  Contact Erika
                </p>
                <p className="text-emerald-100/70 text-sm">
                  (301) 661-1626
                </p>
                <p className="text-amber-300/80 text-sm mt-2">
                  Tap to send a text
                </p>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* Sponsors */}
      <Sponsors />

      {/* Footer */}
      <footer className="border-t border-orange-200/60 bg-white/80 py-8">
        <p className="text-center text-sm text-orange-800/70">
          dipsgiving.com &bull; {new Date().getFullYear()}
        </p>
      </footer>
    </main>
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
