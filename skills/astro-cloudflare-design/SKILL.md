---
name: astro-cloudflare-design
description: Turns any design input (nothing at all, a sentence, a mood, screenshots, links, a brand PDF, a logo, font files, or a ready DESIGN.md) into a DESIGN.md in Google's design.md format, generates the site's CSS tokens from it, puts brand assets and fonts in their canonical folders, previews the result on a dev-only /design/ page, and styles the site's components and pages; dark mode is offered every time. Use on a site built by astro-cloudflare-workers-setup, at any time (during setup, right after it, or months later), when the user says "design my site", "style my site", "make it look like…", "here is my DESIGN.md", "here is my brand kit / logo / fonts", "change the colors", "change the fonts", "add dark mode", or asks about the look of the site.
---

# Design system for an Astro site on Cloudflare Workers

Skill directory: `${CLAUDE_SKILL_DIR}`. Every `references/` and `assets/` path is relative to it. The setup skill is its sibling: `${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/`.

**Open by orienting the user, in plain language:** "I'll turn whatever you show or tell me about the look into one design file, `DESIGN.md`, then style the site from it, and you'll see it on a preview page before anything goes live. You can bring anything (files, links, examples, a mood) or nothing at all, and I'll propose something."

**Two roles.** 🤖 Claude runs commands, writes every file and verifies. 👤 The user brings material, approves the interpretation and judges the preview (marked `👤 USER ACTION`). Each hand-off: state it, wait, verify.

**How it works.** `DESIGN.md` (repo root, google-labs-code/design.md format) is the single source of truth: tokens are normative, prose gives context. `scripts/design-tokens.mjs` (`npm run design`) turns it into `src/styles/tokens.css`: CSS variables (`--color-*`, `--type-*`, `--rounded-*`, `--spacing-*`) plus `.type-*` text-style classes, with a `prefers-color-scheme: dark` block for every `<x>-dark` color. `global.css` imports it on line 1. `tokens.css` is generated, committed and never edited by hand; `npm run verify` fails when it drifts (`design:check`). Components get **scoped `<style>` blocks that use those variables**: no generated component CSS, no utility system, no `style=""`, no `define:vars` (the hashed CSP blocks both). Fonts come only through Astro's Fonts API.

**Where things live** (one place each; folders under `src/assets/` are created on first use):

| Path | What | Deployed |
| :-- | :-- | :-- |
| `DESIGN.md` | the design system | no |
| `src/styles/tokens.css` | generated CSS | yes |
| `src/assets/brand/` | marks and raster originals the site shows | only if imported |
| `src/assets/fonts/` | font files + licence, for `fontProviders.local()` | yes, via the Fonts API |
| `src/assets/images/` | photography used on pages | only if imported |
| `public/brand/` | only files that need a stable public URL | yes, as is |
| `design/` | references, PDFs, screenshots, mood boards; `design/README.md` records provenance | never |
| `src/pages/design/[...slug].astro` | the preview at `/design/` | never (dev only) |

## Preconditions — check, and stop with the reason if any fails

```bash
node -v; grep -c "@astrojs/cloudflare" astro.config.mjs; npm pkg get scripts.verify scripts.design; ls src/styles/global.css src/layouts/Layout.astro 2>&1; head -1 src/styles/global.css; ls -d DESIGN.md scripts/design-tokens.mjs src/pages/design src/styles/tokens.css 2>&1; grep -c '"yaml"' package.json; grep -c '^## Design system' CLAUDE.md 2>/dev/null; git status --porcelain --untracked-files=no | wc -l
```

