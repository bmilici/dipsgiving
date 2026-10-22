# Empty states and admin phone sync — development

Branch: `dev/empty-states-phone-sync`, based on production source `153bdb1`.
Development checkout: `/private/tmp/dipsgiving-empty-states-phone-sync-dev`.

This work is local only. No remote branch push, production deployment, production data edit, or security-rule change is part of this task. Integration writes use disposable local Firebase emulators with project `demo-dipsgiving-rsvp-test`.

## Review

- Dip List: <http://localhost:3022/dips>
- Champions: <http://localhost:3022/winners>
- RSVP: <http://localhost:3022/register>
- Returning guest: <http://localhost:3022/register/dip>
- Existing admin phone list: <http://localhost:3022/admin/invitations>

The local-only admin passcode is `local-demo-admin-passcode`. It is a disposable emulator credential, separate from production admin access. The development banner identifies demo data. The test script cleans up its own fixtures, leaving the empty states available for review.

## Empty states

The Dip List uses the existing bowl-and-chips illustration, cream card, forest heading, and orange registration button. It displays the requested heading and description, with the exact **Register Your Dip** label linked to the existing returning-guest workflow.

The Champions card uses a new gold trophy SVG with a chip medallion, tortilla chip, and small bowl of dip. No dependency, stock photo, fake winner, or database champion entry is added. Both illustrations are responsive and decorative, with accessible headings and normal keyboard-operable links.

Loading and failed reads stay separate from empty states. Confirmed champions remain visible if loading the separate historical archive fails. Existing but malformed historical records produce an error instead of falsely claiming that no history exists.

Only the Dip List requests `/api/dips?event=current`. The server resolves the current event using the same trimmed event name and fallback as RSVP registration. The default dip feed remains unchanged for voting, including historical and undated entries. The public data allowlist still excludes phone numbers and party sizes. Voting source and rules are unchanged.

## RSVP and phone list integrity

The existing RSVP workflow continues requiring a valid US phone, normalizing it to `+1…`, allowing an RSVP without a dip, and matching returning guests by normalized name and phone. Adding or editing a dip still uses the original registration ID and updates only its dip fields. It does not create another RSVP or alter guest counts, votes, or vote references.

New RSVP creation now reads the existing private `invitationList` and saves a missing contact in the same Firestore transaction as the RSVP. Existing formatted phone numbers are normalized in memory for comparison. Matching entries keep their original name, phone display, notes, preferences, and metadata. New contacts use the list's existing fields:

`name`, canonical `phone`, empty `notes`, `invite_next_year:false`, `last_party_size`, `source_year:null`, and the existing timestamp fields.

No schema migration or RSVP backfill is required. There is no second phone list. The existing `_rsvpLookupLocks` collection supplies one shared list lock, using its existing `touched_at` field. RSVP sync, manual admin create/update/delete, and retry sync use that lock consistently. This serializes simultaneous submissions and prevents new normalized duplicates. Existing duplicate legacy rows are retained rather than merged or deleted.

Manual contacts retain their entered formatting. Creating a duplicate valid US number, or changing a contact to another saved valid US number, returns a conflict. Editing notes on preexisting duplicate rows remains possible.

New RSVP contacts are unselected for future invitations. Supplying an RSVP phone does not create invitation or marketing consent. No SMS is sent by syncing or testing. Existing manually operated admin controls remain available.

## Failures and retry

Atomic writes prevent a new RSVP from succeeding while its required contact write fails. Failed commits leave neither new record. The SDK retries transaction conflicts. If a network error occurs after the server commits, another create attempt detects the existing RSVP, and the guest can use name-and-phone lookup without creating a duplicate.

The existing admin phone list now has **Retry Phone Sync**. It requires the existing private admin session and same-origin protection. Each click adds up to 100 missing valid phone numbers from full RSVPs for the current event, including legacy full RSVPs without a type. Repeated clicks are safe; the response indicates whether another batch remains. Existing contacts, RSVP rows, missing-phone legacy records, historical events, and votes are unchanged. Dip-only legacy entries are excluded.

The control waits for unsaved edits to be saved and preserves drafts changed during an asynchronous refresh. Success and failure feedback uses an accessible status region.

Failures log only the operation and a bounded SDK error code, never names, phone numbers, registration IDs, session tokens, or credential values. Public visitors cannot invoke the retry or read the admin list.

## Validation

**225 offline tests passed.** All four opt-in suites passed in a separate local emulator run (44 checks, zero failures). The complete HTTP walkthrough passed against ports 3022/8189. The full application build passed in a separate local checkout using dummy demo configuration. TypeScript and diff checks passed; focused ESLint has zero errors and two image optimization suggestions for SVG/existing image elements.

