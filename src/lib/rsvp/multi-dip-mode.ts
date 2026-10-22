/** This experiment can only be built against the disposable local review. */
export const isMultiDipEnabled = process.env.NEXT_PUBLIC_RSVP_MULTI_DIP === "true";

export function multiDipServerEnabled(): boolean {
  return isMultiDipEnabled && !process.env.VERCEL && !process.env.VERCEL_ENV &&
    process.env.DIPSGIVING_MULTI_DIP_TESTING === "true" &&
    process.env.DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST === "true" &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "demo-dipsgiving-rsvp-test" &&
    /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST === "127.0.0.1:9199";
}
