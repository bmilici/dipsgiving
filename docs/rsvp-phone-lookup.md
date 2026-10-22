# Testing-only RSVP phone lookup

This document records the original isolated testing implementation. The later approved production release is documented in [rsvp-production-release.md](rsvp-production-release.md).

Branch: `dev/rsvp-phone-lookup`.
Checkout: `/private/tmp/dipsgiving-rsvp-lookup-dev`.
Local review: `http://localhost:3018/testing/register` and `http://localhost:3018/testing/register/dip`.

No remote branch push, Vercel deployment, production database write, or production rules change was performed. The public website and its existing static `/testing` snapshot remain unchanged.

## Inspection and implementation

The existing code stores RSVPs and current dips in `registrations`. A full RSVP optionally embeds `dip_name`, `notes`, and `bringing_dip`. The previous Add a Dip flow creates a separate `dip_only` document. Voting references the registration's document ID through `userVotes.dipIds` and stores vote totals on that registration. The existing rules only allow browser updates to vote counts. Inspection of the locally configured Firestore registration collection was read-only and returned zero documents; no guest values or IDs were printed. Legacy scenarios were therefore verified using synthetic fixtures.

The new flow is opt-in on this development branch. Production continues selecting the original `InlineRegisterForm`; that file, voting, champions, Firebase client configuration, and existing rules are unchanged.

New RSVPs require a name, valid US phone, and integer party size from 1 to 20. The dip checkbox is optional. Without it, dip fields are not required and the confirmation explains that guests can return later. Phone parsing uses `libphonenumber-js/max`, accepts common US formatting, rejects invalid/non-US/extension inputs, and stores the canonical `+1…` value in the existing `phone` field.

Add a Dip (Already Registered?) opens a name-and-phone lookup. A match permits editing the existing dip or adding one. The server matches normalized name and phone within the current event, considering full RSVPs and older records with missing/null type. It excludes `dip_only` entries and refuses ambiguous matches.

Successful lookup issues an opaque, random 256-bit capability in a scoped HttpOnly, SameSite=Strict cookie, expiring after 15 minutes. The response contains only the matched dip/notes and a non-authorizing editor context. Saves require both that context and its cookie, preventing another browser tab's lookup from changing which RSVP an existing editor updates. No registration ID, phone, token, party details, or other guests' lookup information is returned.

Adding/updating a dip uses a transaction on the original registration ID and updates exactly `bringing_dip`, `dip_name`, and `notes`. It never creates another RSVP or resets votes. Party size, phone, name, timestamps, legacy fields, registration ID, and user-vote references are preserved. Renaming an already-voted dip retains votes on that same ID.

The old code had a visible lineup and instructions to avoid duplicate dips, but no enforced duplicate checker. The new testing flow retains the lineup and adds case/whitespace/Unicode-normalized duplicate checks, excluding the current registration. An event lock serializes concurrent creates and updates so two requests cannot claim the same dip name. Repeating a new RSVP with the same normalized name/phone also refuses a duplicate registration.

## Isolation and privacy

- `DIPSGIVING_RSVP_LOOKUP_TESTING=true` must privately opt in while testing mode is active. The public feature flag is explicitly false otherwise; explicit Vercel production overrides all testing flags.
- The API requires a loopback `FIRESTORE_EMULATOR_HOST` and hardcodes project `demo-dipsgiving-rsvp-test`. It cannot fall back to a live project or credential-based production connection. Cloud metadata discovery is disabled for this demo connection.
- Only `/testing/api/rsvp` is opened for this feature in preview middleware. Ordinary previews keep submissions disabled, and production returns 404 for the new API. Other preview APIs and voting remain closed.
- The local emulator uses separate deny-all browser rules. The form never queries Firebase directly; its public lineup endpoint returns only author names and dip names. Phone values, sessions, and limiter records cannot be read through the client SDK.
- Lookup failures use the same generic message for wrong names, wrong phones, invalid/missing phone records, and ambiguous matches. There is no name-only fallback, email check, SMS verification, or anonymous auth signup.
- Persistent transaction-based limits allow 6 lookup attempts per client bucket and 20 per normalized identity in 15 minutes. Creates and updates have separate 30-request client limits. Keys are hashes; raw IP addresses, names, and phones are not stored in limiter documents.
- Same-origin POST checks, exact JSON media-type validation, an 8 KB streamed body limit, allowed-field validation, and private/no-store responses apply. A specific API cache rule overrides the general preview cache header.
- Test-only auxiliary collections are `_rsvpLookupSessions`, `_rsvpLookupRateLimits`, and `_rsvpLookupLocks`. No fields need to be added to existing registrations.

## Legacy records and migration

