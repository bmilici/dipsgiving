# Navigation and routing development changes

Development branch: `dev/navigation-routing`, based on live-site commit `71bd33c`.
Checkout: `/private/tmp/dipsgiving-navigation-dev`.

No branch push, Vercel deployment, production release, Firebase changes, or database writes were performed. The main project checkout's unrelated work was left intact.

## Existing framework and hosting

The project uses Next.js 15 App Router on Vercel. There is no tracked `vercel.json`. Existing production configuration has no application base path. Seven `beforeFiles` rewrites serve the independent, read-only `public/testing` export. Middleware already handled case-sensitive canonicalization of legacy `/Testing` links, including the exported homepage's `.txt` payload. Those production settings and exported files are preserved.

## Changes

- One shared `siteRoutes` configuration supplies destinations and labels for the header, footer, wordmarks, homepage actions/cards, dip-list empty-state action, and voting home link. Labels are Home, RSVP, Register Dip, Dip List, Vote, and Champions.
- Link destinations retain their original production paths. Next's `basePath` supplies `/testing` once on testing builds; callers never manually prepend it.
- Local development, Vercel preview builds, and explicitly opted-in local testing builds serve the current application under lowercase `/testing`. The static export rewrites are disabled only in that mode, preventing stale files and double prefixes. Explicit Vercel production builds always retain live mode, even with an inherited preview flag.
- Legacy uppercase URLs redirect with status 308. Unprefixed guest-page bookmarks on a development preview redirect with status 307 into testing. Redirects keep query values, repeated keys, and the current environment. Lowercase canonical routes do not redirect again.
- Testing middleware accepts GET/HEAD for the six review pages and their assets, blocks mutating requests, and excludes administration, API endpoints, unrelated projects, and doubled testing prefixes. Existing form and voting safeguards remain unchanged.
- Header and footer match the exact active route and expose `aria-current="page"`. Footer now reads the pathname as a client component. The mobile menu retains toggle, close-on-selection, route-change close, Escape/focus-return, visible focus, and 44px minimum targets; constrained grid sizing avoids introducing fixed-width overflow.
- The voting backlink is Back to Home. Homepage structure, visual design, forms, validation, vote handlers, and data logic were retained.

## Modified files

Routing and navigation:

1. `next.config.ts`
2. `src/middleware.ts`
3. `src/lib/siteNavigation.ts`
4. `src/components/Nav.tsx`
5. `src/components/Footer.tsx`
6. `src/app/page.tsx`
7. `src/app/dips/page.tsx`
8. `src/app/vote/page.tsx`

Verification and notes:

9. `scripts/verify-navigation.mjs` — new local-only GET/HEAD route verifier.
10. `scripts/verify-testing-preview.mjs` — adapt main-route label/RSC expectations; keep static-preview assertions.
11. `tests/navigation-routing.test.mjs` — new configuration, matching, redirect, and isolation tests.
12. `tests/helpers/navigation-module.mjs` — evaluate the real shared route module without integrations.
13. `tests/phase1-ui.test.mjs` — shared links, active states, footer, homepage actions, mobile menu.
14. `tests/phase1-workflows.test.mjs` — adapt imports and assert the shared home/empty-state links; retain no-write preview tests.
15. `tests/phase1-5-page-states.test.mjs` — adapt the shared empty-state action.
16. `tests/production-mode.test.mjs` — explicit production override and preserved static rewrites.
17. `tests/testing-canonical.test.mjs` — adapt middleware module dependencies; preserve production routing assertions.
18. `docs/navigation-routing.md` — this report.

## Validation results

- All 70 automated tests passed, including production workflow mocks, disabled testing submissions/voting/auth, all six routes, current-link matching, mobile toggle/selection/Escape/focus behavior, mixed casing, repeated/encoded queries, trailing slashes, no loops, blocked writes, and production API/method pass-through.
- Testing-mode production build and TypeScript checks passed with `NEXT_PUBLIC_DESIGN_PREVIEW=true`.
- Production-mode build and TypeScript checks passed with `VERCEL_ENV=production NEXT_PUBLIC_DESIGN_PREVIEW=true`, proving that production overrides the preview flag.
- Local HTTP verification passed for all six testing URLs and all six normal URLs. It covered direct URL entry, repeated GETs/refreshes, HEAD requests, App Router navigation payloads, all internal links, active states, query URLs, indexing mode, and disabled testing/enabled production registration controls.
- All six legacy routes passed three case variants with and without trailing slashes. Redirect destinations retained query values, repeated keys, and ordering; no loops occurred.
- All 35 testing-mode and 36 normal-mode page assets loaded successfully. The existing local static `/testing` snapshot and its page payloads, styles, fonts, icons, and images also passed the retained verification script.
- Complete production configuration, including resolved headers and rewrites, matched the baseline exactly in four production environment combinations. Protected-file diffs were empty for Firebase/settings, database/storage rules, APIs, admin, registration forms, packages, and `public/testing`.
- Targeted ESLint and `git diff --check` passed. Existing unrelated lint findings were not changed.
- All HTTP verification used GET/HEAD only. The API route was checked with an empty query, which returns its existing validation error before credentials or external service calls. No forms, auth signups, or votes were submitted.

## Reproduce locally

Testing build/server:

```sh
NEXT_PUBLIC_DESIGN_PREVIEW=true npm run build
NEXT_PUBLIC_DESIGN_PREVIEW=true npm run start -- --hostname 127.0.0.1 --port 3014
```

In another terminal:

```sh
node --experimental-strip-types --test tests/*.test.mjs
node scripts/verify-navigation.mjs http://localhost:3014 testing
```

Normal-mode build/server and route checks:

```sh
VERCEL_ENV=production NEXT_PUBLIC_DESIGN_PREVIEW=true npm run build
VERCEL_ENV=production NEXT_PUBLIC_DESIGN_PREVIEW=true npm run start -- --hostname 127.0.0.1 --port 3015
```

In another terminal:

```sh
node scripts/verify-navigation.mjs http://localhost:3015 production
node scripts/verify-testing-preview.mjs http://localhost:3015
```

Stop the prior server before rebuilding the same checkout. Plain `npm run dev` also enables testing mode automatically. Use localhost in the verifier: the local Next runtime canonicalizes redirect origins to localhost even when bound to 127.0.0.1.

## Limitations and routing risks

- Browser automation could not connect in this session. Actual browser hydration/click transitions, rendered keyboard focus, viewport overflow, and real device touch behavior still require a manual browser check. HTTP/RSC and isolated component tests passed, but do not replace that visual check.
- Next's own trailing-slash canonicalization can add a redirect before case normalization and may serialize spaces as `+` rather than `%20`. Query values, repeated keys, and ordering are preserved, and the tested redirect chains terminate.
- The public `/testing` URL remains the existing pinned static snapshot because this task explicitly excludes production deployment. This development branch previews current source; it does not regenerate or publish that snapshot. A future publication must deliberately choose the preview-source deployment or rebuild the static snapshot.
- Both `basePath` and testing mode are build-time settings. Build and start a given artifact with the same environment mode. Production builds on Vercel explicitly disable testing mode.

No production deployment was performed.
