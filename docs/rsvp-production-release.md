# RSVP phone lookup production release

Approved for production on October 21, 2026. The original testing implementation remains available on `dev/rsvp-phone-lookup`; this release adds the live connection and private data access required to publish it.

## Guest behavior

`/register` now requires a valid US phone number, name, and party size. Bringing a dip remains optional. Confirmation explains that guests can return later. `/register/dip` opens the name-and-phone lookup and edits the matched RSVP's existing dip. Formatting differences are normalized; duplicate RSVPs and duplicate dip names are rejected. Older records without phones remain unchanged and require help from the host.

Adding or changing a dip updates only `bringing_dip`, `dip_name`, and `notes` on the original registration ID. It does not create another RSVP, change party size, reset votes, or alter voting references. No migration or existing guest record rewrite is required.

## Private production connection

The server uses a dedicated Firebase service account with `roles/datastore.user` in the existing `dipsgiving` project. Its JSON credentials are stored as a sensitive Vercel production variable, `DIPSGIVING_FIREBASE_ADMIN_CREDENTIALS`. The server also requires `DIPSGIVING_RSVP_LOOKUP_PRODUCTION=true` and `VERCEL_ENV=production`, rejects inherited emulator settings, and validates the credential project. Previews cannot access this connection. No credential is committed or exposed to the browser.

Explicit local tests retain the fixed loopback demo emulator. `DIPSGIVING_RSVP_LOOKUP_LOCAL_TEST=true` exercises the root production UI only when neither Vercel environment variable is present. Ordinary testing previews stay read-only; the original opt-in lookup preview stays emulator-only.

The lookup API keeps same-origin POST checks, an 8 KB request limit, strict input validation, generic lookup failures, hashed server-side rate limits, 15-minute opaque HttpOnly sessions, and cross-tab editor binding. Production cookies are scoped to `/api/rsvp`; preview cookies use `/testing/api/rsvp`. Client throttling trusts Vercel's platform IP header only on Vercel. Other servers share a local bucket.

Sessions and rate-limit records have timestamp `delete_after` fields for Firestore TTL cleanup. Expiry is checked during every authorized request, independently of delayed automatic deletion. The four TTL policies cover guest/admin sessions and guest/admin rate limits; existing registration collections have no TTL policy.

## Database and public data

Firestore browser reads/creates/deletes on `registrations` are denied. The existing vote-only update rule remains unchanged. Invitation records and private session/limiter collections are also inaccessible to browsers.

`GET /api/dips` returns an explicit allowlist of public dip IDs, names, notes, votes, years, and timestamps across existing events, including undated legacy dips. Phones and party sizes are excluded. Dip and voting pages refresh this feed every ten seconds while visible and after a vote. Voting retains its existing atomic own-vote document read and registration increment, three-vote limit, IDs, and payloads. The redundant registration existence read is removed because raw registrations are private; updating a nonexistent dip still fails atomically. Champions and vote counting rules are unchanged.

The static `/testing` copy is rebuilt from the reviewed release source with submission/voting handlers removed. Its exact `/testing/api/dips` route serves the same filtered read-only feed. `/testing/api/rsvp` remains unavailable on the production host. Uppercase testing bookmarks still redirect with their query parameters intact.

## Admin access

The former bundled passcode/local-storage gate is replaced with a private server-only `DIPSGIVING_ADMIN_PASSCODE`, a one-hour hashed session, and HttpOnly cookies. The passcode is rotated because the former value was included in browser code. The new value is provided separately in a private local file, never in this repository. Admin registration reads and invitation CRUD require a verified session before loading data. Existing invitation controls are preserved.

Endpoints: `/api/admin/session`, `/api/admin/registrations`, and `/api/admin/invitations`. Mutation requests require the same origin; login attempts are durably limited to six per client per fifteen minutes. Responses are private and uncached.

## Verification

- Production build, TypeScript, focused ESLint, and diff checks pass.
- 184 offline tests pass; three opt-in emulator suites skip in that offline run.
- Separate real emulator suites pass for RSVP concurrency/ID preservation, admin sessions/invitation CRUD, and private rules/vote transactions.
- The built root production UI passes the full HTTP RSVP walkthrough using synthetic local emulator records only. It covers both RSVP options, formatting variants, lookup failures, adding/updating the same ID, duplicate prevention, two-tab protection, throttling, and expiry. Fixtures are cleaned up.
- All six production pages pass direct loads, HEAD/refresh, query URLs, RSC navigation, active links, legacy testing redirects, and 37 page assets.
- The production server credential is verified read-only. No guest registration or vote is submitted as a production test.

Useful commands:

```sh
node --experimental-strip-types --test tests/*.test.mjs
DEMO_RSVP_SERVICE_INTEGRATION=1 FIRESTORE_EMULATOR_HOST=127.0.0.1:8188 node --test tests/rsvp-emulator.test.mjs
DEMO_RSVP_ADMIN_INTEGRATION=1 FIRESTORE_EMULATOR_HOST=127.0.0.1:8188 node --test tests/admin-access.test.mjs
DEMO_RSVP_RULES_INTEGRATION=1 FIRESTORE_EMULATOR_HOST=127.0.0.1:8188 node --test tests/rsvp-production-rules.test.mjs
node scripts/verify-rsvp-lookup.mjs http://localhost:3020 production
node scripts/verify-navigation.mjs http://localhost:3020 production
```

## Release and rollback

Live rules were backed up privately before any change. Stage and check the production deployment, apply the reviewed private rules, then promote the verified deployment. Keep the source on GitHub `main`. If rolling back to the old browser-based forms, coordinate restoring the prior rules with that deployment: old forms require raw browser access and cannot work with the new private rules. Restoring old rules would reopen the former data exposure, so prefer fixing forward.

No browser automation connection is available in this session; actual visual interactions are covered by the user's earlier testing approval, component tests, and HTTP checks.
