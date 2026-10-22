# Multiple dips per RSVP — development implementation

This change is limited to isolated development data. It does not deploy the
application, change production Firestore rules, migrate production records, or
alter saved champions and historical dip records.

The experiment requires `DIPSGIVING_MULTI_DIP_TESTING=true` together with the
existing local-demo mode, the fixed `demo-dipsgiving-rsvp-test` client project,
and loopback Firestore and Auth emulators. `next.config.ts` derives the public
`NEXT_PUBLIC_RSVP_MULTI_DIP` flag from those conditions. Both Vercel preview and
production disable this feature even if an experiment flag is inherited. The
static `/testing` builder also explicitly disables it, keeping that published
design preview read-only. Without this experiment flag, the existing RSVP and
voting implementation remains in use.

## Record ownership and identity

The existing `registrations/{registrationId}` remains the RSVP. Its name, phone,
party size, event, timestamps, and invitation-list association continue to belong
to that one registration. Adding or editing a dip does not create another RSVP,
change the party size, or add another invitation-list contact.

New individual dips are stored separately in
`registrationDips/{dipId}`:

| Field | Purpose |
| --- | --- |
| `registration_id` | Existing owning RSVP ID |
| `event` | Owning registration's event |
| `status` | `pending` or `confirmed` |
| `dip_name` | Confirmed name; pending entries may have no name |
| `notes` | Optional notes or allergens for this dip only |
| `votes` | This individual dip's counter |
| `year` | Voting year |
| `created_at`, `updated_at` | Per-dip timestamps |
| `voting_locked` | Persistent protection after voting starts |

New RSVP rows use `dip_schema_version: 2` and keep the legacy `dip_name` and
`notes` fields empty. This marker prevents a legacy compatibility reader from
inventing an additional pending dip for a registration whose real dips are
already separate records. Existing RSVP rows are not rewritten to add the
marker.

Each newly added dip has a persistent `dip_` ID derived from its registration ID
and a request identifier. A repeated request resolves to the same dip instead
of adding another one. The saved request is also bound to the submitted payload
so a reused identifier cannot silently replace a different request.

## Existing dips and ballots

The old implementation stored one dip and its vote counter directly on its RSVP
row. Its ballots already call their selection array `dipIds`, but those values
are **registration IDs**, not IDs from the separate legacy `dips` collection.

Compatibility reads continue to expose each old entry under its original
registration ID, using that original registration as its counter location.
Additional dips use their distinct new dip IDs and counters. A source
discriminator identifies the counter location; the registration ID is used as an
ownership link, never as a grouping key for ballot choices or rankings.

No historical vote is copied, reset, combined, or re-keyed. The existing
`userVotes/{uid}_{year}` records retain their selected IDs. The unrelated legacy
`dips` collection, `winners` collection, and `historicalDips` archive retain their
existing schemas and records.

An existing well-formed ballot can contain an ID from another event in the same
voting year. Those selections remain unchanged and still count toward the
three-dip limit. The development ballot displays only the current event's
candidates, so it cannot display or remove an older-event selection. Such a
ballot requires host review before a future production cutover; the application
does not silently erase its IDs, decrement historical counters, or free a vote.

Confirmed dips appear individually on the Dip List, ballot, and current podium.
Two dips from one RSVP can both be selected and can finish at different ranks.
Pending entries are excluded from public dip counts and ballot eligibility.
They are edited by their own IDs, so confirming one does not overwrite another
pending or confirmed entry.

Legacy pending names such as `TBD`, `T.B.D.`, `To be determined`, `Undecided`, and
`Not sure yet` are interpreted as pending for compatibility. A legacy
registration that says it is bringing a dip but has no dip name is also pending.
This interpretation changes no stored record. New pending entries store an
explicit status and do not reserve a unique confirmed dip name.

## Protecting voting integrity

A ballot permits up to three distinct dip IDs. The server validates eligibility
and selection changes and updates only the selected dip's counter atomically
with the voter's own ballot. Repeated selection of one dip cannot create two
copies of its ID on a ballot. Existing anonymous-voter identity and year-scoped
ballots remain in use.

Public dip editing refuses changes to protected competition entries and returns
guidance to contact the host for review. It does not rename, remove, or merge
voted-on entries. Adding another dip does not transfer votes from an existing
one.

