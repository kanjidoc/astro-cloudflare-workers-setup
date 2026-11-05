# Design system for generated sites — decisions record (for the 3.1 spec)

Date: 2026-11-05. Status: decisions made with the owner during the 3.0.0 release; the 3.1 spec is written from this file, not from memory. Research behind it: session scratchpad `research/G-design-system.md` (the google-labs-code/design.md format, the twofabianos exemplar, W3C tokens, Astro facts, the `frontend-design` skill).

## The ask

Every site the plugin generates should carry the conventions and scaffolding for a design system, so that a user can either **drop in a `DESIGN.md`** (and any brand assets) or **chat with Claude about what they want**, and in both cases the same canonical files end up in the same canonical places and drive the site's styling. The site still ships unstyled until that happens.

## The format

- **`DESIGN.md` in the google-labs-code/design.md format** (https://github.com/google-labs-code/design.md; Google Labs, Apache-2.0, created 2026-04-10, ~28.7k stars, pushed 2026-11-03; a skills ecosystem exists around it and no competing convention has comparable adoption). It is the canonical format; the owner asked for it by name and the research confirmed it is current.
- Shape: a machine-readable token block (`name`, `colors`, `typography`, `rounded`, `spacing`, `components`, with `{colors.x}` references), then eight optional prose sections in a fixed order: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts. It carries no motion, elevation-value or voice tokens (prose only), and says nothing about file locations.
- **Do not depend on the official `@google/design.md` CLI** (0.4.0 alpha; its export drops typography; a known unquoted-`lineHeight` bug was closed unmerged; the spec on `main` has moved past the release). The plugin's generator reads `DESIGN.md` itself.

## What is baked in by Astro and Cloudflare (not ours to choose)

- Font files live under `src/` (`src/assets/fonts/`) and are declared with Astro's Fonts API (`fontProviders.local()` or a hosted provider).
- Images to optimize live in `src/assets/`; files in `public/` ship untouched at stable URLs.
- Nothing outside `public/` and the build output deploys, so a root-level reference folder is private by construction.
- The hashed meta CSP blocks inline `style` attributes and `define:vars`: every visual value flows through a CSS file and CSS variables.
- Site-wide CSS lives in `src/styles/` (the skill already imports `global.css` from `Layout.astro`).

## What twofabianos bolted on (reference only; do not generalize)

A Python generator with PyYAML (site scripts must be Node, no extra dependencies); a second `BRAND-KIT.md` that repeats install steps; exported token files in two formats the site never reads; non-spec token names only its generator understands; one font forced onto every text style; a hard "never show this brand name" rule; and its colors, fonts and artwork.

## What to take from twofabianos (convention, not brand)

1. Generated CSS that nobody edits by hand; regenerate from `DESIGN.md`.
2. Text-style classes derived from the typography tokens, fixed so each style uses its own font family.
3. A small manifest recording how each derived image was produced from the originals.
4. The site `CLAUDE.md` "Design system" section and its rules: `DESIGN.md` is the source of truth; never hand-edit generated CSS; no inline styles under the CSP; how to regenerate; a short "site choices that override `DESIGN.md`" list.

## Owner decisions (2026-11-05)

| # | Topic | Decision |
|---|---|---|
| 1 | Intake | **Free-form, not a questionnaire.** The user may give nothing, a hundred examples, a poem, screenshots, URLs, a brand file, anything. Claude interprets it, writes `DESIGN.md`, and from then on that file is gospel. A dropped-in `DESIGN.md` skips interpretation. |
| 2 | Preview page | **Yes, dev-only, simple.** A `/design/` page that renders the palette, type scale and spacing straight from the generated CSS, with enough sample copy (lorem ipsum, headings, lists, links, a form row) and formatting to be a reliable example. Renders nothing when `DESIGN.md` is empty; excluded from production builds. |
| 3 | Contrast facts | **No.** The generator does not print contrast ratios. WCAG guidance stays as prose. |
| 4 | Brand-aware images | **Must.** `gen-images.mjs` uses `DESIGN.md` colors and typography for the OG card, and for the favicon/mark when Claude drew the mark (a user-supplied mark is never recolored). |
| 5 | Dark mode | **Offered by Claude every time**, not on request. An optional second color block in `DESIGN.md` maps to `prefers-color-scheme: dark`. |
| 6 | Timing | **The design phase runs at any time**: during setup, right after, or days later in a different session, and can be revisited. It therefore lives in its **own skill** (working name `astro-cloudflare-design`), with its own triggers ("design my site", "make it look like…", "here is my DESIGN.md"), preconditions and resume logic. The setup skill only scaffolds the empty conventions so a later session finds them. |
| 7 | Build model | The generated CSS is **committed**; the generator is idempotent and runs via an npm script; `npm run verify` reports drift between `DESIGN.md` and the generated CSS. A site builds identically before, during and after the design phase. |
| 8 | Assets | **All types welcome**: vector marks, raster originals, fonts, photography, reference PDFs/images, each with a canonical location and a deployed-or-not status. |
| 9 | Ceiling | **Variables plus text-style classes only.** No generated component CSS, no utility-class system. Components are styled by Claude in scoped Astro styles using the variables. |
| 10 | Simplicity | Canonical, simple enough for someone who has never done this, extensible later. Fewer files beat more files. |
| 11 | Timing of the release | 3.0.0 (currency) ships first; 3.1 follows in the same session, validated on the kept throwaway site `acws-coldtest-20261105` (live at its workers.dev URL, connected to Workers Builds), which is deleted only after 3.1 validates. |

## Minimum canonical layout (from the research; the spec may refine names)

| Path | Purpose | Deployed | Written by |
|---|---|---|---|
| `DESIGN.md` | the design system, google-labs-code format; stub with headings and empty token block at scaffold time | no | scaffold → user drop-in or Claude |
| `src/styles/tokens.css` (name TBD) | generated CSS variables + text-style classes; empty `:root {}` until values exist; committed | yes (as CSS) | generator |
| `src/styles/global.css` | existing reset; gains an `@import` of the generated file | yes | scaffold |
| `scripts/design/*.mjs` (name TBD) | the Node generator, shipped into the site as an asset; no dependencies beyond Node | no | scaffold |
| `src/assets/brand/` | marks and raster originals Astro may optimize | via `<Image>` | user drop-in / Claude |
| `src/assets/fonts/` | local font files for the Fonts API | yes (hashed) | user drop-in |
| `public/brand/` | only when a stable public URL is needed | yes | user / Claude |
| `design/` (or `docs/design/`, TBD) | references, PDFs, screenshots, inspiration; never deployed | no | user drop-in |
| `src/pages/design.astro` (dev-only) | the preview page | no | scaffold |
| `CLAUDE.md` "Design system" section | the rules above | no | setup skill template |

## Open choices for the 3.1 spec (lead decides, with defaults)

1. Generator parsing: zero-dependency (own minimal YAML subset reader for the token block) vs the `yaml` package. Default: zero-dependency if the token block's YAML subset is small enough; otherwise `yaml` as the single dev dependency.
2. CSS variable naming: the official export's `--color-*`, `--spacing-*`, `--rounded-*` plus `--font-*`/`--type-*` for typography. Default: follow the official names where they exist.
3. Brand files default home: `src/assets/brand/` (optimizable) vs `public/brand/` (stable URLs). Default: `src/assets/brand/`, with `public/brand/` documented for stable URLs.
4. Whether to run the official linter: no (alpha); the generator validates what it needs.
5. Reference folder name: `design/` vs `docs/design/`. Default: `design/`.

## Principles that must survive

Unstyled by default (the scaffold adds pipes, not paint); two-role model; one canonical place per thing; CSP-clean (no inline styles); no new plugin scripts (the generator ships into the site as an asset, like the passkey ops scripts); the design skill costs no tokens until invoked; everything the user can do by chat they can also do by dropping in files.
