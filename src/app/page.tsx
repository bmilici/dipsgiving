"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/* Countdown hook */
const targetDate = new Date("2025-11-22T16:00:00-05:00");
function useCountdown(to: Date) {
  const [ms, setMs] = useState(() => Math.max(0, +to - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setMs(Math.max(0, +to - Date.now())), 1000);
    return () => clearInterval(id);
  }, [to]);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const seconds = Math.floor((ms / 1000) % 60);
  return { days, hours, minutes, seconds };
}

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

export default function HomePage() {
  const { days, hours, minutes, seconds } = useCountdown(targetDate);

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-orange-200/60 bg-white/70 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-semibold text-orange-900">
            Dipsgiving
          </Link>
          <ul className="flex gap-5 text-sm font-medium text-orange-800/90">
            <li>
              <a href="#about" className="hover:text-orange-900">
                About
              </a>
            </li>
            <li>
              <Link href="/register" className="hover:text-orange-900">
                Register
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-4 pb-10 pt-14">
        <h1 className="mb-2 text-center text-4xl font-extrabold tracking-tight text-orange-900 sm:text-5xl">
          4th Annual Dipsgiving
        </h1>
        <p className="mb-8 text-center text-orange-800/85">
          See you on November 22nd at 4PM, 2025!
        </p>

        <div className="mx-auto grid max-w-2xl grid-cols-4 gap-3">
          <Pill label="Days" value={days} />
          <Pill label="Hours" value={hours} />
          <Pill label="Minutes" value={minutes} />
          <Pill label="Seconds" value={seconds} />
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            href="/register"
            className="rounded-2xl bg-orange-700 px-6 py-3 text-white text-lg font-medium shadow hover:bg-orange-800 transition"
          >
            Register Your Dip
          </Link>
        </div>
      </section>

      {/* About */}
      <section
        id="about"
        className="scroll-mt-24 border-t border-amber-200/20 bg-[#0f3b3a] py-14 text-[#f9e7b1]"
      >
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-4 sm:grid-cols-3">
          <div className="sm:col-span-1 flex items-start justify-center sm:justify-start">
            <div className="relative">
              <span className="text-8xl drop-shadow-[0_6px_16px_rgba(0,0,0,0.35)]">
                🏆
              </span>
              <div className="absolute -inset-3 -z-10 rounded-full bg-amber-400/10 blur-xl" />
            </div>
          </div>

          <div className="sm:col-span-2 space-y-6">
            <header className="space-y-2">
              <p className="tracking-[0.2em] text-xs text-amber-300/90 uppercase">
                4th Annual
              </p>
              <h2 className="text-4xl sm:text-5xl font-semibold leading-tight">
                Dipsgiving
              </h2>
              <p className="text-emerald-100/85">
                Bring a bathing suit &amp; a dip—{" "}
                <span className="font-medium">we have the booze &amp; dippers</span>.{" "}
                One form per dip, please!
              </p>
            </header>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-2xl border border-amber-300/30 bg-white/5 p-4">
                <div className="text-amber-300/90 text-xs uppercase tracking-wide">
                  Saturday
                </div>
                <div className="text-lg font-semibold">Nov 22 @ 4PM</div>
              </div>
              <div className="rounded-2xl border border-amber-300/30 bg-white/5 p-4">
                <div className="text-amber-300/90 text-xs uppercase tracking-wide">
                  Location
                </div>
                <div className="text-lg font-semibold">
                  10600 Highgrove Pl, Ft Myers 33913
                </div>
              </div>
            </div>

            <p className="text-sm text-amber-200/85">
              <span className="tracking-wide uppercase text-amber-300/90">
                Suggested serving size:
              </span>{" "}
              10–15 people
            </p>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-2xl border border-amber-300/30 bg-white/5 p-4">
                <div className="text-amber-300/90 text-xs uppercase tracking-wide">
                  Best Dip Receives
                </div>
                <div className="text-lg font-semibold">
                  The First Annual “Big Dipper” Trophy
                </div>
              </div>
              <div className="rounded-2xl border border-amber-300/30 bg-white/5 p-4">
                <div className="text-amber-300/90 text-xs uppercase tracking-wide">
                  Kids
                </div>
                <div className="text-lg font-semibold">There will be a babysitter</div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-emerald-50">
              <p className="text-center text-sm sm:text-base">
                Text{" "}
                <span className="font-semibold tracking-wide">
                  301-661-1626
                </span>{" "}
                for the link to reserve your dip.
              </p>
            </div>
          </div>
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
