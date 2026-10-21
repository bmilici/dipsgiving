# Updated text-message preview image

Updated the existing social preview with the built-in `image_gen.imagegen` tool in edit mode. The approved output was visually inspected: `5TH ANNUAL` and `12/05/2026` are correct, with the Dipsgiving lettering and food illustration preserved.

Project assets:

- `public/og-image-5th-2026.png` — new versioned image used by Open Graph and Twitter metadata.
- `public/og-image.png` — same updated artwork retained at the legacy image URL.

Both PNGs are 1536 × 1024, matching the updated Open Graph dimensions. The new URL gives crawlers a fresh image identity when they read the page's updated metadata. Previously sent message previews may retain a cached thumbnail; the website cannot force a messaging app to replace those already cached cards.

Only the two images, share metadata in `src/app/layout.tsx`, and this note are included. The separate navigation-development branch and the static testing snapshot are unchanged.

Final image-edit prompt:

```text
Use case: text-localization.
Asset type: existing Dipsgiving text-message / social-link preview image.
Input image: the supplied local og-image.png is the edit target.
Primary request: make exactly two text corrections in the existing image: replace "4TH ANNUAL" with "5TH ANNUAL", and replace "11/22/2025" with "12/05/2026".
Constraints: Preserve the word "Dipsgiving" exactly, the existing cream background, teal lettering, font styles, text positions, proportions, arrangement, colors, all hand-drawn bowls/dips/chips, borders, shadows, and overall composition. Keep the original landscape aspect ratio and entire uncropped image. No added elements or new text. No redesign. Keep the same visual typography, alignment, sizing and spacing for both replacement text lines. Output an opaque image, not transparent.
```
