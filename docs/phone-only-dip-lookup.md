# Phone-only returning-guest dip lookup

Returning guests use the phone number from their RSVP to find the existing
registration and manage its dips. A new RSVP still requires the guest's name,
phone number, and party size. The pending and no-dip choices remain unchanged.

## Matching and privacy

Both RSVP services normalize US phone formatting before matching within the
current event. Only full RSVPs (including older records with no type) qualify.
The lookup payload requires only `phone`; an optional legacy `name` is ignored
so an already-open browser tab remains compatible. Other unexpected fields
remain invalid.

Exactly one matching registration is required. Shared phone numbers across
multiple full RSVPs fail with the same generic response as an unknown number;
the server never chooses one or lists guests to pick from. Older records with
missing or invalid phone numbers stay unchanged and need host assistance.
A record without a usable stored guest name cannot receive an editor session.

The existing six-attempt client and twenty-attempt identity limits per fifteen
minutes remain active. The lookup identity bucket now hashes the canonical
phone alone, so formatting changes or legacy name variations cannot bypass it.
Editor sessions continue binding the original registration ID and stored
name/phone identity, with the existing HttpOnly cookie, editor context, expiry,
and same-origin requirements. A changed stored identity invalidates the editor.

## Unsuccessful lookup

A no-match response offers an RSVP link and a button to correct the number and
search again. The entered phone stays available to edit; no RSVP is created by
a search. Rate limits, connectivity failures, and unavailable services show
retry guidance rather than suggesting that a registration does not exist.
Confirmation messages now explain that guests can return using the same phone.

## Compatibility

No schema change, backfill, migration, or production record edit is required.
Existing sessions keep their identity binding. A successful lookup returns the
same owned dips and registration summary as before. Dip IDs, party sizes,
contact deduplication, voting limits, counters, locked entries, and historical
champions retain their existing behavior. The static `/testing` site remains
read-only.

The name-and-phone lookup descriptions in earlier development reports describe
their original implementation; this document describes the updated lookup.
All write-capable verification uses disposable local demo data, never live
guest registrations or ballots.

## Verification

- 355 offline tests passed; five opt-in emulator suites were skipped in that run.
- The real local RSVP emulator regression passed separately.
- 28 multiple-dip emulator checks passed, including shared-phone ambiguity,
  independent 10/6 vote totals, historical compatibility, and locked dip edits.
- The full local HTTP walkthrough passed: name required only for new RSVPs,
  unmatched number followed by a corrected phone-only search, additional dips,
  independent voting, admin contact deduplication, and preserved champions.
- The 51 isolated form checks include retry focus, RSVP navigation, normalization,
  error distinctions, existing dip editing, and success redirects.
- TypeScript, focused ESLint, and whitespace checks passed.

All UI interaction checks use isolated component execution. Automated full
browser interaction remains unavailable in this runtime.
