import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const RSVP_TEST_PROJECT = "demo-dipsgiving-rsvp-test";

export class RsvpTestingUnavailable extends Error {
  constructor(public readonly status: 404 | 503) {
    super("RSVP testing is unavailable.");
  }
}

export function getRsvpTestingDb() {
  // Never fall back to a live project or run on production.
  if (
    process.env.VERCEL_ENV === "production" ||
    process.env.NEXT_PUBLIC_DESIGN_PREVIEW !== "true" ||
    process.env.NEXT_PUBLIC_RSVP_LOOKUP_TESTING !== "true" ||
    process.env.DIPSGIVING_RSVP_LOOKUP_TESTING !== "true"
  ) {
    throw new RsvpTestingUnavailable(404);
  }
  const host = process.env.FIRESTORE_EMULATOR_HOST || "";
  const match = host.match(/^(?:127\.0\.0\.1|localhost|\[::1\]):([0-9]+)$/);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) {
    throw new RsvpTestingUnavailable(503);
  }
  // This demo emulator needs no cloud credentials or metadata discovery.
  process.env.METADATA_SERVER_DETECTION = "none";
  const name = "dipsgiving-rsvp-lookup-testing";
  const app = getApps().find((entry) => entry.name === name) ||
    initializeApp({ projectId: RSVP_TEST_PROJECT }, name);
  return getFirestore(app);
}
