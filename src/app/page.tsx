"use client";

import Link from "next/link";
import Image from "next/image";
import Sponsors from "@/components/Sponsors";
import CountdownTimer from "@/components/CountdownTimer";
import { useEventSettings } from "@/lib/eventSettings";
import { Calendar, Clock, MapPin, MessageCircle, Sparkles } from "lucide-react";

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

// Set the target date for the countdown (adjust as needed)
const EVENT_DATE = new Date("2026-11-21T14:00:00");

export default function Page() {
  const eventSettings = useEventSettings();

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 via-amber-50 to-orange-50">
      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-4 py-12 sm:py-16 lg:py-20 overflow-hidden">
        {/* Animated decorative elements */}
        <div className="absolute top-10 left-10 h-3 w-3 rounded-full bg-orange-300 animate-pulse opacity-60" />
        <div className="absolute top-20 right-16 h-2 w-2 rounded-full bg-amber-400 animate-pulse opacity-50" style={{ animationDelay: "0.5s" }} />
        <div className="absolute bottom-32 left-20 h-4 w-4 rounded-full bg-orange-200 animate-pulse opacity-40" style={{ animationDelay: "1s" }} />
        <div className="absolute bottom-20 right-10 h-2 w-2 rounded-full bg-amber-300 animate-pulse opacity-60" style={{ animationDelay: "1.5s" }} />

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left: Text Content */}
          <div className="text-center lg:text-left order-2 lg:order-1">
            <div className="inline-flex items-center gap-2 mb-4 rounded-full bg-orange-100 px-4 py-1.5 text-sm font-medium text-orange-700">
              <Sparkles className="h-4 w-4" />
              <span>{eventSettings.eventNumberLabel}</span>
            </div>
            
            <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-orange-900 sm:text-5xl lg:text-6xl text-balance animate-fade-in">
              {eventSettings.eventName}
            </h1>
            
            <p className="text-lg text-orange-700/80 max-w-md mx-auto lg:mx-0 mb-8 leading-relaxed">
              Bring a bathing suit and a dip. We have the booze and dippers. Join us for an epic celebration of the finest dips!
            </p>

            {/* Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
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
            <div className="flex flex-col sm:flex-row justify-center lg:justify-start gap-3 sm:gap-4">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-8 py-4 text-lg font-semibold text-white shadow-md hover:bg-orange-700 hover:shadow-lg transition-all active:scale-[0.98] hover:-translate-y-0.5"
              >
                RSVP Now
              </Link>
              <Link
                href="/register/dip"
                className="inline-flex items-center justify-center rounded-xl bg-white px-8 py-4 text-lg font-semibold text-orange-700 shadow-md border-2 border-orange-200 hover:bg-orange-50 hover:border-orange-300 transition-all active:scale-[0.98] hover:-translate-y-0.5"
              >
                Register Your Dip
              </Link>
            </div>
          </div>

          {/* Right: Hero Image */}
          <div className="order-1 lg:order-2 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-md lg:max-w-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-200/40 to-amber-200/40 rounded-3xl blur-3xl transform -rotate-6 scale-95" />
              <Image
                src="/hero-dip.png"
                alt="A festive bowl of dip surrounded by tortilla chips"
                width={500}
                height={500}
                className="relative rounded-3xl shadow-2xl transform hover:scale-[1.02] transition-transform duration-500"
                priority
              />
            </div>
          </div>
        </div>

        {/* Countdown Section */}
        <div className="mt-12 lg:mt-16 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-orange-600 mb-4">
            Countdown to Dipsgiving
          </p>
          <CountdownTimer targetDate={EVENT_DATE} />
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