The development workflow records a rejected change proposal in the private
`_dipEditReviews` collection. A request-bound receipt in `_rsvpDipOperations`
prevents retries from creating duplicate dips or duplicate proposals. Lookup
sessions retain the existing private `_rsvpLookupSessions` capability and
15-minute expiry. Only the server can read or write these records. The admin
dashboard counts individual confirmed dips independently from RSVP and attendee
counts and identifies pending host reviews; it does not automatically approve a
proposal or alter a voted-on entry.

The emulator-only `testing/multiple-dips/firestore.rules` disables direct
browser writes to RSVP counters, individual dips, and ballots. Development
voting uses the Firebase ID-token-verified server endpoint instead. The existing
production `firestore.rules` file is unchanged. An existing malformed ballot or
invalid stored vote counter fails closed for host review instead of being
silently reset.

## Future production rollout and migration

No data migration is required for the compatibility approach. Before any later
production rollout, review and approve the complete application and voting-rule
changes together. The new server-only dip and capability collections must not
become writable directly from an untrusted browser.

If a future migration consolidates old dips into `registrationDips`, use a
separate reviewed maintenance process:

1. Export a backup and inventory legacy registration IDs, counters, ballot
   references, events, and existing archives. Identify ambiguous or malformed
   records for host review rather than guessing an association.
2. Pause voting and editing during the cutover. Copy each eligible legacy dip
   under **the same existing ID**, retaining its exact vote counter, ownership,
   event, timestamps, and protection state. Do not allocate a replacement ID.
3. Validate that every referenced candidate resolves once, that per-dip totals
   are unchanged, and that no registration-backed and separately stored copy
   appear as two public candidates. Compare snapshots of `userVotes`,
   `winners`, and `historicalDips` before and after; do not rewrite the archives.
4. Switch each entry's authoritative counter location once under a documented
   cutover marker. Never combine live counters from both locations. Keep a
   rollback plan and do not delete the original RSVP data as part of enabling
   this feature.

Legacy registrations without a phone number remain unchanged. They cannot be
claimed through a name-and-phone lookup and continue to require host help.
Multiple legacy records with the same identity also retain the generic lookup
failure rather than exposing an ambiguous registration.

## Local review

Use the existing dummy client configuration from
`testing/phone-sync.env.example` as the local `.env.local`. It must identify the
demo project, not the real Firebase project. Start `npm run
emulators:multiple-dips`, then `npm run dev:multiple-dips`. The review site runs
at `http://127.0.0.1:3028` and uses synthetic data only. The existing local-demo
admin passcode is `local-demo-admin-passcode`; it is unrelated to production
admin access. Changing the synthetic event's `votingOpen` setting allows voting
checks without changing the real event settings.

The preview is running in `/private/tmp/dipsgiving-multiple-dips-dev`. Create a
test RSVP with a synthetic name and valid reserved example number such as
`(202) 555-0101`, then use that same name and number to try adding more dips.
Production guest records are not imported. The local lookup limit consumed by
automated tests was reset afterward so manual review can begin immediately.

## Verification

The opt-in `tests/multiple-dips-emulator.test.mjs` runs the actual RSVP and
voting services against real Firestore transactions. It is restricted to
`127.0.0.1:8188` and the hard-coded `demo-dipsgiving-multiple-dips-test` project.
It creates unique synthetic fixtures, removes only the records it owns, and
restores that demo project's prior event settings. Rate-limit metadata expires
under the existing TTL convention. The suite cannot choose the production
project.

```sh
DEMO_MULTIPLE_DIPS_INTEGRATION=1 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8188 \
METADATA_SERVER_DETECTION=none \
node --experimental-strip-types --test --test-reporter=spec \
  tests/multiple-dips-emulator.test.mjs
```

Result: **21 checks passed, zero failures, zero skips** (20 scenarios and the
parent integration test).

