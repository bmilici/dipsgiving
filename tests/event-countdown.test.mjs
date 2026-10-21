import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  EVENT_YEAR,
  EVENT_START_ISO,
  EVENT_START_TIMESTAMP,
  EVENT_TIME_ZONE,
  getCountdownParts,
} from "../src/lib/eventSchedule.ts";

test("the event is December 5, 2026 at 4 PM in New York", () => {
  assert.equal(EVENT_YEAR, 2026);
  assert.equal(EVENT_TIME_ZONE, "America/New_York");
  assert.equal(EVENT_START_ISO, "2026-12-05T16:00:00-05:00");
  assert.equal(new Date(EVENT_START_TIMESTAMP).toISOString(), "2026-12-05T21:00:00.000Z");

  const localEvent = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TIME_ZONE,
    dateStyle: "long",
    timeStyle: "short",
  }).format(EVENT_START_TIMESTAMP);
  assert.equal(localEvent, "December 5, 2026 at 4:00 PM");
});

test("breaks the remaining duration into days, hours, minutes and seconds", () => {
  const duration = (2 * 86_400 + 3 * 3_600 + 4 * 60 + 5) * 1_000;
  assert.deepEqual(getCountdownParts(EVENT_START_TIMESTAMP - duration), {
    days: 2,
    hours: 3,
    minutes: 4,
    seconds: 5,
    hasStarted: false,
  });
});

test("keeps the final second visible until the exact start", () => {
  assert.deepEqual(getCountdownParts(EVENT_START_TIMESTAMP - 1), {
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 1,
    hasStarted: false,
  });
});

test("switches to the started state at the exact start and never goes negative", () => {
  for (const elapsed of [0, 1, 1_000, 86_400_000]) {
    assert.deepEqual(getCountdownParts(EVENT_START_TIMESTAMP + elapsed), {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      hasStarted: true,
    });
  }
});

test("unit boundaries roll over correctly", () => {
  assert.deepEqual(getCountdownParts(EVENT_START_TIMESTAMP - 86_400_000), {
    days: 1,
    hours: 0,
    minutes: 0,
    seconds: 0,
    hasStarted: false,
  });
  assert.deepEqual(getCountdownParts(EVENT_START_TIMESTAMP - 3_600_000), {
    days: 0,
    hours: 1,
    minutes: 0,
    seconds: 0,
    hasStarted: false,
  });
  assert.deepEqual(getCountdownParts(EVENT_START_TIMESTAMP - 60_000), {
    days: 0,
    hours: 0,
    minutes: 1,
    seconds: 0,
    hasStarted: false,
  });
});

test("a future annual schedule can reuse the helper", () => {
  const nextStart = Date.parse("2027-12-04T16:00:00-05:00");
  assert.equal(getCountdownParts(nextStart - 60_000, nextStart).minutes, 1);
  assert.equal(getCountdownParts(nextStart, nextStart).hasStarted, true);
});

test("guests in different device time zones count down to the same instant", () => {
  const helperUrl = new URL("../src/lib/eventSchedule.ts", import.meta.url).href;
  const script = `
    import { EVENT_START_TIMESTAMP, getCountdownParts } from ${JSON.stringify(helperUrl)};
    console.log(JSON.stringify({
      instant: EVENT_START_TIMESTAMP,
      countdown: getCountdownParts(Date.parse("2026-12-05T20:30:00Z")),
    }));
  `;

  for (const zone of ["America/Los_Angeles", "Europe/London", "Asia/Tokyo"]) {
    const result = JSON.parse(execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script],
      { env: { ...process.env, TZ: zone }, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ));
    assert.equal(result.instant, EVENT_START_TIMESTAMP, zone);
    assert.deepEqual(result.countdown, {
      days: 0,
      hours: 0,
      minutes: 30,
      seconds: 0,
      hasStarted: false,
    }, zone);
  }
});
