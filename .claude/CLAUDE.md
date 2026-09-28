# CLAUDE.md

Guidance for Claude Code when working in **this repository**, the repo that *develops* the skill.

## What this repo is

A Claude Code **plugin** with two skills: `astro-cloudflare-workers-setup` guides Claude Code from an empty folder to a live, auto-deploying Astro static site on Cloudflare Workers; `astro-cloudflare-passkey-login` takes such a live site and makes it private with passkey-only sign-in.

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
      gen-images.mjs — favicon.ico, apple-touch-icon.png, og.webp from the mark
    references/
      pitfalls.md            — symptom → fix troubleshooting table
      anonymity-variant.md   — the stealth / coming-soon variant
      resume.md              — evidence one-liner + rules for picking up a half-done setup
      maintenance.md         — Phase E / Step 18, read only when the user asks
    assets/
      CLAUDE.md.template     — project guide the skill writes into new sites
      site/                  — files identical for every site, copied once at Step 8
  astro-cloudflare-passkey-login/      ← THE SECOND SKILL — live site → private site
    SKILL.md         — preconditions, inputs, 12 steps, completion
    references/
      technical-design.md    — the ported design: architecture, KV model, flows, gate, threat model, verified facts
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
  - Don't add a fourth script without a strong reason (see *Rejected* below).
