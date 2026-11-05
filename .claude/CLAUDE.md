# CLAUDE.md

Guidance for Claude Code when working in **this repository**, the repo that *develops* the skill.

## What this repo is

A Claude Code **plugin** with three skills: `astro-cloudflare-workers-setup` guides Claude Code from an empty folder to a live, auto-deploying Astro static site on Cloudflare Workers; `astro-cloudflare-design` turns any design input into a `DESIGN.md`, generated CSS tokens and a styled site, at any time, during setup or after; `astro-cloudflare-passkey-login` takes such a live site and makes it private with passkey-only sign-in.

It's published (public, MIT) at **https://github.com/kanjidoc/astro-cloudflare-workers-setup**. This repo is the source of truth; the skill is edited here.

**Several `CLAUDE.md`-shaped files exist. Don't confuse them:**
- **This file** (`.claude/CLAUDE.md`) is guidance for working on the *skill repo*. It lives in `.claude/` on purpose: the marketplace source is `"./"`, so the repo root *is* the plugin root. A root `CLAUDE.md` fails `plugin validate --strict`. In `.claude/` it still lands in users' plugin caches (the cache copies the whole plugin root), but it is never loaded as context.
- `skills/astro-cloudflare-workers-setup/SKILL.md` is the skill itself: the instructions Claude follows to build an Astro site.
- `skills/astro-cloudflare-workers-setup/assets/CLAUDE.md.template` is the guide the skill writes into each *new site*.
- `skills/astro-cloudflare-workers-setup/assets/site/.claude/settings.json` is the generated site's permissions file. It has nothing to do with this repo's `.claude/`.

## Repo layout

```
.claude/CLAUDE.md    — this file (dev guidance; not shipped as context)
.claude-plugin/
  marketplace.json   — declares the "kanjidoc" marketplace + this plugin (source "./")
  plugin.json        — plugin manifest (name, version, license)
skills/
  astro-cloudflare-workers-setup/      ← THE SKILL — this is what you edit
    SKILL.md         — the skill: a 5-phase (A–E), ~18-step setup guide
    scripts/
      preflight.py   — checks the user's machine for required tools
      verify_site.py — verifies a site: <url> [--stealth] [--gated] [--local]
      gen-images.mjs — favicon.ico, apple-touch-icon.png, og.webp from the mark (card colors from tokens.css)
    references/
      pitfalls.md            — symptom → fix troubleshooting table
      anonymity-variant.md   — the stealth / coming-soon variant
      resume.md              — evidence one-liner + rules for picking up a half-done setup
      maintenance.md         — Phase E / Step 18, read only when the user asks
    assets/
      CLAUDE.md.template     — project guide the skill writes into new sites
      site/                  — files identical for every site, copied once at Step 8
  astro-cloudflare-design/             ← THE THIRD SKILL — any design input → DESIGN.md → tokens → styled site
    SKILL.md         — preconditions, scaffold (pre-3.1 sites only), 8 steps, completion
    references/
      design-md-format.md    — the google-labs-code format, condensed for an agent writing the file
      pitfalls.md            — symptom → cause → fix table
      resume.md              — evidence one-liner + rules for picking up a half-done design
    assets/
      site/                  — byte-identical design scaffold (setup Step 8 copies it; so does this skill's
                               Scaffold on older sites): DESIGN.md stub, design/README.md,
                               scripts/design-tokens.mjs, src/styles/tokens.css, src/pages/design/[...slug].astro,
                               .prettierignore
      templates/             — claude-md-section.md, the site CLAUDE.md "Design system" section for older sites
  astro-cloudflare-passkey-login/      ← THE SECOND SKILL — live site → private site
    SKILL.md         — preconditions, inputs, 12 steps, completion
    references/
      technical-design.md    — the design record: architecture, KV model, flows, gate, threat model, verified facts
      pitfalls.md            — symptom → fix table
      resume.md              — evidence one-liner + rules for picking up a half-done run
    assets/
      site/                  — the auth/gate code, byte-identical for every site (copied at its Step 3)
      templates/             — per-site files Claude fills: auth.ts, allowlist.ts, lock/invite pages,
                               wrangler additions, the CLAUDE.md section
docs/superpowers/   — design specs and implementation plans (not shipped as context)
README.md  LICENSE
```

