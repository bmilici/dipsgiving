# RSVP, multiple dips, and voting improvements

This report describes the second development stage, extending the multiple-dip
implementation documented in `docs/multiple-dips.md`. That older report records
the behavior and verification of the earlier stage. This report supersedes its
checkbox-based initial RSVP choice and name-based pending/TBD inference with
the three required choices and explicit legacy review handling below.

All development uses disposable demo data. No production records, historical
results, or production security rules are migrated or changed. No production
deployment or remote branch push is part of this work.

## RSVP choices and individual dip records

The existing RSVP form presents three required choices:

| Choice | Fields shown | Saved competition entries |
| --- | --- | --- |
| Yes! I know what I'm bringing. | Dip name and optional notes/allergens | One confirmed dip with its own persistent ID |
| Yes, but I'll decide later. | No dip fields | One pending dip with a structured status and no placeholder name |
| No dip for me! | No dip fields | No dip entry; the guest can add one later |

The server requires an explicit initial `dip_status` of `confirmed`, `pending`,
or `none`, consistent with the `bringing_dip` boolean. A confirmed entry requires
a real submitted dip name. Missing or incoherent choices fail validation before
an RSVP, dip, or invitation contact is created. Name, normalized US phone number,
and party size remain required.

`registrations/{registrationId}` remains the single RSVP and party record.
Each additional dip lives in `registrationDips/{dipId}` with its own
`registration_id`, event, status, name, optional notes, timestamps, vote count,
and persistent voting lock. Confirming a pending entry changes that existing
dip ID rather than creating a new RSVP. New-schema RSVP rows retain
`dip_schema_version: 2`, preventing a duplicate virtual legacy entry.

New additional dip IDs use `dip_` plus a SHA-256 digest of the owning RSVP ID and
the request identifier. Initial dip IDs use the RSVP ID and the stable initial
request discriminator. A request receipt binds each request to its normalized
payload. Retries reuse the same dip ID; reuse with different content is rejected.
New private receipts also retain the confirmation kind so a retry displays the
same success message. Older receipts do not need to be rewritten.

Returning guests keep the current name-and-phone lookup. Their summary and
individual entries support choosing a pending dip, editing a particular
unprotected entry, and adding another dip. These actions never change the RSVP
ID, party size, phone number, or an unrelated dip. The weak lookup capability
does not authorize changes to identity, party size, vote totals, or protected
competition entries. Existing rate limits, generic lookup failures, short-lived
private sessions, and no-phone legacy behavior remain in place.

## Pending and ambiguous legacy entries

New pending entries are identified by status, not by a dip name such as `TBD`.
Several guests, or one guest with several entries, can have pending dips without
reserving duplicate confirmed names. Pending entries never count as confirmed,
appear on the public list or ballot, receive a vote, or enter current rankings.

Historical names `TBD` and `TBD1` without a verified explicit status are
**unverified**, rather than automatically treated as pending or confirmed.
Compatibility reads retain their original names, IDs, counters, ownership, and
other stored fields. The guest cannot reinterpret or overwrite these records;
the admin receives a review indication. They remain excluded from the new
public competition until their meaning is verified. This is a read-time safety
classification, not a database migration or deletion.

An explicit verified `dip_status` or dip `status` is authoritative. A dish
explicitly confirmed as `TBD` or `TBD1` retains that name and remains eligible;
the application does not override verified status using the name heuristic.
This preserves existing trusted records. A new public submission cannot use
`TBD` or `TBD1` as a confirmed dish name; it must select the pending option or
provide the actual recipe name. It is rejected rather than silently changed
into another status.
Explicit pending entries can be confirmed under their existing IDs. The newer
`dip_status` takes precedence over an older generic `status` field, preserving
unrelated legacy fields. A blank legacy entry whose RSVP explicitly says it is
bringing a dip can still be treated as a pending intention.

## Independent lists, ballots, and results

Every confirmed dip appears as its own public card and ballot choice, even when
several entries share the same RSVP owner or phone number. Counts and rankings
operate on dip IDs, never on grouped chef names or RSVP IDs.

New dip vote counters live on their individual records. Old registration-backed
dips retain their original registration IDs and counters at
`registrations/{registrationId}`. Existing `userVotes/{uid}_{year}.dipIds`
references are not re-keyed or erased. Trusted development voting validates the
confirmed candidate, the voter, and the three-distinct-dip limit and commits the
selection and that one counter atomically. Repeated desired-state submissions
do not add duplicate choices or extra increments.

Once voting begins, confirmed public entries cannot be changed in a way that
invalidates a ballot. Positive counters, existing ballot references, and
persistent `voting_locked` flags also preserve protection after voting closes or
votes return to zero. A rejected edit creates an idempotent private review
proposal; it does not rename the dish or reset its votes. Invalid existing
counters and malformed ballots fail closed for host review.

## Champions and admin visibility

