"use client";

import Link from "next/link";
import Sponsors from "@/components/Sponsors";
import { useEventSettings } from "@/lib/eventSettings";
import { MapPin, MessageCircle } from "lucide-react";

export default function Page() {
  const eventSettings = useEventSettings();
  const annualLabel = eventSettings.eventNumberLabel.trim();
  const eventName = eventSettings.eventName.trim();
  const repeatedPrefix = `${annualLabel} `;
  const heroTitle = annualLabel && eventName.toLowerCase().startsWith(repeatedPrefix.toLowerCase())
    ? eventName.slice(repeatedPrefix.length).trim() || eventName
    : eventName;

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 via-amber-50 to-orange-50">
      {/* Hero */}
      <section className="relative mx-auto max-w-4xl px-4 py-12 sm:py-16 lg:py-20">
        <div className="text-center mb-8">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-orange-600">
            {annualLabel}
          </p>
          <h1 className="mb-6 text-[clamp(2.75rem,10.5vw,6.5rem)] font-extrabold leading-[1.04] tracking-[-0.045em] break-words text-orange-900">
            {heroTitle}
          </h1>
          <p className="text-lg text-orange-700/80 max-w-md mx-auto">
            Bring a bathing suit and a dip. We have the booze and dippers.
          </p>
        </div>

        {/* Compact event details */}
        <div className="mx-auto mb-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-base font-medium text-orange-800 sm:text-lg" aria-label="Event date, time, and location">
          <span>{eventSettings.dateLabel}</span>
          <span aria-hidden="true" className="text-orange-400">·</span>
          <span>{eventSettings.timeLabel}</span>
          <span aria-hidden="true" className="text-orange-400">·</span>
          <span>Fort Myers</span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-8 py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600"
          >
            RSVP Now
          </Link>
          <Link
            href="/register/dip"
            className="inline-flex items-center justify-center rounded-lg px-8 py-4 text-lg font-semibold text-orange-700 underline decoration-orange-300 underline-offset-8 transition-colors hover:text-orange-900 hover:decoration-orange-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600"
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
          <div className="grid gap-8 sm:grid-cols-2 sm:gap-12 max-w-2xl mx-auto">
            {/* Location */}
            <a
              href="https://maps.google.com/?q=10600+Highgrove+Place+Fort+Myers+Florida+33913"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-4 border-t border-white/20 pt-6 transition-colors hover:border-amber-300/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center text-amber-300">
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

            {/* Contact */}
            <a
              href="sms:+13016611626"
              className="group flex items-start gap-4 border-t border-white/20 pt-6 transition-colors hover:border-amber-300/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center text-amber-300">
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