- **Built by the setup skill (v2.0+):** the adapter in `astro.config.mjs`, `src/styles/global.css`, a `verify` script. Missing → this skill doesn't apply; say so.
- **Node ≥ 22.23.4.** **Clean git tree:** the last line prints 0 (untracked files don't count) → else 👤 ask the user to commit or stash first; this skill commits.
- **No `src/layouts/Layout.astro` yet** (setup still before its Step 13): Steps 1–3, 5 and 7 work now; Steps 4, 6 and 8 wait for setup Step 13; mid-setup, skip Step 8's CHANGELOG line, push and live check (setup Steps 17 and 12 carry them).
- **Any of** `DESIGN.md`, `scripts/design-tokens.mjs`, `src/pages/design`, the `yaml` devDependency, the `tokens.css` import, the CLAUDE.md section **missing** (a site from before 3.1) → run *Scaffold* first.
- No `CLAUDE.md` yet = a setup before its Step 17: skip the CLAUDE.md part of Scaffold (the setup template brings the section).
- `DESIGN.md` already has values → `references/resume.md`.

## Scaffold (only when something is missing)

Copy without overwriting anything (an existing `DESIGN.md`, `tokens.css` or `.prettierignore` is kept), then the rest. Read `npm pkg get scripts.verify`. If it already contains `design:check`, leave it. If it is the setup skill's `npm run build && wrangler deploy --dry-run`, set it to `npm run design:check && npm run build && wrangler deploy --dry-run`; otherwise prepend `npm run design:check && `.

```bash
S="${CLAUDE_SKILL_DIR}/assets/site"; (cd "$S" && find . -type f) | while read -r f; do [ -e "$f" ] || { mkdir -p "$(dirname "$f")" && cp "$S/$f" "$f" && echo "added $f"; }; done
for l in src/styles/tokens.css DESIGN.md; do grep -qxF "$l" .prettierignore || echo "$l" >> .prettierignore; done
npm i -D yaml
npm pkg set scripts.design="node scripts/design-tokens.mjs" scripts.design:check="node scripts/design-tokens.mjs --check"
```

- Edit `src/styles/global.css`: `@import './tokens.css';` as **line 1** (an `@import` after any rule is ignored), then a blank line, then what was there.
- Site `CLAUDE.md`: insert `assets/templates/claude-md-section.md` as a new section after the whole `## Conventions` section (before the next `##`), and replace that section's `global.css` bullet with: "The site starts with **no opinionated styling**; all styling comes from `DESIGN.md` (see *Design system*). `src/styles/global.css` (imported by `Layout.astro`) holds the `tokens.css` import, the universal reset (`box-sizing`, responsive images) and, once designed, base rules that use tokens only; scoped `<style>` blocks for component styles." (no `## Conventions` → at the end). The template ends with two Commands-table rows after an HTML comment: they are not part of the section. In the site's Commands table, replace the `npm run verify` row with the template's and add its `npm run design` row right after.
- `npm run design && npm run verify`: after npm's `> … design` script banner, the generator line is `tokens.css: no values yet (DESIGN.md is a stub)` (or the counts, for a kept `DESIGN.md`), and the next line is `… unchanged` or `wrote …`; then `verify` prints the summary again, `0 errors`, `Complete!` and the dry run as before. `git add -A && git commit -m "Add design-system scaffold"`.

## Steps

### Step 1 — Intake (👤)

👤 **USER ACTION** — ask one open question: *"Show or tell me anything about how it should look: files, links, examples, a mood, or nothing at all and I'll propose something. I'll include a dark scheme unless you'd rather not."*

Accept any amount, in any form, over several messages. **File each item as it arrives** (copy; never move the user's originals), and add a line per file to `design/README.md` *Provenance* (where it came from):
- the logo or mark → `src/assets/brand/` (the favicon stays `public/favicon.svg`; replace it only if the user says so);
- font files and their licence → `src/assets/fonts/`; photography for pages → `src/assets/images/`;
- everything else (screenshots, PDFs, brand sheets, mood boards) → `design/`. Links: read them; save nothing unless the user asks.

A `DESIGN.md` handed over → put it at the root (the user's file wins over the stub) and give it a Provenance line in `design/README.md` (who supplied it, when), then go straight to Step 3, which validates it; the interpretation step is skipped. If Step 3 reports `no values yet` or `no token block found`, treat the file's prose as Step 2's material (keep the prose, add the tokens). If the user wants dark mode and the file has no `-dark` colors, add them (Step 2's colors bullet) and confirm in one line.

### Step 2 — Interpret and write `DESIGN.md`

Read `references/design-md-format.md` first. From the material (or, with nothing, from the site's purpose and copy), derive:
- **colors:** `primary`, `secondary`, `tertiary`, `neutral`, `surface`, `on-surface`, `error`, plus `on-primary` and any other `on-<x>` text sits on; a `-dark` sibling for every color that should change in the dark scheme (unless the user declined dark mode);
- **typography:** roles `headline-display` … `label-sm` with real families, sizes, weights and **quoted** `lineHeight` values; `fontFamily` as `"var(--font-<role>, <Family>, <generic>)"` when the family is a web font;
- **rounded** and **spacing** scales; `components` for buttons, inputs and links (they guide Step 6; they don't become CSS);
- the prose sections in spec order, and `## Do's and Don'ts` filled with the user's own hard rules.

Use the recommended names unless the material dictates others. Where the material is silent, choose; where it contradicts itself, pick one and say so.

👤 **USER ACTION** — state the interpretation in **five lines**: the palette in words, the type pairing, the feel, the layout idea, and what was ignored or guessed. Ask for a yes (or changes) before writing. Then write the whole file in one go.

### Step 3 — Validate and generate

```bash
npm run design && npm run design:check
```

Read the summary (`tokens.css: 7 colors (7 dark), 9 type styles, 5 spacing, 5 rounded`): the counts must match what was written. The summary counts base tokens; `-dark` partners are the number in parentheses, so a file with 7 colors and 7 dark pairs prints `7 colors (7 dark)`. Exit 1 names the token at fault (duplicate key, unquoted `#`, missing reference, cycle): fix `DESIGN.md`, re-run. Warnings (bare `lineHeight`, bare spacing number, unknown typography property) get fixed too. Rows: `references/pitfalls.md`.

### Step 4 — Fonts

For each web-font family in `DESIGN.md`, register it once in `astro.config.mjs` (import `fontProviders` from `astro/config`) with `cssVariable: '--font-<role>'` and `fallbacks: ['<generic>']` matching the role (`['serif']` for a serif face, `['sans-serif']` otherwise; Astro builds a metric-matched fallback from it):
- hosted: `{ provider: fontProviders.google(), name: '<Family>', cssVariable: '--font-<role>', fallbacks: ['<generic>'], weights: [...], styles: ['normal'], subsets: ['latin'] }` (a variable font: `weights: ['100 900']`);
- local files in `src/assets/fonts/`: `{ provider: fontProviders.local(), name: '<Family>', cssVariable: '--font-<role>', fallbacks: ['<generic>'], options: { variants: [{ src: ['./src/assets/fonts/<file>.woff2'], weight: '400', style: 'normal' }] } }`.

On a redesign, remove `fonts:` entries and `<Font>` tags for families no longer named.

Add `<Font cssVariable="--font-<role>" preload />` (from `astro:assets`) to `Layout.astro`'s `<head>` for each, and the same lines (with the `Font` import) to the `<head>` of `src/pages/design/[...slug].astro` so the preview loads them. Make every `fontFamily` that names this family start with `var(--font-<role>, …)`. Step 2 writes it that way; a dropped-in file usually doesn't, so edit it. Then `npm run design`. Never `@fontsource`, never a `<link>` to a font host. System stacks need nothing here.

### Step 5 — Preview (👤)

```bash
npm run dev
```

👤 **USER ACTION** — open `http://localhost:4321/design/` (the URL the dev server prints, plus `/design/`). It shows the palette with dark pairs, every `.type-*` style, spacing and rounded steps, and a sample page (headings, lorem ipsum, a list, links, a button, an input). (On a private site the dev server may show the lock page: the live passkey won't work on localhost; enrol a local one with `npm run invite -- <name> --local` and open the printed URL first.) Ask them to switch the system to dark mode once. They reply with changes → back to Step 2 (edit `DESIGN.md`, Step 3; the page reloads). Loop until they approve. Then `npx astro dev stop`.

### Step 6 — Style the site

- `global.css` may now gain base rules below the reset, from tokens only: `body` background and text color (`var(--color-surface)`, `var(--color-on-surface)`), body type, link and `:focus-visible` colors.
- Layout, components and pages: scoped `<style>` blocks using `var(--color-*)`, `var(--spacing-*)`, `var(--rounded-*)` and `.type-*` classes on the elements. Follow `## Components`, `## Layout`, `## Elevation & Depth`, `## Shapes` and `## Do's and Don'ts`. No literal colors or sizes that a token covers; when the site needs one the tokens lack, add it to `DESIGN.md` first.
- **CSP:** no `style="…"`, no `define:vars`, no `<style is:inline>`; dynamic values via classes or data attributes. CSP is inactive in `npm run dev`, so check with `npm run preview` (Step 8).
- **WCAG 2.2 AA:** text contrast ≥ 4.5:1 in both schemes, a clearly visible `:focus-visible` ring, targets ≥ 24×24 CSS px, sticky UI never covers the focused element.
- Optional: the `frontend-design` skill for the component pass, **with `DESIGN.md` as the brief** ("the brief's own words always win": its tokens and rules are fixed, it composes within them).
- A private site's lock and invite pages (`src/pages/lock.astro`, `src/pages/invite/[token].astro`) are styled the same way; keep every `data-*` hook, and in the site `CLAUDE.md` change 'are unstyled on purpose' to 'are styled from `DESIGN.md`'.

### Step 7 — Images

If Claude drew the mark at setup (a monogram or simple shape: `git log -- public/favicon.svg`, the site's `CHANGELOG.md` or `design/README.md` Provenance line, or ask), recolor `public/favicon.svg`'s fills and strokes from the palette and note it in `design/README.md`. **A user-supplied mark is never recolored.** Then:

```bash
node "${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/scripts/gen-images.mjs" "<Site Name>" "<tagline>"
```

Same name and tagline as the setup used (`og:site_name`, `src/data/site.ts`). It now takes the card's background from `--color-primary` and text from `--color-on-primary`; add `--no-og` for a stealth site or a user-supplied `og.webp`. Read `public/og.webp` to check it.

### Step 8 — Verify, commit, push

The setup skill's local check (its Step 13), then the full verify:

```bash
npx prettier --write src astro.config.mjs --log-level warn
npm run build && npm run preview
python3 "${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/scripts/verify_site.py" http://localhost:4321 --local
npx astro preview stop
npm run verify && test ! -e dist/client/design && echo "no /design/ in the build"
```

Expect 0 FAIL (add `--stealth` on a stealth site, `--gated` on a private one), the generator summary first in `verify`, `0 errors`, `Complete!` and `no /design/ in the build`; the setup skill's Step 13 leak grep prints nothing. When dark mode was wanted, `grep -c 'prefers-color-scheme' src/styles/tokens.css` → 1. Add a `CHANGELOG.md` line. If the site deliberately departs from `DESIGN.md` anywhere, list it under "Site choices that override `DESIGN.md`" in the site's `CLAUDE.md`. `git add -A && git commit -m "Design system: <one line>"` (the site's `.gitignore` already excludes secrets and build output) and push: Workers Builds deploys.

Wait for the build with the setup skill's Step 12 `gh api` line (re-run every ~30 s until `completed success`), then `python3 "${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/scripts/verify_site.py" https://<canonical host>` (the custom domain, or the `*.workers.dev` URL; add `--stealth`/`--gated` as before): 0 FAIL; and `curl -sI https://<canonical host>/design/` → 404 (a private site's gate answers signed-out requests with the lock page or 401 first; the build check above already showed no `/design/`).

## Completion

- `DESIGN.md` has values; `npm run design:check` passes; `tokens.css` is committed and non-empty.
- Workers Builds reports `completed success` for the pushed commit; the live verifier shows 0 FAIL and `/design/` is absent there (404, or the gate on a private site).
- Tell the user: to change the look, edit `DESIGN.md` (or ask Claude), `npm run design`, commit both; `/design/` shows it under `npm run dev` only; their files are in `src/assets/` and `design/`; this skill can be run again at any time.

## Troubleshooting

`references/pitfalls.md`. The three that matter most: a group defined in both the front matter and a fenced block is **rejected** (the stub's `colors: {}` counts); an unquoted `#hex` is a YAML **comment**, so the color vanishes; `style=""` and `define:vars` **work in dev and vanish under the CSP**.

## Versions (verified 2026-11-05)

| Thing | Verified | Note |
| :-- | :-- | :-- |
| `yaml` (devDependency, the generator's only one) | 2.9.1 | ^2 |
| design.md spec | `main`, 2026-10-16 (interleaved yaml blocks) | `version: alpha`; expect changes |
| `@google/design.md` CLI | 0.4.0 | **not used**: alpha, drops unquoted `lineHeight`, its CSS export omits typography, and it lags the spec |
| astro / Fonts API | 7.4.5 | the Fonts API is stable since astro 6.0 |
