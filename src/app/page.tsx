"use client";

import { useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { RegisterModalHandle } from "@/components/RegisterModal";

// Lazy load modal client-side only
const RegisterModal = dynamic(() => import("@/components/RegisterModal"), {
  ssr: false,
});

function Pill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-white/90 px-5 py-3 text-center shadow-sm">
      <div className="text-3xl font-bold text-orange-700">{value}</div>
      <div className="text-xs uppercase tracking-wide text-orange-600/80">
        {label}
      </div>
    </div>
  );
}

export default function Page() {
  const registerRef = useRef<RegisterModalHandle | null>(null);

  const targetDate = new Date("2025-11-22T16:00:00-05:00");
  const [ms, setMs] = useState(() => Math.max(0, +targetDate - Date.now()));

  useEffect(() => {
    const id = setInterval(() => setMs(Math.max(0, +targetDate - Date.now())), 1000);
    return () => clearInterval(id);
  }, []);

  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const seconds = Math.floor((ms / 1000) % 60);

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50">
      <header className="sticky top-0 z-20 border-b border-orange-200/60 bg-white/70 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="#" className="text-lg font-semibold text-orange-900">
            Dipsgiving
          </a>
        </nav>
      </header>

      {/* Hero Section with Countdown */}
      <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 text-center">
        <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-orange-900 sm:text-5xl">
          4th Annual Dipsgiving
        </h1>
        <p className="mb-8 text-orange-800/85">
          See you on November 22nd at 4PM, 2025!
        </p>

        <div className="mx-auto mb-8 grid max-w-2xl grid-cols-4 gap-3">
          <Pill label="Days" value={days} />
          <Pill label="Hours" value={hours} />
          <Pill label="Minutes" value={minutes} />
          <Pill label="Seconds" value={seconds} />
        </div>

        {/* 🔸 Two Main Buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <button
            onClick={() => registerRef.current?.open(false)}
            className="rounded-xl bg-orange-600 px-8 py-3 text-lg font-semibold text-white shadow-sm hover:bg-orange-700 transition"
          >
            RSVP
          </button>

          <button
            onClick={() => registerRef.current?.open(true)}
            className="rounded-xl bg-amber-100 px-8 py-3 text-lg font-semibold text-orange-800 shadow-sm hover:bg-amber-200 transition"
          >
            Register Dip(Already RSVP’d)
          </button>
        </div>
      </section>

      {/* Attach the Modal */}
      <RegisterModal ref={registerRef} />

      {/* About Section */}
      <section className="border-t border-amber-200/20 bg-[#0f3b3a] py-14 text-[#f9e7b1]">
        <div className="mx-auto max-w-5xl px-4 space-y-6 text-center">
          <p className="tracking-[0.2em] text-xs text-amber-300/90 uppercase">
            4th Annual
          </p>
          <h2 className="text-4xl sm:text-5xl font-semibold leading-tight">
            Dipsgiving
          </h2>
          <p className="text-emerald-100/85">
            Bring a bathing suit &amp; a dip —{" "}
            <span className="font-medium">we have the booze &amp; dippers</span>.
            One form per dip, please!
          </p>
        </div>
      </section>

      <footer className="border-t border-orange-200/60 bg-white/60 py-8">
        <p className="text-center text-sm text-orange-800/70">
          dipsgiving.com • © {new Date().getFullYear()}
        </p>
      </footer>
    </main>
  );
}
