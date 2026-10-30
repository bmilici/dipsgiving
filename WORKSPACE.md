# Dipsgiving workspace

Use this folder as the single active Dipsgiving checkout:
`/Users/bmilici/Desktop/Current Projects/dipsgiving`

Current branch: `dev/sponsor-categories`.
Sponsor update: `56463d5`, based on production source `2ba5d05`.
Sponsor order: Amber Reyes, smiLee, Point Ybel, Via Brio, One Fresh Hat, AT.

## Preserved work

Previous primary-folder changes, including untracked files, are preserved in the
Git stash named `Preserve primary workspace before consolidation 2026-10-30`.
Inspect with `git stash show --stat --include-untracked stash@{0}`.
Recover on the original `main` baseline in this folder when needed; do not blindly
apply this stash onto the current release source.

Unpublished development commits remain on `dev/rj-2025-champions`.
All previous branches remain available in this repository.

Private archives of the three removed temporary checkouts, including their local
configuration but excluding Git metadata, dependencies, and build outputs, are in
`local-only/consolidation-2026-10-30/`. Keep these archives private.
The original primary-folder local-only files and environment configuration remain here.

The temporary checkouts were removed using `git worktree remove` after archiving.
Use branches within this folder for future work to avoid duplicate active copies.

## Publication

The sponsor update was published with explicit user approval on October 30, 2026.
Live sponsor order, links, and the Via Brio image were verified at
https://www.dipsgiving.com/. Deployment: `dpl_5K1nJdTohLoKitFCABbpw3ZB5zCS`.

## Sponsor categories development preview

Preview: https://dipsgiving-6tne80twh-brad-milicis-projects.vercel.app/testing

- Prize Sponsors: Amber Reyes.
- Event sponsors: smiLee and Point Ybel.
- Good friends, good businesses: One Fresh Hat, AT Pressure Washing, then Via Brio.

These category changes are development-only and have not been promoted to production.
