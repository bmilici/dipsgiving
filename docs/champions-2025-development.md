# 2025 Champions development preview

Branch: `dev/champions-2025-disaster`.
Review: http://127.0.0.1:3028/winners

The Champions view now groups each year's feature, recorded winners, and
historical dips together, sorting all year groups numerically from newest to
oldest. Future years from either saved results or archived dips automatically
appear above previous years. Both current and legacy views use this order.

A static 2025 feature contains the requested voting-disaster heading, body,
unofficial badge, and humorous result. The accompanying retro SVG extends
the existing illustration style and palette, with a malfunctioning computer,
ballot box, broken trophy, and ERROR 404: CHAMPION NOT FOUND message. The feature
is page content and does not create a championship or voting record.

The 2024 podium, rankings, names, original photos, and existing photo-path
compatibility remain intact. The 2025 historical dip list is retained beneath
its feature. Rendering sorts copies of legacy podium arrays without changing
source records. No API, registration, database, vote, or rules logic changed;
no migration or production data edits are needed.

Verification includes 365 passing offline checks (five opt-in database suites
skipped), exact copy and artwork labels, global ordering across unsorted future
years, immutable supplied records, legacy custom document IDs with stored year,
loading/error feedback, and environment-specific image paths. TypeScript and
focused ESLint pass; the native SVG image has the existing image-optimization
advisory.

The local review uses copies of the already-public 2024 podium and 2025 archive
in the fixed isolated demo database. Its owned fixture manifest is stored at
`/private/tmp/dipsgiving-champions-2025-review/fixture-manifest.json` for cleanup.
No local RSVP, contact, settings, or ballot data was changed by preview setup.
This is development-only: no production deployment or GitHub main push.
