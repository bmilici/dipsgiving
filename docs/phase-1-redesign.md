# Dipsgiving Phase 1 redesign

This is a visual redesign for development review. The production branch and data are not modified. No Phase 2 or Phase 3 features are included.

## Design

- Centralized cream, forest green, burnt orange, mustard gold, espresso, and white tokens. Small text uses darker or lighter accessible tints where the exact palette combinations fall below contrast requirements.
- Bree Serif display typography and DM Sans body typography, served with `next/font` and font-display swap.
- Shared buttons, cards, form fields, container/page layouts, keyboard focus styles, and reduced-motion behavior.
- Sticky navigation with all six existing routes, highlighted RSVP action, active-page state, and accessible mobile menu.
- Poster-inspired homepage with the event badge, title, tagline, date/time, two existing registration routes, and a lightweight local SVG food illustration.
- Time-zone-independent countdown to December 5, 2026, at 4 PM America/New_York. The instant is `2026-12-05T16:00:00-05:00` (21:00 UTC); countdown clamps at zero and changes to “LET THE DIPPING BEGIN!” at the start.
- Three quick links to the existing dip list, voting, and champions routes.
- Restyled event details preserve the public location, directions link, and SMS contact. The gate code remains absent. No private-sharing workflow is added.
- Existing sponsor names, logos, and links are retained. The component accepts an optional sponsor list and presents a designed empty state for an empty list; no sponsor data is fabricated.
- One shared footer across the website with all existing navigation routes and the event year.
- All registration and competition pages use the shared styling. The previously removed “How it works” section remains absent.

## Files changed

### Shared visual system and layout

- `src/app/globals.css`: palette, typography, reusable visual classes, focus states, entrance/hover styles, reduced-motion overrides, long-content wrapping.
- `src/app/layout.tsx`: requested fonts, updated metadata, skip link, shared navigation/footer.
- `src/components/Nav.tsx`: responsive navigation presentation, mobile menu, keyboard behavior, active route.
- `src/components/Footer.tsx` (new): shared branding, links, event year, and tagline.
- `src/lib/siteNavigation.ts` (new): existing six-route navigation definitions.

### Homepage and event presentation

- `src/app/page.tsx`: hero, illustration, countdown placement, quick links, event details.
- `public/illustrations/dip-table.svg` (new): local, resolution-independent food artwork, approximately 4.2 KB.
- `src/components/Sponsors.tsx`: responsive sponsor grid, optimized logo rendering, optional empty state.
- `src/components/EventCountdown.tsx` (new): client countdown and accessible start announcement.
- `src/lib/eventSchedule.ts` (new): reusable annual schedule and pure countdown calculation.

### Existing pages/forms (presentation only)

- `src/app/register/page.tsx`
- `src/app/register/dip/page.tsx`
- `src/app/dips/page.tsx`
- `src/app/vote/page.tsx`
- `src/app/winners/page.tsx`
- `src/components/InlineRegisterForm.tsx`

Registration fields, required flags, validation, event dispatch/listeners, form modes, Firebase/auth calls, database queries, transactions, vote counting, vote permissions, and stored payloads are preserved. Existing event settings, database rules, API endpoints, and dependencies are unchanged.

### Verification and documentation

- `tests/event-countdown.test.mjs` (new)
- `tests/phase1-workflows.test.mjs` (new)
- `tests/phase1-ui.test.mjs` (new)
- `docs/phase-1-redesign.md` (this report)

## Verification

- Production-mode build (`npm run build`) passes. This builds the development version; it does not deploy production.
- TypeScript (`npx tsc --noEmit --incremental false`) passes.
- All 24 offline countdown, workflow, and UI tests pass.
- Countdown tests cover New York timing, Los Angeles/London/Tokyo device time zones, unit rollover, the final millisecond, exact and past start times, and future schedule reuse.
- Offline workflow tests exercise the real transpiled form/vote/list components with fail-closed mocked integrations. They cover validation preventing writes; RSVP and dip-only payloads; conditional dip fields; mode controls; auth and voting gates; the three-vote limit at both UI and transaction layers; vote increment/removal; and dip-list filtering and rendering.
- Offline UI tests exercise mobile-menu accessibility and sponsor empty/default states.
- Local built-app HTTP checks pass for `/`, `/register`, `/register/dip`, `/dips`, `/vote`, and `/winners`. All return 200 with navigation, footer, page headings, and no gate code. Form markup and homepage sections are present. Local SVG and all three existing sponsor images return 200.
- Responsive code was audited for 320, 375, 390, 768, and 1440 pixel widths: flexible layouts, mobile menu, single-column form controls, touch targets, logo sizing, and long-content wrapping.
- No development submissions, real votes, record edits/deletions, or test data were sent to production. Existing read/write behavior is covered through mocked integrations, rather than live test submissions.

Run the tests with:

```sh
node --experimental-strip-types --test tests/*.test.mjs
```

## Issues and limits

No functional regressions were found in the offline workflow tests. A rendered browser check and live Firebase end-to-end testing could not be completed: the in-app browser connection fails during setup in this environment. The responsive audit and HTTP checks are not a substitute for checking the rendered preview on devices.

Targeted lint on new files and the redesigned homepage, layout, navigation, footer, sponsor, and countdown files passes. The existing registration/list/history files retain six pre-existing `no-explicit-any` lint errors (two in `dips/page.tsx`, one in `winners/page.tsx`, three in `InlineRegisterForm.tsx`) and the existing historical winner `<img>` optimization warning. The production-mode build already skips lint through the existing Next configuration; that setting was not changed. These existing issues were left outside the visual redesign.

For future events, update the schedule in `src/lib/eventSchedule.ts` and the existing event settings through the established settings workflow. The countdown does not open voting or change registration permissions.
