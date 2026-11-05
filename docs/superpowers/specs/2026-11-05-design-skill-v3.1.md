# v3.1.0 — the design system: `astro-cloudflare-design` skill + scaffold

Date: 2026-11-05. Status: the contract for the 3.1 build. Decisions come from `2026-11-05-design-system-decisions.md` (owner decisions D1–D11 there) and the research `research/G-design-system.md` (scratchpad). This spec turns them into files and steps. Builders implement it; reviewers judge against it.

## 1. Decisions (settled)

| # | Decision |
|---|---|
| S1 | **Third skill `astro-cloudflare-design`** (folder and `name` identical). It runs at any time on a site built by the setup skill (v2.0+): during setup, straight after, or days later in another session. It owns the design files; the setup skill only scaffolds them. |
| S2 | **`DESIGN.md` at the repo root in the google-labs-code/design.md format** is the single source of truth. Tokens are normative; prose gives context. Section order: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts (all optional, order fixed). Recommended names are used unless the user's material dictates others. `lineHeight` values are always quoted strings (`"1.5"`), so the official tooling never drops them. |
| S3 | **Dark mode is spec-clean:** a color named `<x>-dark` is the dark-scheme value of `<x>`. The generator emits `@media (prefers-color-scheme: dark)` overrides and `color-scheme: light dark` when any `-dark` color exists. No unknown top-level keys. Claude offers dark mode every time. |
| S4 | **Generator:** `scripts/design-tokens.mjs`, shipped into the site as an asset (Node, ESM, deterministic, no network). One devDependency: `yaml` (installed at setup Step 4 and by the design skill on older sites). It reads the front matter and any fenced ```` ```yaml ```` blocks (merged; duplicate top-level keys are an error), resolves `{a.b}` references, and writes `src/styles/tokens.css`. `--check` exits 1 when the file on disk differs from what it would write (drift). |
| S5 | **CSS contract** (`src/styles/tokens.css`): `:root { --color-<name>; --spacing-<k>; --rounded-<k>; --type-<name>-family/size/weight/line/tracking }` plus `.type-<name>` classes (font-family, size, weight, line-height, letter-spacing, `font-feature-settings`, `font-variation-settings` when present). Each `.type-*` uses its own `fontFamily`. `components` are not emitted (spec says they are for lint/agents). An empty or stub `DESIGN.md` yields exactly `:root {\n}\n`, so an unstyled site stays unstyled. The file carries a one-line generated header and is listed in `.prettierignore`. |
| S6 | **`global.css` imports it first**: `@import './tokens.css';` as line 1 of the shipped `src/styles/global.css` (the reset follows). Nothing else in global.css changes: still no colors, fonts or layout. |
| S7 | **Canonical locations:** `DESIGN.md` (root, not deployed); `src/styles/tokens.css` (generated, committed, deployed as CSS); `scripts/design-tokens.mjs`; `src/assets/brand/` (marks and raster originals Astro may optimize; deployed only if imported); `src/assets/fonts/` (self-hosted font files + licence for `fontProviders.local()`); `src/assets/images/` (photography used on pages); `public/brand/` only when a stable public URL is needed; `design/` (root, never deployed: references, PDFs, screenshots, mood boards, inspiration, a `README.md` that records what came from where and how derived files were made). Folders under `src/assets/` are created on first use, not scaffolded. `design/README.md` is scaffolded. |
| S8 | **Dev-only preview page** `src/pages/design/[...slug].astro`: `getStaticPaths` returns one path in dev and none in production, so `/design/` exists under `npm run dev` and is absent from every build. It imports `tokens.css?raw`, parses the `--…` names, and renders palette swatches (with their `-dark` pairs), the type scale as live samples, spacing and rounded steps, and a sample page: headings, two paragraphs of lorem ipsum, a list, links, a button and an input row, so the user can judge a design by looking. Unstyled site → the page says "DESIGN.md has no values yet" and shows the sample page in browser defaults. Uses only classes from `tokens.css` and its own scoped `<style>` (CSP-clean). **Self-contained** (its own `<html>` shell with a `noindex` meta and `import '../../styles/global.css'`), because the setup skill copies it at Step 8, before `Layout.astro` exists (Step 13). |
| S9 | **npm scripts:** `design` = `node scripts/design-tokens.mjs`, `design:check` = `node scripts/design-tokens.mjs --check`; `verify` becomes `npm run design:check && npm run build && wrangler deploy --dry-run`. `build`, `check`, `deploy`, `generate-types` unchanged (the passkey skill's `build` rewrite is unaffected). |
| S10 | **Intake is free-form.** Nothing, a sentence, a hundred screenshots, a poem, URLs, a brand PDF, an existing `DESIGN.md`: Claude reads whatever is given, interprets it, states the interpretation in a short summary (five lines, not a walkthrough), and writes `DESIGN.md`. A dropped-in `DESIGN.md` is validated and used as is. The user never has to learn the format. |
| S11 | **Styling ceiling:** variables plus `.type-*` classes from the generator; components are styled by Claude in scoped Astro `<style>` blocks using `var(--…)`. No generated component CSS, no utility system, no inline `style=""`, no `define:vars` (blocked by the hashed CSP). Fonts only via Astro's Fonts API (`fonts:` + `<Font cssVariable preload />`), never `@fontsource` or a `<link>`. The `frontend-design` skill may be used for the component pass **with DESIGN.md as the brief** ("the brief's own words always win"). |
| S12 | **Brand-aware images:** `gen-images.mjs` gains `--design` (default on when `src/styles/tokens.css` defines `--color-primary`): the OG card background is `--color-primary` (or `--color-surface` if no primary) and its text `--color-on-primary` (else white/black by luminance); `--no-design` keeps the neutral card. The mark: when Claude drew it (a monogram), Claude recolors the SVG from DESIGN.md before re-running gen-images; a user-supplied mark is never recolored. Typeface on the card stays the system sans (sharp renders SVG text with system fonts; documented limit). |
| S13 | **No contrast reporting** in the generator (owner decision). WCAG guidance stays in the setup skill's Step 15 prose and is repeated in one line in the design skill. |
| S14 | **Version 3.1.0** (a skill is added). Marketplace and plugin descriptions mention the design skill. |
| S15 | **Principles kept:** unstyled by default (the scaffold adds pipes, not paint); two roles; one canonical place per thing; CSP-clean; no new plugin scripts (the generator is a site asset; gen-images changes are an extension of an existing script); the design skill costs nothing until invoked; everything doable by chat is doable by dropping in files. |

## 2. Files to build

### 2.1 New skill `skills/astro-cloudflare-design/` (builder D1)

```
SKILL.md                      — ≤ 190 lines; frontmatter name + description only (spec fields)
references/design-md-format.md — the format, condensed for an agent writing the file (≤ 120 lines)
references/pitfalls.md         — symptom → cause → fix table
references/resume.md           — evidence one-liner + rules
assets/site/                   — byte-identical for every site, copied with cp -R:
  DESIGN.md                    — the stub (below)
  design/README.md             — the provenance/reference folder note
  scripts/design-tokens.mjs    — the generator
  src/styles/tokens.css        — the empty generated file (`:root {\n}\n` with the header)
  src/pages/design/[...slug].astro — the dev-only preview page
  .prettierignore              — `src/styles/tokens.css` and `DESIGN.md`