## Where the skill runs: dev loop, not sync

The skill reaches people through one path: **this repo → GitHub → the `kanjidoc` marketplace → each user's plugin cache** (`~/.claude/plugins/cache/kanjidoc/astro-cloudflare-workers-setup/<version>/`). The owner is one of those users. A cached copy changes only when `plugin.json` `version` changes.

- **Test edits in place:** `claude --plugin-dir ~/Documents/Cursor/astro-cloudflare-workers-setup` (or `claude --plugin-dir .` from the repo root). The directory loads in place and overrides the installed `@kanjidoc` plugin for that session only. `/reload-plugins` picks up further edits.
- **Never rsync or copy the skill into `~/.claude/skills/`.** A personal copy loads *alongside* the plugin's copy, so the skill is duplicated, and the plugin copy stays stale anyway.
- **Ship it** by following *Releasing* below. Nothing reaches anyone, the owner included, until the version is bumped and pushed.

## Editing the skill

- The skill is `SKILL.md` plus its `scripts/`, `references/` and `assets/`. The skill directory is the only anchor:
  - SKILL.md refers to it as `${CLAUDE_SKILL_DIR}`. Claude Code substitutes that **only in SKILL.md content** (and `allowed-tools`).
  - Reference and asset files say `<skill-dir>`, meaning the directory SKILL.md names.
  - Never hard-code `~/.claude/skills/...`. That path doesn't exist for plugin installs, and v1 broke on it.
- **Keep the frontmatter spec-compliant.** Use Agent Skills spec fields only, so the skill also uploads to claude.ai.
  - `name`: ≤64 characters; lowercase, digits and hyphens.
  - `description`: **≤1024 characters** (the limit applies to `description`, not to the whole block). Say what the skill does **and** when to use it, in the third person, key use case first.
- **Scripts:** there are exactly three.
  - The two Python scripts are **standard library only**, for **Python 3.9+** (the macOS system `python3`). No third-party imports, no `pip install`; they must run on a clean machine.
  - `gen-images.mjs` is the **one Node exception**. It runs only inside a scaffolded site, from the project root, and loads that site's own `sharp` (an optional dependency of astro). It installs nothing.
  - Don't add a fourth script without a strong reason (see *Rejected* below). The design generator `design-tokens.mjs` is a site asset of the design skill, not a plugin script.
- **`assets/site/`** holds only files that are byte-identical for every site: `.editorconfig`, `.prettierrc`, `.nvmrc`, `src/styles/global.css`, `public/_headers`, `.github/dependabot.yml`, `.mcp.json` and `.claude/settings.json`.
  - The skill copies it once at Step 8 with `cp -R`, followed by the design skill's `assets/site/` (sibling path). That overwrites, so on resume both run when `.nvmrc` is absent (the resume map's Step 8 signal); a setup begun before 3.1 (`.nvmrc`, no `DESIGN.md`, no `CLAUDE.md`) re-runs only the design copy and its three follow-ups (references/resume.md, the pre-rule).
  - `global.css` starts with `@import './tokens.css';`, then the reset.
  - Anything that varies per site stays with Claude (Layout, pages, robots.txt, README, the template fill).
  - Don't add `.vscode/`; the scaffold already ships it.
- **Generated-site contract:** the `npm` scripts are `build` = `astro check && astro build`, `check`, `deploy` = `npm run build && wrangler deploy`, `design` = `node scripts/design-tokens.mjs`, `design:check` = `node scripts/design-tokens.mjs --check`, and `verify` = `npm run design:check && npm run build && wrangler deploy --dry-run`. Design files: `DESIGN.md`, `design/`, `scripts/design-tokens.mjs`, `src/styles/tokens.css` (generated, committed), `src/pages/design/` (dev-only), `.prettierignore` (`tokens.css`, `DESIGN.md`); `yaml` is a devDependency. `.claude/setup-inputs.json` is gitignored and removed at Completion. Keep SKILL.md, the template, the design skill and `verify_site.py` consistent with these names.

## Design principles: hard-won, don't quietly undo them

These came out of several rounds of multi-agent review, cold end-to-end re-tests, the v2 audit (Sept 2026) and the v3 currency audit (Nov 2026). The choices are deliberate:

