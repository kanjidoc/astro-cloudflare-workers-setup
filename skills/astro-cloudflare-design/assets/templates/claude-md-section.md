## Design system

- **`DESIGN.md`** (repo root, in the [google-labs-code/design.md](https://github.com/google-labs-code/design.md) format) is the source of truth for the look: its tokens are normative, its prose gives context. **Read it before any visual work.** While it is an empty stub the site stays on browser defaults.
- **`src/styles/tokens.css` is generated** — `npm run design` writes it from `DESIGN.md` via `scripts/design-tokens.mjs` (CSS variables `--color-*`, `--spacing-*`, `--rounded-*`, `--type-*`, plus `.type-*` text-style classes); `global.css` imports it first. **Never hand-edit it.** `npm run design:check` runs inside `verify` and fails when it is out of date.
- **CSP** — the hashed CSP blocks inline `style=""` attributes and `define:vars`: style components in scoped `<style>` blocks with `var(--…)`.
- **Fonts** — only through Astro's Fonts API (see *Architecture*), never `@fontsource` or a `<link>` to a font host.
- **Where design files go:**
  - `src/assets/brand/` — marks and raster originals Astro may optimize.
  - `src/assets/fonts/` — self-hosted font files and their licence.
  - `src/assets/images/` — photography used on pages.
  - `public/brand/` — only when a file needs a stable public URL.
  - `design/` — references, PDFs, screenshots, mood boards; never deployed. `design/README.md` records what came from where and how derived files were made.
- **`/design/`** — a dev-only preview of the palette, type scale, spacing and a sample page (`npm run dev`); absent from every build, so it 404s in production by design.
- **Site choices that override `DESIGN.md`:** (none yet)
- **To create or change the design**, run the `astro-cloudflare-design` skill from the plugin — or edit `DESIGN.md`, run `npm run design`, and commit both files.

<!-- Scaffold on an older site: everything above this comment is the section. The two rows below are not part of it: they go into the site CLAUDE.md's Commands table (replace the existing `npm run verify` row with the first; add the second right after it). -->
| `npm run verify` | `design:check` + `build` + `wrangler deploy --dry-run` — no login, nothing deployed. Expect the `tokens.css:` summary line, `0 errors`, `[build] Complete!`, `No bindings found.` |
| `npm run design` | Regenerate `src/styles/tokens.css` from `DESIGN.md`. Run after every `DESIGN.md` edit and commit both files (`npm run design:check` reports drift). |
