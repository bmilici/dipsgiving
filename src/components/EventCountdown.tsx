"use client";

import { useEffect, useState } from "react";
import {
  type CountdownParts,
  EVENT_START_ISO,
  getCountdownParts,
} from "@/lib/eventSchedule";

const units = ["days", "hours", "minutes", "seconds"] as const;

export default function EventCountdown() {
  // The server and first client render show the same useful event information.
  // The effect replaces it immediately without comparing two different clocks
  // during hydration. It also remains useful when a clock cannot be read.
  const [countdown, setCountdown] = useState<CountdownParts | null>(null);

  useEffect(() => {
    let interval: number | undefined;
    const stop = () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
        interval = undefined;
      }
    };
    const update = () => {
      try {
        const nextCountdown = getCountdownParts(Date.now());
        setCountdown(nextCountdown);
        if (nextCountdown.hasStarted) stop();
        return !nextCountdown.hasStarted;
      } catch {
        stop();
        setCountdown(null);
        return false;
      }
    };
    // Initialize before scheduling so a failed clock or an event that has
    // already started never leaves an unnecessary interval running.
    if (update()) {
      try {
        interval = window.setInterval(update, 1_000);
      } catch {
        setCountdown(null);
      }
    }
    return stop;
  }, []);

  return (
    <section
      aria-label="Event countdown"
      className="mx-auto w-full max-w-3xl px-5 py-9 text-center text-[#324F3C] sm:px-8 sm:py-12"
    >
      <p className="mb-5 text-[0.65rem] font-bold uppercase tracking-[0.2em] sm:text-xs">
        Counting down to the showdown
      </p>

      {!countdown ? (
        <div className="mx-auto flex min-h-[8.5rem] max-w-xl flex-col items-center justify-center rounded-2xl border border-[#324F3C]/20 bg-[#F7EBD6] px-4 py-5">
          <time dateTime={EVENT_START_ISO} className="font-display text-2xl sm:text-3xl">
            December 5, 2026
          </time>
          <p className="mt-2 text-sm font-bold">4:00 PM Eastern Time</p>
        </div>
      ) : countdown.hasStarted ? (
        <p className="flex min-h-[8.5rem] items-center justify-center font-display text-2xl text-[#B84A2B] sm:text-4xl">
          LET THE DIPPING BEGIN!
        </p>
      ) : (
        <div
          role="timer"
          aria-live="off"
          aria-label={`${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds until Dipsgiving`}
          className="mx-auto grid min-h-[8.5rem] max-w-xl grid-cols-4 gap-2 sm:gap-3"
        >
          {units.map((unit) => (
            <div
              key={unit}
              aria-hidden="true"
              className="flex min-w-0 flex-col items-center justify-center rounded-xl border-t-[3px] border-[#E7AA42] bg-[#324F3C] px-1.5 py-5 text-[#F7EBD6] shadow-[0_3px_0_#223a2b] sm:rounded-2xl sm:px-4"
            >
              <span className="block font-display text-[clamp(1.875rem,6.2vw,3.5rem)] leading-none tabular-nums">
                {String(countdown[unit]).padStart(2, "0")}
              </span>
              <span className="mt-3 block text-[0.6rem] font-bold uppercase tracking-[0.1em] text-[#F7EBD6] sm:text-xs">
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
