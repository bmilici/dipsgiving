# Shared design preview at /testing

The reviewed Phase 1.5 polish is published as a standalone static application under `/testing`. The main website now uses the same approved design with normal production workflows. The testing snapshot remains isolated, and API routes, Firebase configuration, and business handlers are preserved.

## What is published

- `/testing`
- `/testing/register`
- `/testing/register/dip`
- `/testing/dips`
- `/testing/vote`
- `/testing/winners`

All internal preview navigation stays inside `/testing`. The preview ships its own styles, fonts, scripts, illustrations, and sponsor images under `public/testing`. Search indexing is disabled through both metadata and `X-Robots-Tag` headers. No Vercel preview sign-in is required on the production domain.

Old mixed-case `/Testing` bookmarks permanently redirect to lowercase `/testing`, preserving child paths and query strings. Canonical lowercase requests pass through without a redirect loop. The middleware changes only this preview prefix; main pages, APIs, administration, and unrelated apps pass through unchanged.

The preview includes the reviewed Phase 1.5 hero, tiled countdown with a dated fallback, welcoming RSVP and competitive dip-entry presentation, improved empty/loading states, and polished footer. The main website uses the approved design with normal submissions and existing voting settings.

## Review behavior

The public version is a design review, not an alternate production registration/voting entry point. It displays a notice on every page. In the exported copy only:

- Registration submission handlers contain no writes, and submit buttons are disabled.
- The voting handler contains no transaction, and vote controls remain disabled.
- Automatic anonymous sign-in is removed so reviewing voting does not create auth users.
- Existing public lists can still load through read-only queries using the site's public Firebase configuration.

These export-only changes do not alter the original production form or voting source. The development redesign branch is also retained separately.

## Rebuild

`build-testing-preview.mjs` pins the reviewed source revision `e8b86d163a57269dde39a7cdba7440a4b41170ae`. To rebuild it:

```sh
node scripts/build-testing-preview.mjs \
  --env-dir /path/to/local/project \
  --dependencies /path/to/installed/node_modules
```

The helper archives the reviewed source into a temporary workspace, retains the six routes, applies the preview-only protections, builds with Next.js static export and `basePath: '/testing'`, and installs the complete output in `public/testing`. It keeps exported route payload `.txt` files for client navigation. Only the seven public Firebase settings are selected from the specified environment, kept in memory, and passed to the build; no environment files or server credentials are published.

The main Tailwind stylesheet excludes generated preview files from class scanning, so the standalone snapshot cannot change main-site styles. Generated assets are also excluded from source linting. Preview HTML/payloads revalidate; only hashed preview scripts/fonts/styles use immutable caching.

Rebuilding produces generated hashed assets; commit the entire regenerated `public/testing` directory together. The source helper fails if expected source blocks or any of the six exported pages/payloads are missing.

## Verify

After building and starting the production app locally:

```sh
npm run build
npm run start -- --hostname 127.0.0.1 --port 3012
node scripts/verify-testing-preview.mjs http://127.0.0.1:3012
```

Three isolated canonicalization tests also pass via `node --test tests/testing-canonical.test.mjs`. They cover mixed-case bookmarks, lowercase loop prevention, and unchanged main/API/game behavior without network calls.

The verification script checks the promoted main design, all six preview routes, links, disabled submit controls, read-only notices, no gate code, noindex headers, static client-navigation payloads, and preview scripts/styles/images. It makes only GET requests and submits no data. It can also verify the deployed public URL by passing `https://www.dipsgiving.com`.
