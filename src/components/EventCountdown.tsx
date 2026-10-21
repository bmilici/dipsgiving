"use client";

import { useEffect, useState } from "react";
import { type CountdownParts, getCountdownParts } from "@/lib/eventSchedule";

const units = ["days", "hours", "minutes", "seconds"] as const;

export default function EventCountdown() {
  // Matching placeholders on the server and first client render avoid hydration
  // differences caused by the time between rendering and loading the page.
  const [countdown, setCountdown] = useState<CountdownParts | null>(null);

  useEffect(() => {
    const update = () => {
      const nextCountdown = getCountdownParts(Date.now());
      setCountdown(nextCountdown);
      if (nextCountdown.hasStarted) window.clearInterval(interval);
    };
    const interval = window.setInterval(update, 1_000);
    update();
    return () => window.clearInterval(interval);
  }, []);

  return (
    <section
      aria-label="Event countdown"
      className="mx-auto w-full max-w-3xl px-5 py-9 text-center text-[#324F3C] sm:px-8 sm:py-12"
    >
      <p className="mb-4 text-[0.65rem] font-bold uppercase tracking-[0.22em] sm:text-xs">
        Counting down to the showdown
      </p>

      {countdown?.hasStarted ? (
        <p className="font-display text-2xl text-[#B84A2B] sm:text-4xl">
          LET THE DIPPING BEGIN!
        </p>
      ) : (
        <div
          role="timer"
          aria-live="off"
          aria-label={
            countdown
              ? `${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds until Dipsgiving`
              : "Loading countdown to Dipsgiving"
          }
          className="mx-auto grid max-w-md grid-cols-4 divide-x divide-[#324F3C]/20"
        >
          {units.map((unit) => (
            <div key={unit} aria-hidden="true" className="px-2 sm:px-4">
              <span className="block font-display text-3xl leading-none tabular-nums sm:text-5xl">
                {countdown ? String(countdown[unit]).padStart(2, "0") : "– –"}
              </span>
              <span className="mt-2 block text-[0.6rem] font-bold uppercase tracking-[0.14em] sm:text-xs">
                {unit}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Only announce the start, never every ticking second. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {countdown?.hasStarted ? "LET THE DIPPING BEGIN!" : ""}
      </p>
    </section>
  );
}
