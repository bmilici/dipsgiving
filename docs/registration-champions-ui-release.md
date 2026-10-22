# Registration and Champions UI — approved production release

On October 22, 2026, the user approved publishing the reviewed development
changes after updating the 2025 archive toggle labels to:

- View the Victims of the 2025 Voting Disaster
- Hide the 2025 Dip Lineup

The release includes the 2025 voting-disaster card and retro illustration,
automatic newest-first year grouping, the collapsed-by-default 2025 dip list,
inline confirmed-dip fields inside the first RSVP choice, and the lookup-only
“Checking...” indicator. The approved card wording and artwork are preserved.
This approval supersedes the development-only publishing boundary recorded in
`champions-2025-development.md` and the development review report.

All changes are presentation-only. No Firebase records, schemas, security rules,
registration payloads or validation, phone lookup behavior, vote totals, voting
logic, or historical championship data need to change. No migration or new
private environment setting is required. Existing 2024 photos and the complete
2025 archive remain the original saved results.

The read-only `/testing` snapshot is rebuilt from the release source with
registration and voting flags disabled. Production checks use public GET
requests and comparison hashes, never synthetic guest or ballot submissions.
Local interaction checks use the existing isolated demo history and no writes.
The repository is synchronized to the approved release using a normal,
non-forced push after publishing.