The development Champions page uses the read-only `/api/champions` projection.
An optional `dip_id` on a saved podium entry, individual winner record, or
historical-dip record resolves exactly one confirmed competition entry in the
saved award year. That unique dip supplies both its recipe name and its owning
chef. Other dips owned by the same RSVP do not become winners. Existing place,
award, category, year, photo, and related presentation metadata are retained.

Older champion records without `dip_id` keep their stored dip name and chef
snapshot. The resolver never guesses from a matching guest name or RSVP owner.
An absent, null, or blank optional `dip_id` also keeps that legacy snapshot;
only an actual nonblank reference requests a join. A winner-level reference is
not inherited by every member of its podium.
An unknown, duplicate, pending, unverified, wrong-year, or incomplete reference
is left unresolved with a generic review warning; valid historical results stay
visible. It does not write winner records, invent a champion, or convert the
current live rankings into a saved historical award. No new winner field is
required on existing records.

Admin counts distinguish confirmed dips, pending dips, and RSVPs without dips
using actual owned entries, independently from RSVP and attendee totals. An
RSVP that originally selected no dip ceases to count as having no dip when its
guest adds an entry. Multiple entries from one RSVP remain visible separately.
Unverified historical entries require review and are not silently counted as
confirmed or pending. These details are available only behind existing admin
authorization.
The development admin query also includes older RSVPs without `created_at`;
sorting happens after reading them, so missing timestamps cannot remove a
guest from the actual RSVP or no-dip totals. No legacy timestamp is backfilled.

New successful RSVPs continue to normalize phones to US E.164 and atomically
deduplicate them against the existing private invitation list. Existing manual
phone formatting, notes, preferences, and names are retained. Adding or editing
a dip creates neither an RSVP nor another phone-list contact. Failed
registrations do not create contacts. No verification message or unsolicited
SMS is sent.

## Compatibility and rollout considerations

No destructive migration is required. No production data or security rules are
changed. This development feature remains behind the existing local-demo and
multiple-dip flags with a fixed demo Firebase project and loopback emulators.
The published read-only `/testing` snapshot and production implementation remain
unchanged.

Before a separately approved production rollout, resolve ambiguous historical
`TBD`/`TBD1` entries with the host and review ballots that reference candidates
outside the current event. Those well-formed existing selections remain intact
and count toward the three-vote limit; the current-event ballot cannot remove
them automatically. Do not infer a new candidate or reset a historical vote to
free a choice.

A future consolidation of legacy dip storage must back up records, pause
editing and voting, retain exact existing candidate IDs and counters, validate
all ballot references, and switch the authoritative counter location once.
Never expose both copies as two candidates, add their counters together, or
rewrite historical champions. The earlier implementation report contains the
full optional cutover outline.

## Verification

The updated `tests/multiple-dips-emulator.test.mjs` suite uses real server
services and Firestore transactions on `127.0.0.1:8188`, restricted to the fixed
`demo-dipsgiving-multiple-dips-test` project. Each run owns unique synthetic
records, restores the prior demo event settings, and removes only its fixtures.
Existing metadata rate-limit expiry conventions remain in place.

```sh
DEMO_MULTIPLE_DIPS_INTEGRATION=1 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8188 \
METADATA_SERVER_DETECTION=none \
node --experimental-strip-types --test --test-reporter=spec \
  tests/multiple-dips-emulator.test.mjs
```

The updated real-emulator suite passed **27 checks**, with **zero failures and
zero skips** (26 scenarios and the parent integration test). It verifies:

| Requirement | Verified behavior |
| --- | --- |
| Confirmed RSVP | One RSVP and one separate confirmed dip; required fields retained |
| Pending RSVP | Several guests can choose pending; each entry has `status: pending` and no placeholder name |
| No-dip RSVP | No competition record; returning later adds a dip to the same RSVP |
| Required initial choice | Missing, incoherent, array-shaped, or unknown choices are rejected without RSVP, dip, or contact writes |
| Public confirmed placeholders | New confirmed `TBD` and `TBD1` submissions are rejected; no status is silently inferred |
| Returning guest | Formatting-independent phone lookup; summary shows only the matched guest and per-status counts |
| Multiple entries | Separate persistent IDs; concurrent/repeated requests do not duplicate a dip |
| Pending confirmation | Same dip ID; other confirmed and pending records stay unchanged |
| Individual edits | Only the selected dip changes; RSVP, party size, and phone list are unchanged |
| Duplicate names and ownership | Existing confirmed duplicate-name checks apply; another RSVP cannot edit a dip |
| Public projection and ballot | Confirmed entries remain separate; pending and unverified entries are excluded |
| Independent votes | Two dips belonging to one RSVP retain totals of **10** and **6**, never a combined 16 |
| Existing vote restrictions | Three distinct choices; repeated desired-state submissions cannot add duplicate choices or extra votes |
| Vote integrity | Closed, pending, unknown, and unverified candidates are rejected atomically; locks remain after votes return to zero |
| Host review | Protected edits leave original entries unchanged and produce one private review proposal per request |
| Ambiguous historical `TBD`/`TBD1` | Remain unverified, read-only, and byte-for-byte unchanged; no automatic migration |
| Verified legacy status | Explicit trusted confirmed status takes precedence over the name heuristic; explicit pending entries can be confirmed |
| Blank legacy intention | A blank bringing-dip entry remains pending and can be confirmed without guessing from a placeholder name |
| Champions | A saved unique dip ID resolves only the actual winning recipe and chef, retaining year, rank, award, and photo |
| Historical compatibility | Original registration-backed IDs, counters, ballots, champion snapshots, and archives remain intact |
| Older-event ballot references | Kept unchanged and counted toward three; host review is required to change unavailable older selections |
| Invalid historical values | Malformed counters and duplicate-ID ballots fail closed without a false zero or silent repair |
| Phone list | Existing manually formatted number and preferences retained; no extra contact from additional dips |
| Production isolation | Tests use only the fixed local demo project and clean up their owned fixtures |

