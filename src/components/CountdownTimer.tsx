"use client";

import { useEffect, useState } from "react";

type TimeLeft = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function calculateTimeLeft(targetDate: Date): TimeLeft {
  const difference = targetDate.getTime() - new Date().getTime();

  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-white/90 shadow-lg border border-orange-200/50 backdrop-blur-sm">
        <span className="text-2xl sm:text-3xl font-bold text-orange-800 tabular-nums">
          {value.toString().padStart(2, "0")}
        </span>
      </div>
      <span className="mt-2 text-xs sm:text-sm font-medium uppercase tracking-wide text-orange-600/80">
        {label}
      </span>
    </div>
  );
}

export default function CountdownTimer({ targetDate }: { targetDate: Date }) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() =>
    calculateTimeLeft(targetDate)
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(targetDate));
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center gap-3 sm:gap-4">
        {["Days", "Hours", "Mins", "Secs"].map((label) => (
          <TimeUnit key={label} value={0} label={label} />
        ))}
      </div>
    );
  }

  const isEventPassed =
    timeLeft.days === 0 &&
    timeLeft.hours === 0 &&
    timeLeft.minutes === 0 &&
    timeLeft.seconds === 0;

  if (isEventPassed) {
    return (
      <div className="rounded-2xl bg-white/90 px-6 py-4 shadow-lg border border-orange-200/50 backdrop-blur-sm">
        <p className="text-lg font-bold text-orange-800">
          The event has started!
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-4">
      <TimeUnit value={timeLeft.days} label="Days" />
      <TimeUnit value={timeLeft.hours} label="Hours" />
      <TimeUnit value={timeLeft.minutes} label="Mins" />
      <TimeUnit value={timeLeft.seconds} label="Secs" />
    </div>
  );
}
