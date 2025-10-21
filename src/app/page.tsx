"use client";

import { useEffect, useState } from "react";

// 👉 Set your exact date/time here (local time is fine)
const EVENT_TITLE = "4th Annual Dipsgiving";
const EVENT_DATE = new Date("2025-11-22T16:00:00"); // Sat Nov 22, 2025 @ 4:00 PM
// If you don’t know the exact time yet, you can use "2025-11-01T00:00:00"

function getTimeParts(target: Date) {
  const diff = +target - +new Date();
  if (diff <= 0) return { done: true, days: 0, hours: 0, minutes: 0, seconds: 0 };

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { done: false, days, hours, minutes, seconds };
}

export default function Page() {
  const [t, setT] = useState(getTimeParts(EVENT_DATE));

  useEffect(() => {
    const id = setInterval(() => setT(getTimeParts(EVENT_DATE)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-amber-50 to-orange-100 p-6">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-orange-700">
          {EVENT_TITLE}
        </h1>
        <p className="mt-3 text-lg text-orange-800/80">
          Website is being updated. See you in <span className="font-semibold">November 2025</span>!
        </p>
        <p className="mt-1 text-sm text-gray-600">{EVENT_DATE.toLocaleString()}</p>

        <div className="mt-8 grid grid-cols-4 gap-3">
          {["Days", "Hours", "Minutes", "Seconds"].map((label, i) => {
            const vals = [t.days, t.hours, t.minutes, t.seconds] as const;
            return (
              <div key={label} className="rounded-2xl bg-white/80 shadow p-4">
                <div className="text-4xl font-bold text-orange-700 tabular-nums">{vals[i]}</div>
                <div className="mt-1 text-xs uppercase tracking-wide text-gray-600">{label}</div>
              </div>
            );
          })}
        </div>

        {t.done && (
          <div className="mt-6 text-xl font-semibold text-green-700">
            🥳 It’s Dipsgiving day!
          </div>
        )}

        <div className="mt-10 text-xs text-gray-500">
          dipsgiving.com • © {new Date().getFullYear()}
        </div>
      </div>
    </main>
  );
}
