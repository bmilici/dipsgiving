import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { isTestingMode } from "@/lib/testingMode";
import { getRsvpTestingDb, RSVP_TEST_PROJECT } from "./testing-db";

export class RsvpUnavailable extends Error {
  constructor(public readonly status: 404 | 503) {
    super("RSVP service is unavailable.");
  }
}

/** Live credentials are accepted only by an explicitly enabled production app. */
export function getRsvpDb() {
  if (isTestingMode) return getRsvpTestingDb();

  // Exercise the root production UI locally without permitting live access.
  if (!process.env.VERCEL && !process.env.VERCEL_ENV &&
      process.env.DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST === "true") {
    const match = (process.env.FIRESTORE_EMULATOR_HOST || "").match(/^(?:127\.0\.0\.1|localhost|\[::1\]):([0-9]+)$/);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) throw new RsvpUnavailable(503);
    process.env.METADATA_SERVER_DETECTION = "none";
    const name = "dipsgiving-rsvp-local-production-test";
    const app = getApps().find((entry) => entry.name === name) || initializeApp({ projectId: RSVP_TEST_PROJECT }, name);
    return getFirestore(app);
  }

  if (process.env.VERCEL_ENV !== "production" ||
      process.env.DIPSGIVING_RSVP_LOOKUP_PRODUCTION !== "true") throw new RsvpUnavailable(404);
  // An accidentally inherited emulator flag must never redirect production data.
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new RsvpUnavailable(503);
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const value = process.env.DIPSGIVING_FIREBASE_ADMIN_CREDENTIALS;
  if (projectId !== "dipsgiving" || !value) throw new RsvpUnavailable(503);
  try {
    const credentials = JSON.parse(value.trim().startsWith("{") ? value : Buffer.from(value, "base64").toString("utf8"));
    if (credentials.type !== "service_account" || credentials.project_id !== projectId ||
        typeof credentials.client_email !== "string" || typeof credentials.private_key !== "string") throw new Error();
    const name = "dipsgiving-rsvp-production";
    const app = getApps().find((entry) => entry.name === name) ||
      initializeApp({ projectId, credential: cert(credentials) }, name);
    return getFirestore(app);
  } catch {
    throw new RsvpUnavailable(503);
  }
}
