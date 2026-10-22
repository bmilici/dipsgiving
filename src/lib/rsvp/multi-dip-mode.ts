/** Enabled by the approved production release or the isolated local review. */
export const isMultiDipEnabled = process.env.NEXT_PUBLIC_RSVP_MULTI_DIP === "true";

export function multiDipServerEnabled(): boolean {
  if (isMultiDipEnabled && process.env.VERCEL_ENV === "production") {
    return process.env.DIPSGIVING_MULTI_DIP_PRODUCTION === "true" &&
      process.env.DIPSGIVING_RSVP_LOOKUP_PRODUCTION === "true" &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "dipsgiving" &&
      process.env.NEXT_PUBLIC_DESIGN_PREVIEW !== "true" &&
      !process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST;
  }
  return isMultiDipEnabled && !process.env.VERCEL && !process.env.VERCEL_ENV &&
    process.env.DIPSGIVING_MULTI_DIP_TESTING === "true" &&
    process.env.DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST === "true" &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "demo-dipsgiving-rsvp-test" &&
    /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST === "127.0.0.1:9199";
}
