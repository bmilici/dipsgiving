# Live design release

The reviewed design from `e8b86d163a57269dde39a7cdba7440a4b41170ae` is promoted from `/testing` to the main Dipsgiving pages.

Included: retro palette and typography, illustrated hero, straight enlarged star-free 5th Annual badge, branding without trailing dots, countdown tiles/fallback, shared navigation/footer, consistent forms and lists, and refined empty/loading states.

The six main routes remain `/`, `/register`, `/register/dip`, `/dips`, `/vote`, and `/winners`. The production configuration explicitly sets `NEXT_PUBLIC_DESIGN_PREVIEW=false`; there is no testing base path, preview notice, noindex setting, or preview-only submission block on the main pages. Existing event settings still determine voting availability.

The separate public `/testing` static build is preserved unchanged and stays read-only. Its lowercase canonical redirects, noindex headers, assets, disabled submissions, and disabled voting remain in place.

Registration and voting handler bodies were compared against the original production version and are byte-for-byte unchanged. Firebase configuration, event settings, database rules, API endpoints, and data structures are unchanged. No migrations, record edits, live registration submissions, or live votes were performed for testing.

Validation includes the production-mode build, TypeScript, offline countdown/workflow/page/navigation tests, production-mode checks, and GET-only checks of all main and testing routes, forms, images, metadata, and redirects. Existing legacy `any` lint findings and the historical winner raw-image warning remain outside this release. Browser screenshot verification remains unavailable in this environment.