No migration or backfill is required. Older formatted phone values are normalized in memory when matching; they are not rewritten. Records without a usable phone stay untouched and receive the same unsuccessful lookup response, with generic guidance to contact the host. Standalone `dip_only` records are preserved and are not automatically merged by name. Multiple matching legacy RSVPs are never guessed or merged.

## Validation results

- **148 offline tests passed**; the opt-in emulator suite is skipped in the default offline run.
- **The real Firestore emulator suite passed separately**, including simultaneous duplicate RSVP submissions, simultaneous dip-name claims, durable failed-lookup throttling, existing-ID updates, and unchanged vote references/totals.
- **The complete local HTTP flow passed in both the development server and built testing artifact.** Synthetic fixtures were created and cleaned up only in the fixed local demo project.
- Production-mode and testing-feature builds passed, including TypeScript validation. Production was tested with every lookup flag requested and still rendered the original optional-phone form and returned 404 on the new API.
- Existing normal routes, query/uppercase redirects, refreshes, navigation payloads, admin/API routing, and 37 page assets passed the local production-mode route verifier.
- Targeted ESLint and `git diff --check` passed. Protected-file diffs were empty for voting, champions, legacy forms, production Firebase configuration/rules, admin, and static testing files.

| Requested scenario | Result |
| --- | --- |
| New RSVP without dip | Pass: phone required, no dip required, return-later confirmation |
| New RSVP with dip | Pass: canonical phone, original RSVP schema, dip and notes |
| Returning guest finds RSVP | Pass: event-scoped normalized name/phone match |
| Returning guest adds dip | Pass: updates original registration ID |
| Returning guest changes dip | Pass: same ID, vote totals and references preserved |
| Wrong name or phone | Pass: identical generic failure; no guest details |
| Older entry without phone | Pass: generic failure, original document unchanged |
| Add/update creates no RSVP | Pass: registration count unchanged |
| Formatting differences | Pass: digits, parentheses, spaces, dots, and +1 match |
| Dip duplicates | Pass: client hint plus server check, own-ID exclusion, concurrency checks |
| Multiple browser tabs | Pass: mismatched editor context cannot target another RSVP |
| Throttling and session expiry | Pass: persistent 429/Retry-After and expired session rejection |

## Run locally

Tested with Node 22 and Java 21. From this checkout, install dependencies with `npm ci` if needed. Start two terminals:

```sh
# Terminal 1: a local demo database, never the production Firebase project
npm run emulators:rsvp

# Terminal 2: the functional testing form
npm run dev:rsvp-lookup
```

For a built local preview instead of the development server:

```sh
npm run build:rsvp-lookup
npm run start:rsvp-lookup
```

Open `http://localhost:3018/testing/register`. For a manual walkthrough, use a test name and `202-555-0123`, RSVP with the dip checkbox unchecked, then use Add a Dip with the same name/number in another format.

Verification commands:

```sh
node --experimental-strip-types --test tests/*.test.mjs
DEMO_RSVP_SERVICE_INTEGRATION=1 FIRESTORE_EMULATOR_HOST=127.0.0.1:8188 node --test tests/rsvp-emulator.test.mjs
node scripts/verify-rsvp-lookup.mjs http://localhost:3018
```

The supplied HTTP verifier refuses non-local hosts and non-demo database targets. It cleans up only its synthetic fixture rows. Stop a running app before building the same checkout again. Local database contents are for testing and are ephemeral unless explicitly exported.

## Files

Application: `src/components/PhoneRsvpForm.tsx`, both `src/app/register` pages, `src/app/api/rsvp/route.ts`, `src/lib/rsvp/{testing,testing-db,validation,service}.ts`, `src/app/layout.tsx`, `src/middleware.ts`, `next.config.ts`.

Setup: `package.json`, `package-lock.json`, `firebase.rsvp-testing.json`, `testing/rsvp/firestore.rules`.

Verification: `scripts/verify-rsvp-lookup.mjs`, `tests/rsvp-{form,isolation,service,emulator}.test.mjs`, `tests/rsvp-service-helpers.mjs`, adapted navigation/canonical/page-state tests, and this report.

## Remaining review limits

Browser automation could not connect in this session. Actual hydrated form interaction, rendered keyboard focus, and small-screen layout still need a manual browser check; HTTP and isolated component tests passed.

This is intentionally a local testing implementation. Before a future production rollout, the existing public registration-read/create rules need a private data-access design; otherwise they would expose phone values and bypass server validation. Public hosting would also need trusted proxy handling for client rate-limit headers and cleanup of expired session/limiter rows. Those production changes and any deployment remain outside this task. Session expiration is enforced already; emulator cleanup is sufficient for this local review.
