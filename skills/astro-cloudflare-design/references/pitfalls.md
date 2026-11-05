# Pitfalls — symptom → root cause → fix

`<skill-dir>` is this skill's directory.

## The generator (`npm run design`)

| Symptom | Root cause | Fix |
|---|---|---|
| `duplicate top-level key "colors" (in the front matter and the yaml block at line N)` | the stub's front matter still has `colors: {}` and a fenced block under `## Colors` defines it again | keep each group in one place: delete it from the front matter (or move the block's tokens up) |
| `colors.primary has no value` | an unquoted `#hex`: YAML reads `#` as a comment | quote every color: `primary: "#1a1c1e"` |
| `colors.link: {colors.accent} is not defined` | a typo or a renamed token | fix the reference or add the token; references are `{group.token}` |
| `reference cycle: colors.a → colors.b → colors.a` | two tokens point at each other | give one of them a literal value |
| `… is a group, not a value` | `{typography.label-md}` used outside `components` | point at one property (`{typography.label-md.fontFamily}`); composite references are for `components` only |
| warning: `lineHeight is a bare number` | `lineHeight: 1.5` unquoted | quote it (`"1.5"`); the CSS is right either way, but the official design.md tools drop bare numbers |
| `token names may use only letters, digits, - and _` | a name with spaces or dots | rename it (`surface container` → `surface-container`) |
| `Cannot find package 'yaml'` | a site from before 3.1, or `node_modules` missing | `npm i -D yaml` (or `npm install` on a fresh clone) |
| `DESIGN.md not found` (exit 2) | run outside the project root | `cd` to the folder with `package.json` |
| `npm run verify` stops at `tokens.css is out of date` | `DESIGN.md` changed without regenerating, or `tokens.css` was edited by hand | `npm run design`, commit both files; never hand-edit `tokens.css` |
| warning: `spacing.md: bare number 16 passes through unitless` | the spec reads a bare spacing number as unitless (a count or ratio), so `16` is not a length | write the unit: `md: 16px`; leave it bare only for a count (`columns: 12`) |
| `typography.body-md.fontSize needs a unit ("16px" or "16rem")` | `fontSize`/`letterSpacing` given as a bare number | add the unit: `fontSize: 16px` |
| `… may not contain /*, */ or a backslash`, `has a ( with no matching )`, `has an unclosed '` | a value that would break out of its CSS declaration | fix the value (close the bracket or quote; drop the comment) |
| `components.button.typography: {typography.nope} is not defined` | a component points at a token that doesn't exist | fix the reference or add the token; components emit no CSS, but their references are checked |
| `tokens.css: no token block found in DESIGN.md` | the file has prose only: no `---` front matter and no ```` ```yaml ```` block | treat the prose as Step 2's material: keep it and add the tokens |

## The site

| Symptom | Root cause | Fix |
|---|---|---|
| Colors from `DESIGN.md` don't show | `global.css` lacks `@import './tokens.css';` on line 1 (an `@import` after any rule is ignored), or `Layout.astro` doesn't import `global.css` | put the import first; check `Layout.astro` |
| A style works in `npm run dev` but not in `npm run preview` or live | inline `style="…"` or `define:vars`: the hashed CSP blocks them and is inactive in dev | move the value into a scoped `<style>` using `var(--…)` or a `.type-*` class |
| A font falls back to the system font | the family isn't registered in `fonts:` / no `<Font cssVariable … />` in the head, or `fontFamily` lacks the `var(--font-<role>, …)` | Step 4: register it, add `<Font>`, put the variable first in `fontFamily`, `npm run design` |
| A font name with a digit (`Source Sans 3`) is ignored | unquoted in hand-written CSS | quote it; the generator already does |
| Dark mode changes some colors but not others | only colors with a `-dark` sibling change; references resolve to light literals | add `<x>-dark` for each color that should change (`on-surface-dark`, …) |
| `/design/` 404s in production | by design: `getStaticPaths` returns no path outside `npm run dev` | nothing to fix; preview with `npm run dev` |
| `/design/` shows "DESIGN.md has no values yet" after editing | `tokens.css` not regenerated | `npm run design` (the dev server picks it up) |
| `/design/` swatches are blank | JavaScript disabled, or the script was removed (it applies per-token values via CSSOM, since `style=""` is blocked) | keep the page's `<script>` |
| Scaffold overwrote nothing but `.prettierignore` lacks the entries | the site already had a `.prettierignore` | append `src/styles/tokens.css` and `DESIGN.md` (the Scaffold loop does) |
| Prettier reformats `tokens.css` and `design:check` fails | `.prettierignore` missing the entry | add it, `npm run design` |
| `dist/client/_astro/` holds a `.css` file that no page links | the dropped `/design/` page's stylesheet: it may be emitted as a file, even though the page itself isn't built, when `tokens.css` is large and the page's styles are not inlined | harmless either way (nothing links it, it carries no secrets); nothing to fix |

## Images

| Symptom | Root cause | Fix |
|---|---|---|
| `og.webp` still neutral after designing | gen-images not re-run, or `--no-design` passed, or no `--color-primary`/`--color-surface` literal in `tokens.css` | Step 7: re-run gen-images without `--no-design` |
| The card's text is the system font | sharp renders SVG text with system fonts | expected; for a branded card, supply a 1200×630 `public/og.webp` and pass `--no-og` |
| The user's logo changed color | it was recolored | never recolor a user-supplied mark; restore it from git |