The recorded automated checks cover all requested RSVP, formatting, returning-guest, manual-entry, empty-state, historical-data, loading, error, and privacy scenarios. Real emulator checks additionally exercise concurrent RSVP/manual writes, retries, vote preservation, and atomic failures. The local HTTP verifier checks the actual routes and verifies a unique emulator probe before sending any form request.

| Scenario | Result |
| --- | --- |
| First RSVP, new number | RSVP and one canonical admin contact save together |
| Existing number or different formatting | No additional contact; existing manual entry unchanged |
| Returning guest adds or changes a dip | Same RSVP ID, count, party size, votes, and contact |
| Invalid phone or failed RSVP | No new admin contact |
| Simultaneous submissions/manual writes | No new normalized duplicate |
| Sync failure or ambiguous network response | Atomic rollback or existing-ID recovery; safe retry |
| Legacy RSVP without phone | Unchanged; skipped by retry |
| Empty Dip List | Requested artwork, text, and registration CTA |
| Current dips and older event dips | Current list filters correctly; default voting feed retains all IDs |
| Empty Champions | Trophy card; no invented winner records |
| Existing champions/history | Existing records display, including confirmed champions after archive failure |
| Loading, read failure, malformed history | Distinct loading/error state; no false empty card |
| Admin sync button and draft editing | Busy/status feedback, double-click guard, safe retry, preserved drafts |
| Public privacy | Private APIs and raw phone reads denied; no public phone fields |

Both illustrations were rendered and visually inspected. Browser automation cannot connect because of an internal sandbox initialization error; hydrated mobile layout and keyboard interactions still need a manual browser check. Component interactions, semantic controls, local HTTP behavior, TypeScript, and the build are checked separately.

## Run locally

Use a separate checkout so its dummy environment file cannot replace an existing project's configuration. Node 22 and Java 21 or newer are supported. In the development checkout, use `testing/phone-sync.env.example` as `.env.local`; it contains only dummy emulator settings. Installed dependencies are reused in this session, with no new package dependencies.

```sh
# Terminal 1, with Java 21+ available
npm run emulators:phone-sync

# Terminal 2
npm run dev:phone-sync

# Offline tests
node --experimental-strip-types --test tests/*.test.mjs

# Full HTTP walkthrough; only local ports 3022 and 8189 are accepted
node scripts/verify-phone-sync.mjs
```

The emulator and development server are already running for this review. This session uses a portable Java 21 runtime at `/private/tmp/dipsgiving-rsvp-emulator-tools/jdk-21.0.12.1+1/Contents/Home`.

The HTTP verifier uses the real local lookup limits. Repeated runs in the same fifteen-minute window can correctly hit the local rate limit. It deletes only its own synthetic rows and sessions and does not remove existing manual data or real guests.

## Limitations

Existing invalid, non-US, or missing phone values remain unchanged; values that cannot be normalized cannot participate in US phone deduplication. Existing duplicate contacts are preserved. Retry sync is current-event scoped and does not automatically import older years. Unknown historical source year remains `null` rather than inventing a year.

Transactions scan the current event's RSVPs and existing phone list, appropriate for this small event. Retry writes are capped at 100 contacts per request. Existing private rules already permit the server's authorized access; no permission change is required. Phone writes cannot be tested through the public client SDK, which remains denied access.

## Modified files

Application:

- `src/components/EmptyState.tsx`
- `public/illustrations/dip-trophy.svg`
- `src/app/dips/page.tsx`
- `src/app/winners/page.tsx`
- `src/app/api/dips/route.ts`
- `src/lib/rsvp/public-dips.ts`
- `src/lib/rsvp/event.ts`
- `src/lib/rsvp/invitation-sync.ts`
- `src/lib/rsvp/service.ts`
- `src/app/api/admin/invitations/route.ts`
- `src/app/admin/invitations/page.tsx`

Isolated development setup:

- `src/lib/firebase.ts`
- `src/app/layout.tsx`
- `next.config.ts`
- `package.json`
- `firebase.phone-sync-testing.json`
- `testing/phone-sync.env.example`

Verification and documentation:

- `tests/admin-access.test.mjs`
- `tests/admin-phone-sync-ui.test.mjs`
- `tests/invitation-sync.test.mjs`
- `tests/local-phone-sync-runtime.test.mjs`
- `tests/phase1-5-page-states.test.mjs`
- `tests/public-dips-api.test.mjs`
- `tests/public-dips.test.mjs`
- `tests/rsvp-emulator.test.mjs`
- `tests/rsvp-service-helpers.mjs`
- `scripts/verify-phone-sync.mjs`
- `scripts/verify-rsvp-lookup.mjs`
- `docs/empty-states-phone-sync.md`

An ignored `.env.local` contains the disposable demo settings. Production credentials were not copied into this checkout.