The form-focused suite passed **40 tests**, including the pre-existing
compatibility cases. The Champions resolver, endpoint, and component suites
passed **25 tests**, including optional null/blank references and independent
podium references. The admin status component suite passed **4 tests** for live
server counts, independent same-owner entries, unchanged party totals, and the
feature-disabled dashboard.

The updated `scripts/verify-multiple-dips.mjs` also passed through the actual
local application, using Firestore on `8189`, Auth on `9199`, and real anonymous
Firebase bearer tokens. It verified all three initial choices, missing-choice
rejection, confirmation text, minimal guest summaries, several individual dips,
duplicate-name rejection, unchanged RSVP and contact counts, independently
counted votes, the three-choice limit, persistent edit protection, and private
record/write rejection. Authorized admin reads confirmed actual per-status
counts and review proposals.

Temporary synthetic winner and archive fixtures verified the actual Champions
endpoint: the winning dip ID resolved the correct recipe and chef, a pending
reference could not become a champion, and existing historical snapshots stayed
unchanged. All owned synthetic guests, dips, contacts, ballots, sessions,
requests, proposals, Auth users, and winner/archive fixtures were cleaned up;
prior demo event settings were restored. No production service was called.

The full offline suite passed **306 tests** with zero failures; five opt-in
emulator suites were skipped in that offline run. The separately enabled
database suite passed **27 checks**, including independent **10/6** vote totals.
The final admin regression checks and full localhost HTTP walkthrough also
passed with an untimestamped legacy RSVP included in the actual admin response.
TypeScript passed. Focused ESLint had zero errors and four image optimization
suggestions for the preserved/native image elements.

The visual browser connection was retried but failed before opening with the
tool's `sandboxPolicy` initialization error. No screenshot or interactive visual
verification is claimed. Component, API, and real database checks passed.

The final application build passed in the separate build checkout. Actual HTTP
requests against that compiled build, with hosted-production settings and
inherited experiment flags, returned 404 for both experimental APIs and retained
the existing form. The local development pages all loaded directly; their RSVP
HTML contained exactly three required, initially unselected radio choices and no
dip fields until a choice is made. Nothing was uploaded or deployed.

The development preview remains available at `http://127.0.0.1:3028` from
`/private/tmp/dipsgiving-multiple-dips-dev`. Use a synthetic name and an example
number such as `(202) 555-0101` to create a demo RSVP before testing lookup.
Production guests are not imported. The local lookup limit consumed by QA was
reset after verification so manual review can begin immediately. The temporary
hosted-build check server was stopped; the development preview stays running.

## Modified files

- `docs/multiple-dips.md`
- `docs/rsvp-multiple-dips-improvements.md`
- `scripts/verify-multiple-dips.mjs`
- `src/app/admin/page.tsx`
- `src/app/api/admin/registrations/route.ts`
- `src/app/api/champions/route.ts`
- `src/app/api/rsvp/route.ts`
- `src/app/winners/page.tsx`
- `src/components/MultiDipChampionsPage.tsx`
- `src/components/PhoneRsvpForm.tsx`
- `src/lib/rsvp/champions.ts`
- `src/lib/rsvp/dip-records.ts`
- `src/lib/rsvp/multi-dip-service.ts`
- `tests/admin-access.test.mjs`
- `tests/admin-rsvp-status-ui.test.mjs`
- `tests/multiple-dip-champions-api.test.mjs`
- `tests/multiple-dip-champions-ui.test.mjs`
- `tests/multiple-dip-champions.test.mjs`
- `tests/multiple-dip-voting.test.mjs`
- `tests/multiple-dips-emulator.test.mjs`
- `tests/phase1-5-page-states.test.mjs`
- `tests/phase1-workflows.test.mjs`
- `tests/rsvp-form.test.mjs`
