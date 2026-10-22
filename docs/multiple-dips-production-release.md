# Multiple dips and RSVP improvements — production release

The user approved publishing all reviewed development changes on October 22,
2026, including the final helper messages below the pending and no-dip choices.
This release supersedes the development-only deployment restrictions recorded
in `multiple-dips.md` and `rsvp-multiple-dips-improvements.md`.

## Production activation

The build enables the reviewed feature only with `VERCEL_ENV=production`,
`DIPSGIVING_RSVP_LOOKUP_PRODUCTION=true`,
`DIPSGIVING_MULTI_DIP_PRODUCTION=true`, and Firebase project `dipsgiving`.
Either Firestore or Auth emulator setting disables activation. Production
always disables the local-demo client and design-preview mode. Hosted previews
remain isolated; the static `/testing` builder explicitly disables the new
production flag and keeps registration and voting unavailable.

The existing private Firebase service account, admin passcode, phone lookup,
rate limits, and HttpOnly sessions remain in use. No credentials are rotated or
added. Voting verifies real Firebase ID tokens with the already validated
production Admin app; it cannot fall back to unsigned emulator tokens.
The voting and Champions APIs return private, uncached responses.

## Records and compatibility

No migration, bulk record edits, vote resets, or winner rewrites are performed.
Legacy registration-backed dip IDs and vote counters remain in place. New dips
use the reviewed `registrationDips` records and individual persistent IDs.
Existing ambiguous TBD entries remain read-only for host review; no status is
guessed or written. Saved champions and archive snapshots are preserved.

A private, read-only pre-release snapshot contains 3 RSVPs, 0 separate dips,
0 ballots, 1 winner record, 22 historical dip records, and 47 invitation records.
Voting was closed and registration open at inspection. One legacy placeholder
needs the existing host-review workflow. Snapshot contents and credentials are
outside the repository and are never uploaded.

Production Firestore rules now deny direct browser updates to registration vote
counters and direct ballot writes. The trusted server commits a ballot and its
individual dip counter together. Own-ballot reads remain allowed; separate dip
records and all capabilities stay private. Public history and unrelated game
permissions remain unchanged. The previous live rules were backed up privately
and matched the original repository rules exactly.

Old open tabs using the prior RSVP payload or browser voting transaction need
refreshing. They fail safely instead of bypassing the new status and voting
checks. Apply the reviewed rules immediately before promoting the staged app.
After new-schema records exist, prefer fixing forward: an older application or
disabled feature would hide those entries. Restoring older broad client-write
rules would also remove the new voting protections.

## Verification before deployment

- 318 offline tests passed, with five opt-in emulator suites skipped in that run.
- 27 real Firestore multiple-dip checks passed, including independent 10/6 totals
  for two dips owned by one RSVP and preservation of existing IDs and ballots.
- Seven real production-rule checks passed in a dedicated local demo project:
  direct and cached browser voting cannot change counters or ballots; private
  dip records remain private; public history and unrelated permissions work.
- The full local HTTP walkthrough passed with real emulator Auth tokens:
  pending/no-dip RSVPs, phone lookup, additional entries, independent 2/1 vote
  totals, idempotent updates, three-choice limit, admin counts, review proposals,
  exact champion resolution, preserved archives, and rejected private writes.
- Production UI tests verify root routes, the three choices, latest helper copy,
  independent voting and Champions activation, no demo banner, and read-only
  static testing pages. Feature guards reject previews and either emulator.
- TypeScript, focused ESLint, and diff checks passed during release preparation.

All write-capable verification uses disposable local demo records. Production
verification uses read-only requests and record comparisons; no synthetic guest
RSVP or ballot is submitted to the live site.