- **`assets/site/`** holds only files that are byte-identical for every site: `.editorconfig`, `.prettierrc`, `.nvmrc`, `src/styles/global.css`, `public/_headers`, `.github/dependabot.yml`, `.mcp.json` and `.claude/settings.json`.
  - The skill copies it once at Step 8 with `cp -R`. That overwrites, so on resume it runs only when `.nvmrc` is absent (the resume map's Step 8 signal).
  - Anything that varies per site stays with Claude (Layout, pages, robots.txt, README, the template fill).
  - Don't add `.vscode/`; the scaffold already ships it.
- **Generated-site contract:** the `npm` scripts are `build` = `astro check && astro build`, `check`, `deploy` = `npm run build && wrangler deploy`, and `verify` = `npm run build && wrangler deploy --dry-run`. `.claude/setup-inputs.json` is gitignored and removed at Completion. Keep SKILL.md, the template and `verify_site.py` consistent with these names.

## Design principles: hard-won, don't quietly undo them

These came out of several rounds of multi-agent review, cold end-to-end re-tests and the v2 audit (Sept 2026). The choices are deliberate:

- **Sites ship UNSTYLED.** `global.css` carries only a universal reset (`box-sizing`, responsive images), with no colors, fonts or layout. Styling is explicitly handed to the user. Don't add opinionated styling.
- **Two-role model.** 🤖 Claude runs commands; 👤 the user does browser and dashboard steps (marked `👤 USER ACTION`). Each hand-off follows the same pattern: state it, wait, verify. Automate only the *verify* half of a hand-off (`wrangler whoami --json`, `curl -sI`, `gh` check runs, `verify_site.py --local`). Anything that needs an account, money or a browser stays with the user.
- **Verified baseline** (2026-09-26). The single source of truth is the *Versions & sources* table in SKILL.md, and Step 4's `npm ls` drift check enforces it. If you revise one, revise the other, plus README *Notes*.

  | | Verified | Floor the skill states |
  |---|---|---|
  | astro | 7.3.5 | ^7.2 (`session: false`) |
  | @astrojs/cloudflare | 14.3.3 | ^14.2 |
  | wrangler | 4.141.0 | ≥4.135 (Worker Previews) |
  | Node | 24 LTS (`.nvmrc`); tested on 22.16 | 22.12 (preflight FAILs below it, WARNs below 22.19) |
  | Python (scripts) | 3.9.6 | 3.9 |
  | Claude Code | 2.1.283 | — |

- **Keep the adapter, deliberately.** A purely static site doesn't *need* `@astrojs/cloudflare`, and dropping it was evaluated and rejected. It gives workerd-based `astro dev`/`preview`, auto-injected `/_astro/*` immutable caching, and a one-line `prerender = false` opt-in to on-demand pages.
- **The static build is an assets-only, binding-free Worker.**
  - The output is `dist/client/wrangler.json`, with no `main` and no bindings; the dry run prints `No bindings found.`
  - `session: false` (Astro 7.2+) removes the SESSION KV binding, so there is **no KV step**.
  - The adapter generates `wrangler.jsonc`; the skill keeps it and makes two small edits (`compatibility_date` = today, `assets.not_found_handling: "404-page"`). Don't hand-write a minimal one.
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
- HSTS `preload` by default.

## The passkey-login skill

- **Provenance.** `assets/site/` is a de-branded copy of the private sign-in built on twofabianos (`main`, commit `62a9a67`). Allowed differences: cookie names `__Host-auth-*`; event `auth:state`; `src/data/auth.ts` as a template (it also exports `RP_NAME` and `SITE_ORIGIN`, which `config.ts` and `invite.mjs` read instead of `data/site.ts` and a hard-coded origin); the hooks `Symbol.for` key; `kv()` in `kv.mjs` takes an injectable `readConfig` so the shipped test never reads the real `wrangler.jsonc`; generic wording in `invite.mjs` and one `redirect.ts` comment; `allowlist.ts` as a template without `/sw.js`, `/og-v1.png`, `/brand/**`, with `/og.webp`. Tests: only the pure-helper suites ship (the handler suites depend on twofabianos's two users), with URLs and names made generic and `auth-data.test.ts` rewritten to check the shape of `USERS`. Any other difference is a porting bug. To update, re-copy from twofabianos and re-apply the renames (Task 4 of `docs/superpowers/plans/2026-09-28-passkey-login-skill.md`).
- **No `scripts/` of its own.** It calls the setup skill's `verify_site.py --gated` by sibling path (`${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/scripts/`), which holds because both skills ship in one plugin.
- **Principles:** private = noindex on every response, OG kept so link previews work; the gate lives in the Worker entry, not middleware (middleware runs at build time for prerendered pages); ≥1 on-demand route always (an all-prerendered build silently drops `main`; the build guard enforces it); the `previews` block is required (Previews inherit nothing); the Worker sets headers itself (`_headers` doesn't apply to Worker-generated responses); fail closed; public by extension, never by directory; unstyled lock page; every setup invariant kept (`output: 'static'`, `session: false`, `imageService: 'compile'`, meta CSP, `not_found_handling`, no HSTS `preload`).
- **Rejected:** Cloudflare Access, a password gate, Better Auth / Auth.js, Lucia, Playwright in generated sites, path-prefix gating, `secrets.required`, challenges in KV, a `returnTo` parameter.
- **Testing:** the verifier fixture is in the plan (Task 1); the cold test is Task 6: a scratch site from the setup skill's Phase A, then this skill's Steps 1–7, then the negative build-guard run. On-invoke cost: about 5.3k tokens (2.1.0).

**Watch:** Cloudflare's `cf` CLI (1.0.0-beta.1 as of Sept 2026) is beta, keeps a second credential store, and is slated to merge into wrangler. Don't adopt it. Revisit when it reaches GA or lands inside wrangler.

## Testing a change

Paths below are relative to `skills/astro-cloudflare-workers-setup/`.

- **Syntax:**
  ```sh
  python3 -m py_compile scripts/*.py
  node --check scripts/gen-images.mjs
  ```
- **Scripts:**
  - `python3 scripts/preflight.py` exits 0 on a ready machine.
  - `python3 scripts/verify_site.py <https-url>` must not crash. Exit codes: 0 = no FAIL, 1 = FAIL present, 2 = bad or unreachable URL. Try it on a public site with redirects too, e.g. `cloudflare.com`.
  - In a scratch site, run `npm run build && npm run preview`, then `python3 scripts/verify_site.py --local http://localhost:4321`, expecting 0 FAIL. Stop the preview with `npx astro preview stop`.
- **gen-images:** in a scratch site, run `node <skill-dir>/scripts/gen-images.mjs "Smith & Jones" "A tagline"`.
  - `file public/favicon.ico` should report 4 icons.
  - `apple-touch-icon.png` should be 180×180 and `og.webp` 1200×630, with the `&` rendered.
  - Run it twice; the second run must produce byte-identical output.
- **Plugin:** both of these must pass.
  ```sh
  claude plugin validate . --strict                           # marketplace manifest
  claude plugin validate .claude-plugin/plugin.json --strict  # plugin: manifest, skills, root files
  ```
  Then run `claude --plugin-dir . plugin details astro-cloudflare-workers-setup` to watch each skill's on-invoke token cost (v1 was about 15.5k; v2.0 is about 19.3k after moving the resume map and Phase E into references, mostly the inline Step 13 Layout block and rationale bullets, which are the first places to trim). `claude plugin eval` is available if an `evals/` suite is added.
- **The procedure:** if you change the setup steps, have a fresh agent run **Phase A (Steps 1–9)** under `claude --plugin-dir <repo>` in a throwaway **empty** temp directory. Nothing may exist in the folder before the scaffold. Phase A needs no accounts and ends with `npm run verify`: 0 errors, `Complete!`, `No bindings found.`
- Phases B–E need real GitHub/Cloudflare accounts and a browser, so review them rather than running them.

## Releasing

Release from `main`.

1. **Bump `version`** in `.claude-plugin/plugin.json` (semver). **No bump = nobody receives it**, the owner included: the manifest version pins every user's cache. Bump the major when the stated floors or the generated project's shape change; the minor when a skill is added.
2. **Validate:** `claude plugin validate . --strict && claude plugin validate .claude-plugin/plugin.json --strict`.
3. **Commit and push.**
4. **Tag:** `claude plugin tag --push` from the repo root.
   - It checks that `plugin.json` and the marketplace entry agree, refuses on a dirty tree, and creates and pushes the annotated tag `astro-cloudflare-workers-setup--vX.Y.Z` to `origin`.
   - Preview it with `--dry-run`.
   - Optionally follow with `gh release create astro-cloudflare-workers-setup--vX.Y.Z`.
5. **Update the owner's install:** `claude plugin marketplace update kanjidoc && claude plugin update astro-cloudflare-workers-setup@kanjidoc`, then restart or run `/reload-plugins`.

## Knowledge policy

Record decisions and context **in the repo**, in this `CLAUDE.md` and in clear commit messages, not in personal Claude memory. The repo is the durable, shared record.