- **Sites ship UNSTYLED.** `global.css` carries only the `tokens.css` import and a universal reset (`box-sizing`, responsive images), with no colors, fonts or layout; `tokens.css` is an empty `:root {}` until a design exists. Styling arrives only through the design skill, when the user asks. Don't add opinionated styling.
- **Two-role model.** 🤖 Claude runs commands; 👤 the user does browser and dashboard steps (marked `👤 USER ACTION`). Each hand-off follows the same pattern: state it, wait, verify. Automate only the *verify* half of a hand-off (`wrangler whoami --json`, `curl -sI`, `gh` check runs, `verify_site.py --local`). Anything that needs an account, money or a browser stays with the user.
- **The verified baseline** (2026-11-05). The single source of truth is the *Versions & sources* table in SKILL.md, and Step 4's `npm ls` drift check enforces it. If you revise one, revise the other, plus README *Notes* and the passkey and design skills' *Versions* tables.

  | | Verified | Floor the skill states |
  |---|---|---|
  | astro | 7.4.5 | ^7.4 (adapter 14.4 peer; `session: false` needs ≥7.2) |
  | @astrojs/cloudflare | 14.4.4 | ^14.4 |
  | wrangler | 4.157.0 | ≥4.135 (Worker Previews) |
  | create-astro | 5.3.1 | 5.x (`--no-ai`) |
  | @astrojs/sitemap | 3.7.4 | 3.7 |
  | @astrojs/check / typescript | 0.9.12 / 6.0.3 | TS ^6 (TS 7 unsupported by `astro check`) |
  | @types/node | 26.6.6 | matches `.nvmrc` major |
  | sharp | 0.35.5 | ^0.35.4 (astro optional dep) |
  | Node | 26 LTS (`.nvmrc`); tested on 26.10 | 22.23.4 (preflight FAILs below it) |
  | Python (scripts) | 3.9.6 (macOS system) | 3.9 |
  | Claude Code | 2.1.318 | — |
  | @simplewebauthn/server / browser | 14.0.3 / 14.0.0 | ^14 |
  | yaml | 2.9.1 | 2.x (design generator) |

- **Node 26 LTS pin, 22.23.4 floor.** `.nvmrc` says `26`; Workers Builds installs that major (its default is 24). Astro ≥7.4.2 refuses to start below 22.23.4. Preflight FAILs below the floor and WARNs on odd majors.
- **TypeScript stays on 6.** TS 7 is the Go port with no JS API; `astro check` refuses it and `@astrojs/check` peers `^5 || ^6`. Step 4 installs `typescript@6`, and the shipped Dependabot config ignores the `typescript` major.

- **Keep the adapter, deliberately.** A purely static site doesn't *need* `@astrojs/cloudflare`, and dropping it was evaluated and rejected. It gives workerd-based `astro dev`/`preview`, `/_astro/*` immutable caching (the adapter would inject the identical rule but skips it because `_headers` already sets one), and a one-line `prerender = false` opt-in to on-demand pages.
- **The static build is an assets-only, binding-free Worker.**
  - The output is `dist/client/wrangler.json`, with no `main` and no bindings; the dry run prints `No bindings found.`
  - `session: false` (Astro 7.2+) removes the SESSION KV binding, so there is **no KV step**.
  - The adapter generates `wrangler.jsonc`; the skill keeps it and makes three small edits (`compatibility_date` = today, `assets.not_found_handling: "404-page"`, `"previews": {}`). Don't hand-write a minimal one.
- **`previews: {}` is required.** `wrangler preview`, the Workers Builds preview command, refuses to run without a `previews` block. Empty is fine.
- **`imageService: 'compile'`** transforms images with sharp at build time and adds **no `IMAGES` binding**. It is also much faster (27 ms vs 1.9 s in testing). The default `'cloudflare-binding'` also works on static pages since adapter 14.3.2, but it attaches a Cloudflare Images binding.
- **One complete `astro.config.mjs` block at Step 4.** Later changes are small targeted Edits (`site`; `scriptDirective` added inside `security.csp`). `assets/site/.prettierrc` sets `singleQuote` so that block, and `global.css`, stay Prettier-clean — keep the Step 4/16 snippets in Prettier's output style. This stops keys from being dropped across piecemeal edits.
- **CSP:** Astro emits a hashed `<meta>` CSP (with `object-src 'none'` and `base-uri 'self'`, and `syntaxHighlight: false` because Shiki is CSP-incompatible).
  - Third-party script hosts, like the analytics beacon, go in `scriptDirective.resources`.
  - `X-Frame-Options` stays in `_headers`, because a meta CSP can't carry `frame-ancestors`.
  - HSTS ships **without `preload`**; it's opt-in only.