| Scenario | Verified result |
| --- | --- |
| RSVP with an initial confirmed dip | One RSVP, one separate dip, no phantom pending entry |
| Add a second dip with concurrent/repeated requests | One persistent new dip ID; no duplicate RSVP or contact |
| Reuse a request ID with different content | Rejected; original dip unchanged |
| Edit one dip | Other dip, RSVP fields, party size, and manual phone-list row unchanged |
| Multiple pending dips and multiple TBD RSVPs | Independently stored; excluded from public confirmed candidates |
| Confirm one pending dip | Same dip ID; other pending and confirmed entries preserved |
| Duplicate confirmed names or another owner's ID | Rejected without overwriting an entry |
| Legacy voted entry | Original registration ID and counter retained; public rename queued for review |
| Legacy TBD confirmation with an additional dip | Existing TBD entry updated; additional dip retained |
| Legacy `status: pending` confirmation | Explicit `dip_status: confirmed` takes precedence; old fields retained |
| Array-shaped initial dip status | Rejected with no RSVP, dip, or phone-list writes |
| Missing-phone registration or incorrect lookup | Generic failure; existing record unchanged |
| Closed voting | No ballot or counter write |
| Two dips belonging to one RSVP | Independent totals of **10** and **6**, never combined as 16 on the RSVP |
| Repeated/concurrent selection of the same dip | One ballot selection and no extra increment |
| Three-dip limit, pending, and unknown candidates | Ineligible choices rejected atomically; independent removal works |
| Legacy ballots and archives | Original vote references, totals, champions, and historical records retained |
| Earlier-event selection on an existing ballot | Retained, counts toward three; host review required to change it |
| Removed votes and closed voting after participation | Persistent lock blocks renaming; one private review proposal per request |
| Malformed counters or duplicate-ID legacy ballots | Fail closed, including public rankings; historical values remain unchanged |

The complete offline suite also passed **267 tests**, including service,
endpoint, UI, feature-isolation, and existing regression coverage. TypeScript
checking and focused ESLint passed. The final application build also passed in
a separate checkout. Serving that compiled build locally under hosted production
settings (including inherited experiment flags) retained the existing voting page
and returned 404 for the experimental voting API, confirming the hosted feature
stays disabled. No build was uploaded or deployed.

`scripts/verify-multiple-dips.mjs` also passed through the running application
at its fixed `http://127.0.0.1:3028` address with Firestore on `8189` and Auth on
`9199`. Before any HTTP POST, it seeds a unique synthetic probe and requires
that exact record from the application's public API, proving that the server
is connected to the intended demo database.

The HTTP checks confirmed RSVP without a dip, separate pending entries across
and within RSVPs, pending confirmation under the same ID, adding and editing
individual dips, idempotent requests, unchanged party size, and one invitation
contact. Actual anonymous Firebase tokens exercised independent ballot choices
and counters, repeated selection, the three-dip limit, fourth-choice rejection,
and pending rejection. Voted edits left the dishes unchanged and created host
review proposals, including after the votes were removed. Authorized admin
reads returned the joined individual dip counts and review proposals. Raw
private-record reads and direct counter or ballot writes were denied with
HTTP 403 under the development rules. All owned synthetic data, sessions,
ballots, proposals, request receipts, and Auth users were cleaned up; prior
demo event settings were restored. The verifier retains shared rate-limit
metadata; only the local demo lookup bucket was reset afterward for manual review.

```sh
node scripts/verify-multiple-dips.mjs
```

Visual browser verification was blocked before the browser opened by the
browser tool's `sandboxPolicy` initialization error. No browser screenshot or
interactive visual result is claimed. The successful component, endpoint,
real-emulator, and HTTP checks remain valid within their stated scope.

## Modified files

Application and local-preview configuration:

- `next.config.ts`
- `package.json`
- `scripts/build-testing-preview.mjs`
- `scripts/verify-multiple-dips.mjs`
- `firebase.multiple-dips-testing.json`
- `testing/multiple-dips/firestore.rules`

Record model, registration, voting, and admin integration:

- `src/lib/rsvp/dip-records.ts`
- `src/lib/rsvp/multi-dip-mode.ts`
- `src/lib/rsvp/multi-dip-service.ts`
- `src/lib/rsvp/voting-service.ts`
- `src/lib/rsvp/service.ts`
- `src/app/api/rsvp/route.ts`
- `src/app/api/dips/route.ts`
- `src/app/api/vote/route.ts`
- `src/app/api/admin/registrations/route.ts`
- `src/app/admin/page.tsx`
- `src/app/vote/page.tsx`
- `src/components/MultiDipVotePage.tsx`
- `src/components/PhoneRsvpForm.tsx`

Verification and implementation notes:

- `tests/admin-access.test.mjs`
- `tests/phase1-workflows.test.mjs`
- `tests/public-dips-api.test.mjs`
- `tests/rsvp-form.test.mjs`
- `tests/rsvp-isolation.test.mjs`
- `tests/rsvp-service-helpers.mjs`
- `tests/testing-preview-builder.test.mjs`
- `tests/multiple-dip-mode.test.mjs`
- `tests/multiple-dip-vote-api.test.mjs`
- `tests/multiple-dip-vote-ui.test.mjs`
- `tests/multiple-dip-voting.test.mjs`
- `tests/multiple-dips-emulator.test.mjs`
- `docs/multiple-dips.md`
