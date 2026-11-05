# design/

Reference material for this site's look. **Nothing in this folder is deployed**: only `public/` and what pages import from `src/` reach the live site.

Put here: brand sheets, reference PDFs, screenshots, mood boards, inspiration, print-resolution originals.

The design system itself is `DESIGN.md` at the repo root. The files the site uses live elsewhere:

| What | Where | Deployed |
| :-- | :-- | :-- |
| Marks and raster originals the site shows | `src/assets/brand/` | only if a page imports them |
| Font files and their licence | `src/assets/fonts/` | yes, through Astro's Fonts API |
| Photography used on pages | `src/assets/images/` | only if a page imports them |
| Files that need a stable public URL | `public/brand/` | yes, as is |
| Generated CSS (never edit) | `src/styles/tokens.css` | yes |

## Provenance

One line per file or group: where it came from, and how any derived file was made (source file, tool, what changed). Keep it current when files are added.

- (nothing yet)
