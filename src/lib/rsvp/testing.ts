import { isTestingMode } from "@/lib/testingMode";

/** Opt-in review flow. Production config always embeds false for this flag. */
export const isRsvpLookupTestingEnabled =
  isTestingMode && process.env.NEXT_PUBLIC_RSVP_LOOKUP_TESTING === "true";