- **Stealth variant:** use `noindex` (meta tag plus `X-Robots-Tag`) and **never** robots `Disallow: /`. Crawlers must fetch a page to see its noindex.
- **Credentials:** local deploys use `wrangler login` (OAuth) or `CLOUDFLARE_API_TOKEN`, which takes priority. Step 10 checks `wrangler whoami` first and skips login when already authenticated. Workers Builds auto-creates its own scoped API token in the dashboard. No secrets live in the repo or on GitHub.
- The skill targets **macOS/Linux** (WSL2 on Windows).

**Rejected (don't re-propose without new evidence):**
- dropping the adapter;
- scaffolding with create-cloudflare (C3) `--framework=astro`;
- wrangler autoconfig / `wrangler setup`;
- the Deploy to Cloudflare button (import-first flow);
- a `site.py` orchestrator, config renderer or resume detector;
- `verify_site --json`;
- vendoring `verify_site.py` into sites, or npm scripts that point into the plugin cache;
- committing `extraKnownMarketplaces`/`enabledPlugins` or the Builds MCP into generated sites;
- HSTS `preload` by default;
- adapter 15 / `cf` until GA (see *Watch* below);
- the Workers Builds REST API in place of the dashboard connect (the GitHub App install is still a browser step; keep the two-role model).

## The passkey-login skill

- **Source of truth.** `assets/site/` is this plugin's own code; it has no upstream. Change it here, keep the unit suites green (see *Testing a change*), and re-run the cold test.
- **No `scripts/` of its own.** It calls the setup skill's `verify_site.py --gated` by sibling path (`${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/scripts/`), which holds because both skills ship in one plugin.
- **Principles:** private = noindex on every response, OG kept so link previews work; the gate lives in the Worker entry, not middleware (middleware runs at build time for prerendered pages); ≥1 on-demand route always (an all-prerendered build silently drops `main`; the build guard enforces it); the `previews` block is required (Previews inherit nothing); the Worker sets headers itself (`_headers` doesn't apply to Worker-generated responses); fail closed; public by extension, never by directory; unstyled lock page; every setup invariant kept (`output: 'static'`, `session: false`, `imageService: 'compile'`, meta CSP, `not_found_handling`, no HSTS `preload`).
- **Rejected:** Cloudflare Access, a password gate, Better Auth / Auth.js, Lucia, Playwright in generated sites, path-prefix gating, `secrets.required`, challenges in KV, a `returnTo` parameter.
- **Testing:** the verifier fixture is in the plan (Task 1); the cold test is Task 6: a scratch site from the setup skill's Phase A, then this skill's Steps 1–7, then the negative build-guard run. On-invoke cost: see *Testing a change*.

## The design skill

- **What it owns.** `DESIGN.md` and everything derived from it. The setup skill only scaffolds the empty conventions; the design skill runs any time after (during setup, right after, days later), scaffolds them itself on a v2.0+ site from before 3.1, and never overwrites an existing `DESIGN.md` or `tokens.css`. No `scripts/` of its own: it calls the setup skill's `gen-images.mjs` and `verify_site.py` by sibling path.
- **Principles:**
  - `DESIGN.md` at the site root, in the google-labs-code format (https://github.com/google-labs-code/design.md, `version: alpha`), is the single source of truth: tokens normative, prose context, sections in the spec's order. Recommended names unless the user's material dictates others. `lineHeight` always quoted (`"1.5"`): the official 0.4.0 parser drops unquoted numbers.
  - **`-dark` suffix:** a color `<x>-dark` is the dark-scheme value of `<x>` (only when `<x>` exists; otherwise an ordinary color). It keeps the file spec-clean (no unknown top-level keys). Claude offers dark mode every time.
  - **Generator contract:** `scripts/design-tokens.mjs [--check] [--in DESIGN.md] [--out src/styles/tokens.css]`; Node ESM, deterministic, no network, one devDependency `yaml`. Reads front matter plus fenced `yaml` blocks (duplicate top-level key = error), resolves `{a.b}` references (missing or cyclic = error), prints a one-line summary. Exit 0 written/unchanged, 1 drift (`--check`) or validation error, 2 usage/missing file. A stub yields exactly `:root {\n}\n` after the header, so an undesigned site stays unstyled. It is a site asset, not a plugin script.
  - **Generator messages:** stub summary `tokens.css: no values yet (DESIGN.md is a stub)`; counts summary `tokens.css: N colors (D dark), T type styles, S spacing, R rounded` (N excludes the `-dark` partners); drift (exit 1) `design-tokens: tokens.css is out of date with DESIGN.md (src/styles/tokens.css): run npm run design and commit both`.
  - **CSS contract** (`tokens.css`): `:root` { `color-scheme: light dark;` (only when a `-dark` pair exists); `--color-*` (every color, `-dark` included); `--type-<name>-family/size/weight/line/tracking`; `--rounded-*` (bare numbers get `px`, except 0); `--spacing-*` (bare numbers pass through unitless, with a warning) }, then `.type-<name>` classes, then last `@media (prefers-color-scheme: dark) { :root { --color-<x>: var(--color-<x>-dark); } }`. `components` are not emitted. Committed; in `.prettierignore`; never hand-edited.
  - **Styling ceiling:** variables plus `.type-*` classes. Claude styles components in scoped `<style>` with `var(--…)`; no generated component CSS, no utilities, no inline `style=""`, no `define:vars` (hashed CSP). Fonts only via Astro's Fonts API.
  - **Dev-only `/design/`:** `src/pages/design/[...slug].astro`; its `getStaticPaths` returns `[{ params: { slug: undefined } }]` when `import.meta.env.DEV`, else `[]`, so the route exists under `npm run dev` and is absent from every build. **Self-contained** (own `<html>` shell, `noindex` meta, imports `global.css`), never `Layout`, because setup Step 8 copies it before Step 13 builds the layout. It parses `tokens.css?raw` (the first declaration of each variable, so the light value). Swatches, spacing bars and corners carry `data-prop`/`data-value`; a bundled `<script>` applies them with `el.style.setProperty`, which CSSOM allows under the hashed CSP (only `style=""` attributes are blocked). Otherwise scoped `<style>` only.
  - **No contrast reporting**, by owner decision. WCAG stays prose (setup Step 15; one line in the design skill).
  - **Brand-aware OG card:** `gen-images.mjs` reads the light `:root` of `tokens.css` (`--color-primary`/`--color-on-primary`, else surface/on-surface, else neutral; luminance picks black/white text when no on-color exists); `--no-design` keeps the neutral card. Claude recolors a mark it drew; a user's mark is never recolored. The card's typeface stays the system sans.
  - **Canonical folders:** `src/assets/brand/` (marks, raster originals), `src/assets/fonts/` (font files + licence), `src/assets/images/` (photography), `public/brand/` (only for stable URLs), `design/` (references, never deployed; its `README.md` records provenance). Folders under `src/assets/` appear on first use.
- **Rejected:** depending on `@google/design.md` (alpha, lossy exports, the `lineHeight` bug); DTCG or Tailwind exports; a `BRAND-KIT.md`; a Python generator; generated component CSS or a utility system; theme toggles beyond `prefers-color-scheme`; contrast output; running the official linter; a `tokens/` folder; motion/elevation/voice tokens (prose only, per the format); font files on the OG card.
- **Testing:**
  - Generator, in a scratch dir: `cp -R skills/astro-cloudflare-design/assets/site/. <tmp>`, `cd <tmp> && npm init -y && npm i yaml@2`, then `node scripts/design-tokens.mjs` and `node scripts/design-tokens.mjs --check; echo $?` for a stub, a full DESIGN.md with `-dark` pairs, a missing reference and a drifted tokens.css. Also: stub → exactly `:root {\n}\n`; duplicate key → exit 1; CRLF input; fenced-block merge; byte-identical re-run.
  - Cold test on a site built with setup v3.0 or earlier: the skill's Scaffold, then `npm run verify` green; the drop-in path (a sample two-scheme, two-family `DESIGN.md`) and the chat path (a one-paragraph brief); `/design/` renders under `npm run dev` and is absent from `dist/client`; live deploy, `verify_site.py` 0 FAIL, OG card in the primary color. A fresh Phase A run must still end with `tokens.css: no values yet` and `No bindings found.`
  - On-invoke cost: ≤ ~7k (3.1.0: ~5.4k).
- **Record:** `docs/superpowers/specs/2026-11-05-design-system-decisions.md` (owner decisions) and `2026-11-05-design-skill-v3.1.md` (the 3.1 contract, S1–S15).

## Watch: adapter 15 / `cf` migration path

Decided (Nov 2026): stay on adapter 14 + wrangler until the revisit triggers below fire.

- **Status (2026-11-05).** `@astrojs/cloudflare@latest` is 14.4.4; 15 is beta only (`15.0.0-beta.5`, `beta` tag), peers astro `^7.4.4-beta.0`, has no wrangler peer, and runs on `@cloudflare/vite-plugin` 2.0 beta. `cf` is `1.0.0-beta.27` (npm `latest`, documented as beta); `cloudflare.config.ts` is open beta. No GA date anywhere. Cloudflare's stated plan: when the beta ends, a final wrangler major points to `cf`, with 18 months of wrangler maintenance after.
- **Hard stop.** Adapter 15 refuses to build a project that has `wrangler.jsonc` and no `cloudflare.config.ts` ("Run `npx cf migrate --bundler vite`"). Once `@latest` is 15, `npm i @astrojs/cloudflare@latest` breaks every generated site; Step 4 and `maintenance.md` say to pin `@14` until this migration ships.
- **Unchanged in 15:** default entrypoint; SESSION/IMAGES auto-bindings (still removed by `session: false` + `imageService: 'compile'`); the `ASSETS` binding; the `/_astro/*` injection and its skip-if-present rule.
- **What changes for a generated site:**
  - Packages: `npm i -D cf` and `@astrojs/cloudflare@15`; keep `wrangler` while any wrangler command is used (wrangler doesn't read `cloudflare.config.ts`, so `wrangler.jsonc` stays too).
  - Config: in a clean tree, `npx cf migrate --bundler vite --dry-run`, then without `--dry-run`. It writes `cloudflare.config.ts` (`worker.name`, `worker.compatibilityDate`, `worker.assets.notFoundHandling`, …; `assets.directory` comes from Vite; `previews` becomes a `ctx.isPreview` branch) and exits 1, with a `throw` at the top, until `[required]` items are resolved.
  - Files: `.cloudflare/` in `.gitignore`; `cloudflare.config.ts` and `.cloudflare/types` in `tsconfig.json` `include`; the `generate-types` (`wrangler types`) script goes.
  - Scripts: `deploy` → `astro check && cf deploy`, `verify` → `astro check && cf deploy --dry-run` (`cf` runs Astro's build, not npm scripts). Wrangler can't deploy Vite plugin v2 output.
  - Workers Builds: deploy/preview commands → `npx cf deploy` / `npx cf previews deploy`. Not yet documented by Cloudflare, nor whether Builds' auto-created token works with `cf`.
  - Still wrangler: `wrangler tail`, a single `secret put`, and the passkey skill's `kv namespace create`, remote `kv key …` and `preview base-config secret put` (no `cf` equivalents mapped yet).
  - Auth: `cf` keeps its own store (`cf auth login`) but reads `CLOUDFLARE_API_TOKEN` first, so a token lane needs no second login. It needs Node ≥22.18 (the floor covers it).
- **Guard rail.** Never run `cf dev|build|deploy|init` in an unmigrated wrangler project, CI included: it writes a fresh `cloudflare.config.ts` that ignores `wrangler.jsonc` and rewrites `package.json`, the lockfile and `.gitignore` without asking when there's no TTY. Since wrangler 4.150, `wrangler deploy`, `versions upload` and `preview` refuse to run while `.cloudflare/output/` exists; `--dry-run` still passes, so `npm run verify` won't catch it.
- **Revisit when** `@astrojs/cloudflare` `latest` moves to 15; `cf` drops "beta"; Vite plugin v2 reaches GA; the Workers Builds docs show `cf deploy`; or `cf` gains single-secret and tail support. Then migrate a scratch site, run Phase A cold, update Steps 4–9 and 12, the template, this guide's *Generated-site contract* and the passkey ops, and bump the major.

## Testing a change

Paths below are relative to `skills/astro-cloudflare-workers-setup/`.

- **Syntax:**
  ```sh
  python3 -m py_compile scripts/*.py
  node --check scripts/gen-images.mjs
  node --check ../astro-cloudflare-design/assets/site/scripts/design-tokens.mjs
  ```
- **Scripts:**
  - `python3 scripts/preflight.py` exits 0 on a ready machine.
  - `python3 scripts/verify_site.py <https-url>` must not crash. Exit codes: 0 = no FAIL, 1 = FAIL present, 2 = bad or unreachable URL. Try it on a public site with redirects too, e.g. `cloudflare.com`.
  - In a scratch site, run `npm run build && npm run preview`, then `python3 scripts/verify_site.py --local http://localhost:4321`, expecting 0 FAIL. Stop the preview with `npx astro preview stop`.
- **gen-images:** in a scratch site, run `node <skill-dir>/scripts/gen-images.mjs "Smith & Jones" "A tagline"`.
  - `file public/favicon.ico` should report 4 icons.
  - `apple-touch-icon.png` should be 180×180 and `og.webp` 1200×630, with the `&` rendered.
  - Run it twice; the second run must produce byte-identical output.
  - Then with a `src/styles/tokens.css` defining `--color-primary` (with and without `--color-on-primary`): the card takes the brand colors, still byte-identical on re-run; `--no-design` reproduces the neutral card byte for byte.
- **Plugin:** both of these must pass.
  ```sh
  claude plugin validate . --strict                           # marketplace + plugin (since 2.1.289)
  claude plugin validate .claude-plugin/plugin.json --strict  # plugin alone (redundant, harmless)
  ```
  Then run `claude --plugin-dir . plugin details astro-cloudflare-workers-setup` to watch each skill's on-invoke token cost (v1 was about 15.5k; v2.1.1 measured about 19.8k for the setup skill and 5.5k for passkey-login; v3.0.0 measures about 20.8k and 5.9k on Claude Code 2.1.318, with ~495 tokens always-on; v3.1.0 measures ~21.2k (setup), ~6k (passkey), ~5.4k (design), ~780 always-on; keep setup ≤ ~21.2k. The inline Step 13 Layout block and rationale bullets are the first places to trim). `claude plugin eval` is available if an `evals/` suite is added.
- **Workers Builds in a cold test:** when the account's GitHub App already covers the owner's repos, `POST /accounts/{id}/builds/workers` (script tag, GitHub numeric ids, an existing build token uuid, `previews_enabled: true`) connects the throwaway repo without the dashboard; the production build and a branch Preview then prove the `.nvmrc` and `previews` choices. Users still go through the dashboard (Step 12).
- **Passkey unit suites:** in a scratch copy of `skills/astro-cloudflare-passkey-login/assets/site/`, add `assets/templates/auth.ts.template` → `src/data/auth.ts` (fill `<apex>`, `<site-name>`, `<user-1>`, `<user-2>`) and `allowlist.ts.template` → `src/lib/gate/allowlist.ts`, a `package.json` with `"type": "module"`, and `npm i @simplewebauthn/server@14 @simplewebauthn/browser@14` (no `typescript`); then `node --test 'tests/unit/*.test.ts'`. Expect 69/69, on Node 26 and on 24 (`npx -y -p node@24 node --test …`).
- **Edit and test in separate sessions.** A `--plugin-dir` directory is a protected path, so in a `claude --plugin-dir .` session Claude's own edits to the repo prompt (or go to the auto-mode classifier). Edit from a normal session; test in the `--plugin-dir` one.
- **The procedure:** if you change the setup steps, have a fresh agent run **Phase A (Steps 1–9)** under `claude --plugin-dir <repo>` in a throwaway **empty** temp directory. Nothing may exist in the folder before the scaffold. Phase A needs a GitHub account for Step 1 (`gh repo create`) but no Cloudflare account, and ends with `npm run verify`: `tokens.css: no values yet …`, 0 errors, `Complete!`, `No bindings found.`
- Phases B–E need real GitHub/Cloudflare accounts and a browser, so review them rather than running them.

## Releasing

Release from `main`.

1. **Bump `version`** in `.claude-plugin/plugin.json` (semver). **No bump = nobody receives it**, the owner included: the manifest version pins every user's cache. Bump the major when the stated floors change or the generated project's shape changes in a way that breaks existing sites; the minor when a skill is added or the shape grows additively (3.1 added the design files, the `design`/`design:check` scripts and a `design:check` step in `verify` without breaking a 3.0 site).
2. **Validate:** `claude plugin validate . --strict && claude plugin validate .claude-plugin/plugin.json --strict`.
3. **Commit and push.**
4. **Tag:** `claude plugin tag --push` from the repo root.
   - It checks that `plugin.json` and the marketplace entry agree, refuses on a dirty tree, and creates and pushes the annotated tag `astro-cloudflare-workers-setup--vX.Y.Z` to `origin`.
   - Preview it with `--dry-run`. It exits 1 ("already exists locally") until the version is bumped.
   - Optionally follow with `gh release create astro-cloudflare-workers-setup--vX.Y.Z`.
5. **Update the owner's install:** `claude plugin marketplace update kanjidoc && claude plugin update astro-cloudflare-workers-setup@kanjidoc`, then restart or run `/reload-plugins`.

## Re-auditing the plugin (the playbook used for 3.0.0 / 3.1.0, 2026-11-05)

Everything this plugin references moves every few weeks. When it is time to re-audit, repeat this; it takes one long session.

1. **Research, six domains in parallel, facts only, every claim cited to a document fetched that day.** Each researcher gets the files to read, the claims to verify and the sources: (A) Astro core: astro CHANGELOG from the last baseline, create-astro, `astro add`, `astro check`/TypeScript peers, `@astrojs/upgrade`, the docs MCP; (B) the Cloudflare adapter CHANGELOG, `astro add` output, Static Assets docs (as `index.md`), compatibility flags, the adapter-next beta; (C) wrangler CHANGELOG, Workers Builds/Previews/custom-domains/Registrar/Web Analytics/robots docs, the Builds API; (D) Claude Code: `claude plugin validate/details/tag`, the Agent Skills spec, permissions, MCP, headless flags, the changelog since the last baseline; (E) the passkey code: SimpleWebAuthn releases, WebAuthn L3, Workers KV/rate-limit/previews docs, Node `--test` on the pinned Node line (run the shipped unit suite); (F) Node release lines, TypeScript, npm, Prettier, Dependabot, the three scripts run for real (preflight shim matrix, `verify_site.py` against public sites, gen-images twice). For the design skill add (G): the google-labs-code/design.md spec and CLI, the `yaml` package, Astro Fonts/CSP docs; run the generator suite.
2. **Write the change spec** in `docs/superpowers/specs/` (decisions, the verified baseline table, cross-cutting facts, file-by-file edits, verification plan). Builders and reviewers work only from it.
3. **Build on disjoint files, then review adversarially**, one reviewer per builder, judged against the spec and the research; apply findings; re-review anything trimmed or rewritten late.
4. **Prove it**: both `validate --strict` commands; `plugin details` token costs; script syntax on `/usr/bin/python3` too; a headless Phase A in an empty folder (`claude -p "<brief with every answer>" --plugin-dir <repo> --permission-mode bypassPermissions --max-turns 400 --output-format stream-json`; the first real deploy is the site's own `ask` rule, run it from the orchestrator); a live deploy; Workers Builds connected through `POST /accounts/{id}/builds/workers` (script tag, GitHub numeric ids, an existing build token uuid, `previews_enabled`) to prove the Node pin and the `previews` block on a production build and a branch Preview; the passkey skill Steps 1–11 on the same site with the custom-domain precondition waived (`RP_ID`/`ORIGIN` = the workers.dev host); the design skill's scaffold, drop-in and chat paths on that site, `/design/` under dev and absent from `dist/client`; then delete the repo, Worker, KV namespaces and Previews.
5. **Release**: bump, validate, commit, push, `claude plugin tag --push`, `gh release create <tag> --notes-file <the README "What's new" section>`, then update the owner's install.

The 2026-11-05 records: `2026-11-05-currency-audit-v3.md` (with its review amendments and verification results), `2026-11-05-design-system-decisions.md`, `2026-11-05-design-skill-v3.1.md`.

## Knowledge policy

Record decisions and context **in the repo**, in this `CLAUDE.md` and in clear commit messages, not in personal Claude memory. The repo is the durable, shared record.