```

**SKILL.md content (procedure):**
- Frontmatter description (≤ 1024 chars, third person): what it does (turns any design input into a DESIGN.md in Google's design.md format, generates the site's CSS tokens, places brand assets and fonts in their canonical folders, previews the design, and styles the site's components; dark mode offered) and when (the user says "design my site", "make it look like…", "here is my DESIGN.md / brand kit / logo / fonts", "change the colors/fonts", "add dark mode", or asks about the look of a site built by astro-cloudflare-workers-setup; any time, including long after setup).
- Orientation (two sentences, plain language): what will happen, and that the user can bring anything or nothing.
- **Preconditions** (one command): a site built by the setup skill (`astro.config.mjs` with the adapter, `src/styles/global.css`, `npm run verify` present); `git status` clean; Node ≥ 22.23.4. If `DESIGN.md`, `scripts/design-tokens.mjs` or `src/pages/design/` are missing (a site from before 3.1): run the **Scaffold** step first.
- **Scaffold (only when missing):** `cp -R "${CLAUDE_SKILL_DIR}/assets/site/." .`, but never overwrite an existing `DESIGN.md` or `tokens.css` (check first); `npm i -D yaml`; add `@import './tokens.css';` as line 1 of `global.css` if absent; `npm pkg set` the two scripts and the new `verify`; append the "Design system" section to the site's `CLAUDE.md` from `${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/assets/CLAUDE.md.template`'s section (D2 puts the section in the template; D1 ships a copy at `assets/templates/claude-md-section.md` to append on older sites); commit "Add design-system scaffold".
- **Step 1 — Intake (👤).** Ask one open question: "Show or tell me anything about how it should look — files, links, examples, a mood, or nothing at all and I'll propose something." Accept any number of inputs; put files the user hands over into their canonical places (S7) as they arrive. If a `DESIGN.md` is handed over, go to Step 3 after validating it. Offer dark mode explicitly ("I'll include a dark scheme unless you'd rather not").
- **Step 2 — Interpret and write `DESIGN.md`.** Read `references/design-md-format.md`. Derive colors (primary, secondary, tertiary, neutral, surface, on-surface, error, plus `-dark` pairs when dark is wanted), typography roles (headline-display … label-sm) with real families, sizes, weights, quoted line heights, rounded and spacing scales, and the prose sections, from the material. State the interpretation to the user in five lines (palette in words, type pairing, feel, layout idea, what was ignored) and ask for a yes before writing. Write the file. Fill `## Do's and Don'ts` with the user's own hard rules.
- **Step 3 — Validate and generate.** `npm run design`; read the generator's summary (counts per group, unresolved references → fix). `npm run design:check` passes.
- **Step 4 — Fonts.** For a named family: Google provider via the Fonts API (`fontProviders.google()`), or `fontProviders.local()` for files in `src/assets/fonts/`; `cssVariable` `--font-<role>`; `<Font cssVariable preload />` in `Layout.astro`'s head; `DESIGN.md` typography `fontFamily` values use `var(--font-<role>)` first in the stack so `tokens.css` points at the self-hosted font. Then `npm run design` again.
- **Step 5 — Preview (👤).** `npm run dev`; the user opens `/design/`, looks, replies with changes; loop over Steps 2–5 until approved. (`npx astro dev stop` afterwards.)
- **Step 6 — Style the site.** Components and pages get scoped `<style>` using the variables and `.type-*` classes; `global.css` may gain base rules (`body` font/colors from tokens) only now; WCAG line (contrast ≥ 4.5:1, visible focus, targets ≥ 24 px). Optional: the `frontend-design` skill with DESIGN.md as the brief. CSP rules restated (no inline styles).
- **Step 7 — Images.** Recolor a Claude-drawn mark from the palette; re-run `node "${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/scripts/gen-images.mjs" "<Site Name>" "<tagline>"` (brand-aware by default); check `public/og.webp`.
- **Step 8 — Verify, commit, push.** Local check as in setup Step 13 (`npx prettier --write src astro.config.mjs`, `npm run build && npm run preview`, `verify_site.py --local`, stop); `npm run verify` (now includes `design:check`); confirm `/design/` is absent from `dist/client`; commit "Design system: <one line>", push (Workers Builds deploys). CHANGELOG line. Record "site choices that override DESIGN.md" in the site's `CLAUDE.md` section if any were made.
- **Completion:** `DESIGN.md` has values; `tokens.css` non-empty and in sync; the live site styled; the user knows: edit `DESIGN.md` → `npm run design` → commit; `/design/` is dev-only; where assets live.
- Versions: `yaml` (npm latest today), `@google/design.md` 0.4.0 not used (why), Astro Fonts API since 6.0.
- Resume: `references/resume.md` (evidence: `grep -c "^colors:" DESIGN.md`, `wc -c < src/styles/tokens.css`, `ls src/assets/fonts src/assets/brand design`, `npm run design:check`; rules).

**`references/design-md-format.md`:** the token schema (types, Dimension = px/em/rem, references `{a.b}` and where composite refs are allowed, variants as sibling keys, recommended names), section order and aliases, the quoting rule for `lineHeight`, how prose relates to tokens, the `-dark` convention (ours), `omitted`, what the spec lacks (motion, elevation values, voice → prose only), a complete minimal example (one of each group, both schemes), and the three mistakes that break tooling (duplicate keys, unquoted line heights, references to missing tokens).

**`assets/site/DESIGN.md` (stub):**
```
---
version: alpha
name: Site name
description: Design system for this site. Fill the tokens below (or let Claude write them from your material); the prose sections give context.
colors: {}
typography: {}
rounded: {}
spacing: {}
---

## Overview

## Colors

## Typography

## Layout

## Elevation & Depth

## Shapes

## Components

## Do's and Don'ts
```
(Empty maps keep the file valid; the generator treats empty groups as "no values".)

**Generator `scripts/design-tokens.mjs` contract:** usage `node scripts/design-tokens.mjs [--check] [--in DESIGN.md] [--out src/styles/tokens.css]`; exit 0 written/unchanged, 1 drift (`--check`) or validation error (message names the token), 2 usage/missing file. Parses front matter (`---` fences, CRLF-safe) plus fenced yaml blocks; merges top-level keys (duplicate → error); resolves `{path}` references recursively (cycle → error, missing → error); emits in input order; numbers get `px` only for `spacing`/`rounded` bare numbers (spec: Dimension or number); typography `fontSize` etc. pass through; `.type-<name>` classes after `:root`; the dark block last. Prints a one-line summary: `tokens.css: 7 colors (3 dark), 9 type styles, 5 spacing, 5 rounded` or `tokens.css: no values yet (DESIGN.md is a stub)`. Deterministic; trailing newline; LF. ~200 lines, readable, commented at the top with the contract.

### 2.2 Setup skill changes (builder D2) — `skills/astro-cloudflare-workers-setup/`

- **Step 4:** install line adds `yaml` (`… prettier prettier-plugin-astro yaml`) with a four-word reason ("`yaml` for the design generator").
- **Step 7:** scripts add `scripts.design="node scripts/design-tokens.mjs" scripts.design:check="node scripts/design-tokens.mjs --check"` and `verify` becomes `npm run design:check && npm run build && wrangler deploy --dry-run`. Note: `design:check` is a no-op pass on a stub.
- **Step 8:** copies the design conventions too: `cp -R "${CLAUDE_SKILL_DIR}/../astro-cloudflare-design/assets/site/." .` right after the existing copy (same once-only rule, keyed on the same `.nvmrc` signal), with three bullets: `DESIGN.md` stub + `design/README.md`; `scripts/design-tokens.mjs` + `src/styles/tokens.css` (generated, empty); `src/pages/design/` (dev-only preview). `global.css` bullet: "the reset, after `@import './tokens.css'`". `.prettierignore` bullet.
- **Step 9:** expected `npm run verify` output now starts with the generator's `tokens.css: no values yet` line.
- **Step 13 "Hand off the design":** rewrite to point at the skill: the page is plain by design; "when you want it styled — now, later, or another day — say 'design my site' and bring anything (files, links, examples, a mood) or nothing; the `astro-cloudflare-design` skill writes `DESIGN.md`, generates the CSS and styles the site. Dark mode is offered." Keep it to four sentences.
- **Completion summary "Design it" bullet:** same message, shorter.
- **`assets/site/src/styles/global.css`:** line 1 `@import './tokens.css';` then a blank line, then the existing reset; comment says the generated file comes from `DESIGN.md`.
- **`assets/CLAUDE.md.template`:** new section `## Design system` after Conventions: `DESIGN.md` (google-labs-code format) is the source of truth; read it before any visual work; `src/styles/tokens.css` is generated (`npm run design`; `npm run design:check` runs in `verify`); never hand-edit it; CSP: no inline styles/`define:vars`; fonts only via the Fonts API; canonical folders (one line each); `/design/` is dev-only; "Site choices that override DESIGN.md: (none yet)"; run the `astro-cloudflare-design` skill to create or change the design. Commands table: add `npm run design`; update `verify`.
- **`references/resume.md`:** Step 8 signal gains `DESIGN.md`; Step 7 signal unchanged (`verify-script`).
- **`references/pitfalls.md`:** rows: `design:check` fails ("tokens.css is out of date") → `npm run design` and commit; `/design/` 404 in production → by design; `yaml` missing → `npm i -D yaml`.
- **`references/maintenance.md`:** one line: editing the design = edit `DESIGN.md`, `npm run design`, commit.
- **Versions table:** add `yaml`.
- Keep the setup SKILL.md ≤ ~21.2k tokens on-invoke; trim elsewhere if needed (not the new text).

### 2.3 gen-images, README, repo guide, manifests (builder D3)

- **`scripts/gen-images.mjs`:** S12. Read `src/styles/tokens.css` if present; regex `--color-primary:\s*([^;]+);` etc.; resolve a `var(--color-x)` value one level; accept `#rgb`, `#rrggbb`, `rgb()`/`hsl()` strings only as literal SVG fill values (no color math beyond hex luminance for the text fallback); `--no-design` flag; the header comment documents it; determinism unchanged (same inputs → identical bytes). Node-only, uses the site's sharp as before. Test: twice byte-identical with and without tokens.
- **README.md:** "What's new in 3.1" (above 3.0): the design skill, DESIGN.md format, the two entry paths, dark mode, dev-only preview, brand-aware social card, `npm run design`; a new section "Designing the site" (plain language, how to invoke, what to bring); "What's in the box" rows for the new skill and its assets; Requirements unchanged.
- **`.claude/CLAUDE.md`:** repo layout (new skill tree); a "The design skill" section (principles: DESIGN.md source of truth; `-dark` convention; generator contract; dev-only page mechanism; no contrast reporting by decision; rejected: `@google/design.md` as a dependency, DTCG exports, BRAND-KIT.md, Python, component CSS generation); generated-site contract updated (`verify`, new scripts, new files); testing notes (generator unit checks in a scratch dir; cold test = scaffold on the kept throwaway site, drop-in path with a sample DESIGN.md, chat path with a brief, `/design/` under dev, absence in `dist/client`, live deploy); release = minor bump.
- **`.claude-plugin/plugin.json`:** `version` 3.1.0; description adds "and a design skill that turns any design input into a DESIGN.md, generated CSS tokens and a styled site". **`marketplace.json`:** description adds the same clause.

## 3. Verification plan

1. Generator: unit checks in a scratch dir (stub → `:root {\n}\n`; full example → expected CSS; `-dark` → media block; reference resolution; missing ref → exit 1; duplicate key → exit 1; `--check` drift → exit 1; CRLF input; fenced yaml block merge; byte-identical on re-run).
2. `claude plugin validate . --strict` both commands; `plugin details` (design skill on-invoke ≤ ~7k; setup ≤ ~21.2k).
3. On the kept throwaway site `acws-coldtest-20261105` (older-site path): run the design skill's Scaffold, `npm run verify` green, `/design/` renders under dev (browser screenshot), absent from `dist/client`.
4. Drop-in path: a sample `DESIGN.md` (written for the test, two schemes, two families) → `npm run design` → preview → build → deploy → live verifier 0 FAIL → OG card uses the primary color.
5. Chat path: a one-paragraph brief ("warm, bookish, dark mode yes") → Claude writes `DESIGN.md` → same checks.
6. Fresh Phase A cold run (headless, empty folder) to prove Steps 4/7/8/9 still pass with the scaffold: `tokens.css: no values yet`, `No bindings found.`, `/design/` absent from the build.
7. Passkey skill unaffected: its unit suite unchanged; `verify` with `design:check` passes on the passkey branch (spot check).

## 4. Out of scope (recorded)

Motion/elevation/voice tokens (prose only, per the format); DTCG export (on demand via the official CLI if ever wanted); a `tokens/` folder; running the official linter; per-component CSS generation; theme toggles beyond `prefers-color-scheme`; font files on the OG card.

## 5. Review amendments (applied after the three adversarial reviews)

- **Spacing numbers follow the spec:** a bare YAML number under `spacing` passes through unitless (counts, ratios) with a warning; write `8px` for a length. `rounded` bare numbers still get `px`. S4/S5 are amended accordingly.
- **Preview page:** self-contained (no `Layout`); its scoped stylesheet can still be emitted as an unlinked `_astro/*.css` once `tokens.css` exceeds Astro's inline threshold — harmless, documented in the page header and a pitfalls row. The asset ships Prettier-formatted so setup Step 13 leaves it unchanged.
- **Drop-in path:** `fontFamily` values must start with `var(--font-<role>, …)` for the Fonts API family to apply (Astro hashes `@font-face` names); prose-only files are treated as Step 2 material; dark mode is added when wanted.
- **Generator hardening:** unbalanced quotes/parentheses and comment markers in values are rejected; bare-number `fontSize`/`letterSpacing` fail with a unit hint; YAML merge keys supported; `-apple-system`/`BlinkMacSystemFont` never quoted; references inside `components` are checked; front-matter fences tolerate trailing whitespace; "no token block found" is reported distinctly from a stub.
- **Scaffold:** `verify` is read before it is set (prepend on a customised script); a site without `CLAUDE.md` (setup before Step 17) skips the CLAUDE.md part.
- **Setup resume:** a pre-rule migrates a 3.0 setup that stopped between Steps 4 and 8 (`yaml`, the Step 7 line, the no-clobber design copy, the import).
- **gen-images:** only opaque colors are used for the card.
- **Guide/README:** the preview-page description matches what ships; the Install section leads with "paste this into Claude Code"; the intro states the plan-checklist-hand-off behaviour.
- **Fresh Phase A (headless, 3.1.0 plugin, empty folder):** passes; `npm run verify` prints the generator line (after npm's banners), `0 errors`, `Complete!`, `No bindings found.`; `/design/` absent from the build; versions at baseline incl. `yaml` 2.9.1. Its wording findings are applied; the shipped generator is now Prettier-clean; the `Bash(npx wrangler deploy *)` ask rule was reverted because `ask` outranks the dry-run allow.
- **Recorded follow-up (not done):** progressive disclosure for the setup SKILL.md (~21.2k tokens on-invoke): keep Phase A and the hand-off protocol inline, load Phase C/D step detail from references per phase.
- **Design-skill cold run on the kept site (3.0-built):** Scaffold path (no clobber, `yaml`, import, scripts, CLAUDE.md section, `verify` green, `/design/` under dev, absent from the build); drop-in path with the sample DESIGN.md (`7 colors (7 dark), 6 type styles, 5 spacing, 5 rounded`; Fraunces + Public Sans via the Fonts API in both heads; `og card colors: --color-primary #1d3557`; Workers Builds `completed success`; live verifier **15 passed, 0 failed**; dark block live; `/design/` 404 live); chat path (new DESIGN.md from a one-paragraph brief, 9 colors/9 dark/9 type styles; build `completed success`; live 0 FAIL). Findings applied: Step 8 now waits for the build and verifies the canonical host live; resume rule 6 fixed; fallbacks per generic; old fonts removed on redesign; count wording; provenance for handed-over files; generator warns on `var(--font-x)` without a fallback. **Known limit (owner decision D3/S13):** no tool measures contrast; the sample's brass link (`#b8860b` on `#fbf8f1`, 3.07:1) shipped at 0 FAIL — Claude must check pairs while writing colors.
