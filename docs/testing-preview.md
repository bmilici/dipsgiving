# Shared design preview at /Testing

The reviewed Phase 1 redesign is published as a standalone static application under `/Testing`. The main homepage, original pages, API routes, Firebase configuration, and production workflows remain on their existing source.

## What is published

- `/Testing`
- `/Testing/register`
- `/Testing/register/dip`
- `/Testing/dips`
- `/Testing/vote`
- `/Testing/winners`

All internal preview navigation stays inside `/Testing`. The preview ships its own styles, fonts, scripts, illustrations, and sponsor images under `public/Testing`. Search indexing is disabled through both metadata and `X-Robots-Tag` headers. No Vercel preview sign-in is required on the production domain.

## Review behavior

The public version is a design review, not an alternate production registration/voting entry point. It displays a notice on every page. In the exported copy only:

- Registration submission handlers contain no writes, and submit buttons are disabled.
- The voting handler contains no transaction, and vote controls remain disabled.
- Automatic anonymous sign-in is removed so reviewing voting does not create auth users.
- Existing public lists can still load through read-only queries using the site's public Firebase configuration.

These export-only changes do not alter the original production form or voting source. The development redesign branch is also retained separately.

## Rebuild

`build-testing-preview.mjs` pins the reviewed source revision `264f29ae90d380c0230bc021f9e1741cce714652`. To rebuild it:

```sh
node scripts/build-testing-preview.mjs \
  --env-dir /path/to/local/project \
  --dependencies /path/to/installed/node_modules
```

The helper archives the reviewed source into a temporary workspace, retains the six routes, applies the preview-only protections, builds with Next.js static export and `basePath: '/Testing'`, and installs the complete output in `public/Testing`. It keeps exported route payload `.txt` files for client navigation. Only the seven public Firebase settings are selected from the specified environment, kept in memory, and passed to the build; no environment files or server credentials are published.

The original Tailwind stylesheet excludes generated preview files from class scanning. Its existing colors and typography remain unchanged.

Rebuilding produces generated hashed assets; commit the entire regenerated `public/Testing` directory together. The source helper fails if expected source blocks or any of the six exported pages/payloads are missing.

## Verify

After building and starting the production app locally:

```sh
npm run build
npm run start -- --hostname 127.0.0.1 --port 3012
node scripts/verify-testing-preview.mjs http://127.0.0.1:3012
```

The verification script checks the unchanged main design, all six preview routes, links, disabled submit controls, read-only notices, no gate code, noindex headers, static client-navigation payloads, and preview scripts/styles/images. It makes only GET requests and submits no data. It can also verify the deployed public URL by passing `https://www.dipsgiving.com`.
