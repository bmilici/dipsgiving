// Keep the annual schedule in one place. The explicit offset identifies the
// event's instant even when a guest's device uses another time zone.
export const EVENT_YEAR = 2026;
export const EVENT_TIME_ZONE = "America/New_York";
export const EVENT_START_ISO = "2026-12-05T16:00:00-05:00";
export const EVENT_START_TIMESTAMP = Date.parse(EVENT_START_ISO);

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  hasStarted: boolean;
};

export function getCountdownParts(
  now: number,
  startsAt = EVENT_START_TIMESTAMP,
): CountdownParts {
  const remainingMilliseconds = startsAt - now;
  // Round up so the final second remains visible until the exact start.
  const remainingSeconds = Math.max(0, Math.ceil(remainingMilliseconds / 1_000));

  return {
    days: Math.floor(remainingSeconds / 86_400),
    hours: Math.floor((remainingSeconds % 86_400) / 3_600),
    minutes: Math.floor((remainingSeconds % 3_600) / 60),
    seconds: remainingSeconds % 60,
    hasStarted: remainingMilliseconds <= 0,
  };
}
