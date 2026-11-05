# Currency audit → v3.0.0 — change spec

Date: 2026-11-05. Status: the contract for the v3.0.0 build. Six research reports (A–F, in the session scratchpad `research/`) verified every claim in both skills against documents fetched today. This spec turns their findings into decisions and file-by-file edits. Builders implement it; reviewers judge against it.

Research files (read the one(s) your files cite; each has claim | status | current fact | replacement text | source tables):
- `A-astro-core.md` — Astro 7.4, create-astro 5.3, `astro check`/TypeScript, `@astrojs/upgrade`, docs MCP
- `B-cloudflare-adapter-assets.md` — adapter 14.4, static assets, compat flags, `_headers`, adapter 15 / `cf` migration
- `C-wrangler-builds-domains.md` — wrangler 4.157, Workers Builds, Previews, domains, Registrar, Web Analytics, robots, MCP, `cf`
- `D-claude-code.md` — Claude Code 2.1.318 plugin/skill spec, permissions, MCP, headless runs, eval
- `E-webauthn-passkey.md` — SimpleWebAuthn 14, WebAuthn L3, Workers runtime, Node `--test`, passkey code/design drift
- `F-node-ts-npm-scripts.md` — Node lines, TypeScript 7, npm 11/12, Prettier, Dependabot, the three scripts, WCAG/hstspreload/schema.org

## 1. Decisions (settled; do not reopen)

| # | Decision | Why |
|---|---|---|
| D1 | **Stay on adapter 14 + wrangler.** Adapter 15 beta / `cf` beta / Vite plugin v2 beta are not adopted. Document the migration path in the repo guide and add a Step 4 drift note that recognises adapter 15. | Three stacked betas with no GA date; adapter 15 hard-fails any project with `wrangler.jsonc` and no `cloudflare.config.ts`. |
| D2 | **Node 26 LTS is the pin.** `.nvmrc` = `26`. Floor = **22.23.4** (Astro 7.4.2+ hard-refuses below it). `@types/node@26`. Preflight recommends 26, FAILs below 22.23.4, WARNs on odd majors. | Node 26 "Lithium" is Active LTS since 2026-10-28; Phase A verified clean on 26.10. The live test confirms Workers Builds with `.nvmrc` 26; only a real defect (not download time) reverts to 24. |
| D3 | **TypeScript is pinned to 6.** Step 4 installs `typescript@^6`; Dependabot ignores `typescript` semver-major; pitfalls explain TS 7. The passkey `kv.mjs` drops its `typescript` import entirely. | `typescript@latest` is 7.0.2 (Go port, no JS API); `@astrojs/check` 0.9.12 peers `^5 \|\| ^6`; `astro check` exits 1 on TS 7. |
| D4 | **Floors become astro ^7.4, adapter ^14.4, wrangler ≥4.135.** | Adapter 14.4.0+ peers `astro ^7.4.0` (ERESOLVE on 7.3.x). |
| D5 | **`"previews": {}` goes into the Step 5 `wrangler.jsonc`.** | `wrangler preview` (the Workers Builds preview command) throws without a `previews` block. The adapter emits one in the build output today; the root block makes it explicit and version-proof. The live test confirms a branch preview builds. |
| D6 | **The plugin is the source of truth for the passkey code.** No re-sync from any site, ever. Provenance text is rewritten; the dated docs under `docs/superpowers/` stay as history. | Owner's decision. |
| D7 | **Version 3.0.0.** | Floors and the generated project's shape change (Node 26, TS 6 pin, `previews`, Dependabot ignore). |
| D8 | **Principles are unchanged**: unstyled sites, two-role model, keep the adapter, assets-only binding-free Worker, `session: false`, `imageService: 'compile'`, one complete config block at Step 4, meta CSP, no HSTS preload, stealth = noindex never Disallow, no secrets in git. Every edit below protects one of these or corrects a fact. | Repo guide. |
| D9 | **Scope discipline.** Fix what is wrong or stale, add the new facts that change what Claude does, and nothing else. No restyling of prose, no new steps, no new scripts. Setup SKILL.md must not grow past ~620 lines / ~20k tokens on-invoke. | Keep it slick. |

## 2. Verified baseline (2026-11-05) — the single source for every version claim

| Package / runtime | Verified | Floor the skill states |
|---|---|---|
| `astro` | 7.4.5 | ^7.4 (adapter 14.4 peer; `session: false` needs ≥7.2) |
| `@astrojs/cloudflare` | 14.4.4 | ^14.4 |
| `wrangler` | 4.157.0 | ≥4.135 (Worker Previews) |
| `create-astro` | 5.3.1 | 5.x (`--no-ai`) |
| `@astrojs/sitemap` | 3.7.4 | 3.7 |
| `@astrojs/check` / `typescript` | 0.9.12 / 6.0.3 | TS ^6 (TS 7 unsupported by `astro check`) |
| `@types/node` | 26.6.6 | matches `.nvmrc` major |
| `sharp` | 0.35.5 | ^0.35.4 (astro optional dep) |
| Node | 26 LTS (`.nvmrc`); tested on 26.10 | 22.23.4 (preflight FAILs below it) |
| Python (scripts) | 3.9.6 (macOS system) | 3.9 |
| Claude Code | 2.1.318 | — |
| `@simplewebauthn/server` / `browser` | 14.0.3 / 14.0.0 | ^14 |

Workers Builds: default Node 24.22.1, preinstalls 22.23.4 and 24.22.1, any version overridable via `.nvmrc` (26 is downloaded at build time); npm in the image is 10.9.2 regardless of Node (`packageManager` is the only override).

## 3. Cross-cutting facts every builder applies

1. Node floor 22.23.4 everywhere `22.12`/`22.19`/`22.18` appears; `.nvmrc` 26; "24 LTS recommended" → "26 LTS". The scaffold's `engines` is now `>=22.23.4`: say "keep the scaffold's `engines` as written".
2. Baseline numbers from §2 everywhere a version is quoted (SKILL.md Versions table, Step 4 drift check, README Notes, repo guide table, passkey Versions table).
3. `/_astro/*` caching: the adapter **skips** its own `Cache-Control` injection whenever `public/_headers` already sets one on a matching rule (including `/*`). The shipped rule is therefore the one in effect, not a fallback. Four places say "fallback": fix them all (`_headers` comment, SKILL.md Step 14, template, pitfalls row).
4. `global_fetch_strictly_public` does not "block SSRF": it routes `fetch()` to the Worker's own zone through Cloudflare's front door instead of straight to the origin; it only matters once a page runs on demand.
5. `name` in `wrangler.jsonc` is copied verbatim from `package.json` by `astro add`; create-astro lowercases the folder name. Nothing in the adapter lowercases it.
6. `compatibility_date` is written by `astro add` from the workerd bundled with the installed `@cloudflare/vite-plugin`, often several days behind (4 today).
7. `Astro.locals.runtime` was removed in adapter **13**, not 14.
8. `@astrojs/upgrade --dry-run` still prompts ("Some packages have breaking changes. Continue?") when a major is pending; there is no `--yes`. Use `npm outdated` to list majors; install majors explicitly.
9. create-astro ≥5.3 writes no `CLAUDE.md` symlink (only `AGENTS.md`, which `--no-ai` suppresses); ≥5.2.6 writes no `allowScripts`.
10. npm 11 **runs** unreviewed install scripts and warns; npm 12+ blocks them; either way `verify`/`preview` work. The warning lists `esbuild`, `fsevents`, `workerd`. `npm install-scripts approve <pkgs> --no-allow-scripts-pin` silences it durably.
11. Preview opt-out variable is `ASTRO_PREVIEW_BACKGROUND=0` (dev: `ASTRO_DEV_BACKGROUND=0`).
12. Claude Code: Bash `cd` persists only inside the folder Claude Code was started in; project settings/`.mcp.json` load from the start folder; the user-typed `/cd <path>` moves the session. Task-list tools are model-dependent (word the checklist neutrally). Monitor's default deadline is 5 min (max 30). Auto mode is the interactive default; project allow rules apply only after the folder is trusted.

## 4. File-by-file edits

### 4.1 `skills/astro-cloudflare-workers-setup/SKILL.md` (builder B1; research A, B, C, D)

- **Start here / Preflight:** "Node 22.23.4+ (26 LTS recommended)"; macOS `brew install node git gh` (unchanged; it now gives 26); Linux "Node 22.23.4+, ideally 26 LTS (`nvm install 26` …)". Checklist sentence (§3.12): "Claude keeps a visible checklist (the task list when the session has one, otherwise a short numbered progress list in chat)". The Cloudflare plugin sentence: keep the docs MCPs; say the optional `cloudflare@cloudflare` plugin **also adds Cloudflare's account MCP server (`mcp.cloudflare.com/mcp`, OAuth on first use)**, so it is optional and never required during setup. Keep "never ask users to install [the account MCP] during setup" consistent with that.
- **Step 0:** replace "Claude's shell keeps this working directory for the rest of the session" with the §3.12 fact: it persists only inside the folder Claude Code was started in; otherwise ask the user to run `/cd ~/Projects/<repo-name>` (or restart `claude` there), which also loads the new project's settings and `.mcp.json`.
- **Step 2:** `--no-ai` wording per A §2 (no symlink any more). Keep the rest.
- **Step 3:** add "wrangler lands in `dependencies` (a required peer of the adapter)". Optional.
- **Step 4:** drift check expects `astro@7` (≥7.4), `@astrojs/cloudflare@14` (≥14.4), `wrangler@4` (≥4.135); add: "adapter 14.4+ declares `astro ^7.4.0`, so bump them together" and "**If `@astrojs/cloudflare` is 15.x**: it replaces `wrangler.jsonc` with `cloudflare.config.ts` and deploys with the `cf` CLI; this skill's steps assume 14 — pin `@astrojs/cloudflare@14` for now and tell the user the repo guide's migration note applies." Install line → `npm i @astrojs/sitemap && npm i -D @astrojs/check typescript@^6 @types/node@26 prettier prettier-plugin-astro`, with the bullet "`typescript@^6` because `astro check` (via `@astrojs/check`, peer `^5 || ^6`) refuses TypeScript 7, the Go port with no JS API; a bare `npm i -D typescript` would install 7". Bullet on `'cloudflare-binding'`: "also optimizes prerendered images (Astro's standard pipeline since adapter 14.4) but attaches an `IMAGES` binding" (drop "emits extra originals").
- **Step 5:** add `"previews": {}` to the result block with a one-line reason (D5). Fix the `name` comment (§3.5), the compat-date lag (§3.6), the `global_fetch_strictly_public` sentence (§3.4). Precision: "`nodejs_compat` and `nodejs_compat_v2` are both on by default for compatibility dates ≥ 2026-08-04". Mirror the generated key order (`$schema, compatibility_date, compatibility_flags, name, main, assets, observability, previews`) so "keep the adapter's file" and the shown result match.
- **Step 8:** `.nvmrc` — `26` (Workers Builds reads it and installs that major; its default is 24). Keep the scaffold's `engines` as written. Dependabot bullet: "weekly, grouped, with `typescript` majors ignored (see Step 4)".
- **Step 9:** add `ASTRO_PREVIEW_BACKGROUND=0` alongside the dev variable where the stop commands are explained (one parenthetical).
- **Step 10:** `--device` "codes expire after 5 minutes". Keep the rest.
- **Step 11:** Registrar: "the **Register domains** page (`Domain Registration`)… needs a verified account email; after purchase verify the ICANN registrant email Cloudflare sends, or the domain is parked." Worker Domains tab: "`Workers & Pages → <worker> → Domains` tab → purchase a new domain (registers and attaches it in one flow)" — drop unverified button labels. Transfer: "first onboard it (`Domains → Onboard a domain`, switch nameservers, wait for **Active**), then `Transfer domains` with the auth/EPP code — up to 10 days total; the domain must be ≥60 days old and not moved in the last 60 days." Drop "(formerly `Websites`)". 100117 paragraph: replace the `override_existing_dns_record` sentence with "(`override_existing_dns_record` is an API-side flag wrangler sets itself, not a config key; it only ever overrode Worker-owned records — workers-sdk#9878, closed)". **Add:** "Under Claude (no TTY) wrangler auto-confirms its custom-domain override prompts, so a hostname already attached to another Worker is moved silently — confirm the hostname is free first (`Workers & Pages → <other worker> → Domains`)." Redirect rule: "`Rules → Overview → Create rule → Redirect Rule` → template **Redirect from WWW to Root**".
- **Step 12:** "`Settings → Builds` (older docs say `Build`) → **Connect**". Field list: "**Production branch** (the form may label it *Git branch*)". Build cache: "confirm it shows enabled (new connections default to on); if not, Enable". Previews paragraph: add "`wrangler preview` requires the `previews` block from Step 5". Polling: "(Monitor's default deadline is 5 minutes — re-arm it or set a longer one)". Failure: add "a build token that was deleted or rolled fails with 'The build token selected for this build has been deleted or rolled…' → pick or create one under Settings → Builds → API token".
- **Step 13:** Managed robots.txt sentence per C §6 (Security → Settings → Bot traffic → AI Crawler and Agent access policies: Training = Disallow + Enable Bot Preference Sync, or AI Crawl Control → Quick Actions). Content-collections sentence: name the imports (`defineCollection` from `astro:content`, `glob` from `astro/loaders`, `z` from `astro/zod`). Keep everything else.
- **Step 14:** `_headers` sentence per §3.3.
- **Step 16:** add "The manual beacon posts to `cloudflareinsights.com`; if a `connect-src` or `default-src` is ever added to the CSP, include `https://cloudflareinsights.com`."
- **Step 17:** symlink guard → "(Only scaffolds from create-astro <5.3 without `--no-ai` had a `CLAUDE.md → AGENTS.md` symlink; `[ -L CLAUDE.md ] && rm CLAUDE.md` handles one.)"
- **Versions & sources:** the §2 table (setup rows only) with date 2026-11-05. Keep the conflict-order sentence; the framework-guide note is still true (add "as of its 2026-10-12 revision").
- Do not touch: the Layout block, the CSP blocks, Step 7 scripts, Step 13 grep, Completion summary (except version-neutral wording), stealth text.

### 4.2 `skills/astro-cloudflare-workers-setup/references/*.md`, `assets/CLAUDE.md.template`, `assets/site/*` (builder B2; research A, B, C, F)

**pitfalls.md**
- Row "EBADENGINE for undici" → replace: symptom `Node.js v22.x is not supported by Astro! … ">=22.23.4"` / `npm warn EBADENGINE` for `astro` · cause "Node older than 22.23.4 (Astro ≥7.4.2 floor, raised in a patch for the Oct 2026 Node security releases)" · fix "install Node 26 LTS (`nvm install 26`, `brew install node`) or update 22 to ≥22.23.4".
- Row "install-scripts" → per §3.10 (three cells).
- Row "`wrangler types` asks for `@types/node`" → "prints 'you should install Node.js types…'"; fix `@types/node@26`.
- Row "`npx @astrojs/upgrade` sits waiting" and the Phase A hang row (`--yes`, `--dry-run`) → per §3.8.
- Row "dev/preview returns immediately" → add `ASTRO_PREVIEW_BACKGROUND=0`.
- Row "`src/fetch.ts`" → add "or set `fetchFile: null`"; reserved extensions `.ts/.js/.mjs/.mts`.
- Row "Hashed `/_astro/*` assets refetched" → per B §6 replacement (cause: rule removed, or another matching `Cache-Control` rule such as `/*`, or `build.assetsPrefix`; fix: keep the shipped rule, never add `Cache-Control` on `/*`, check `dist/client/_headers`).
- Row "100117" → fix cell per Step 11 wording (`override_existing_dns_record` not a config key; #9878 closed).
- Row "First GitHub-connected build never deploys" → add cause "`npm ci` 'not in sync' (the build image's npm is 10.9.2 whatever the Node version)" → fix "set `"packageManager": "npm@<your local npm -v>"` (exact) in `package.json`".
- Row "Managed robots.txt" → new product path per C §6.
- **New rows (Phase A):** TS 7 (`astro check does not currently support TypeScript 7.0` → `typescript` bumped to 7 by Dependabot or a bare install → `npm i -D typescript@^6`; Dependabot ignore is shipped); `astro check` exits 0 with `[ERROR] [check] The @astrojs/check and typescript packages are required` (astro ≤7.4.5 bug #18588, fix merged, unreleased) → install them.
- **New rows (Phase C):** Preview build fails `Your Wrangler configuration is missing a 'previews' block` → add `"previews": {}` (Step 5). Build token deleted/rolled error → pick/create a token. A browser navigation to a new on-demand (`prerender = false`) page gets `404.html` → `not_found_handling: "404-page"` plus Cloudflare's navigation rule (compat dates ≥ 2025-04-01) serves assets' 404 before the Worker → list each on-demand path in `assets.run_worker_first` (e.g. `["/api/*", "/account"]`) and check with `curl -H 'Sec-Fetch-Mode: navigate' http://localhost:4321/<path>` against `npm run preview`.
- Maintenance row (Dependabot peer) unchanged; add "a `typescript` major PR is ignored by the shipped config".

**maintenance.md**
- B: per §3.8 — `--dry-run` prompts on majors; `npm outdated` lists them; majors installed explicitly; "`@astrojs/cloudflare@latest` will one day be 15, which needs the migration in the repo guide (cloudflare.config.ts + `cf`); until then pin `@14`".
- D: add the navigation-request rule and the `run_worker_first` array fix with the curl check.
- E: add the `packageManager` fix and the build-token error.

**resume.md:** no change unless B1 changes a Step 8 signal (it does not).

**anonymity-variant.md:** no change.

**assets/CLAUDE.md.template:** `_headers` sentence (§3.3); `ASTRO_PREVIEW_BACKGROUND`; Dependabot sentence (adds "`typescript` majors are ignored because `astro check` supports TS ≤6"); upgrade sentence per §3.8; add one line under Workflow: "Project allow rules in `.claude/settings.json` apply once the folder is trusted; in auto mode (the default) broad package-manager rules are set aside and the classifier reviews those commands." TypeScript bullet: "`typescript` stays on 6.x (…)". Keep everything else.

**assets/site/.nvmrc:** `26`.
**assets/site/public/_headers:** comment line 10 → `# Immutable caching for Astro's hashed assets. While this rule exists the adapter skips its own (identical) injection.`
**assets/site/.github/dependabot.yml:** add
```yaml
    ignore:
      - dependency-name: "typescript"
        update-types: ["version-update:semver-major"]
```
inside the npm update entry (keep groups). Keep `@cloudflare/*` in the pattern.
**assets/site/.claude/settings.json, .mcp.json, .editorconfig, .prettierrc, global.css:** unchanged.

### 4.3 `skills/astro-cloudflare-workers-setup/scripts/preflight.py` (builder B3; research F §6)

- `MIN_NODE = (22, 23, 4)`; remove `CLEAN_NODE` and its WARN band; `RECOMMENDED_NODE_MAJOR = 26`; comments and docstring updated ("Astro's bin/astro.mjs refuses to start below 22.23.4").
- New WARN (fact-printer, not a gate): an odd Node major (`major % 2 == 1`) → "odd-numbered Node releases are never LTS and reach end-of-life within about eight months; use 26 LTS".
- Install hints: Darwin "Install Node 26 LTS: `nvm install 26`, or `brew install node`." Linux "`nvm install 26` (distro packages are often older)". Windows "Use WSL2, then `nvm install 26`."
- OK line text: `(>= 22.23.4 required; 26 LTS recommended)`.
- Python 3.9 stdlib only; no other behavioural change. Test with a fake `node` shim at 22.23.3 (FAIL), 22.23.4 (OK), 25.9.0 (WARN), 26.10.0 (OK).
- `verify_site.py` and `gen-images.mjs`: **no changes** (no defects found).

### 4.4 `skills/astro-cloudflare-passkey-login/**` (builder B4; research E, plus C §1/§3 and B §3)

**SKILL.md**
- Preconditions: "**Node ≥ 22.23.4** (`.nvmrc` says 26; type stripping runs the `.ts` tests natively)".
- Step 2 expectations: `astro` 7.4+, `@astrojs/cloudflare` 14.4+, wrangler ≥4.135.
- Step 4: `"test": "node --test 'tests/unit/*.test.ts'"` (a bare directory argument needs Node ≥26.8); remove `<extra-public-path>` from the placeholder grep; the claude-md-section bullet says which placeholders to fill (`<apex>`; the literal `<name>`/`<id8>` argument syntax stays) and replaces `<setup-skill-dir>` with the phrase "the setup skill's `verify_site.py`".
- Step 6: "two `node --test` summaries"; unchanged otherwise.
- Step 8: switch to `npx wrangler kv namespace create <name>-auth --update-config=false && npx wrangler kv namespace create <name>-auth-preview --update-config=false` from the project root (the flag exists in 4.157; non-interactive runs never write config). Keep the `mktemp` recipe as a one-line fallback for older wrangler. Add: "Base-config secrets are copied only when a Preview is created, so set it before the branch's first push (this order does); a Preview created earlier needs `npx wrangler preview secret put AUTH_COOKIE_SECRET --name <branch>`."
- Step 9: add "If the Worker was connected before Worker Previews existed (preview command `npx wrangler versions upload`, Previews off), 👤 enable Preview Builds or take the one-way **Set up Worker Previews** switch first."
- Versions: astro 7.4.5 / 14.4.4 / 4.157.0; Node "26 (`.nvmrc`) | 22.23.4"; SimpleWebAuthn row: "pins `supportedAlgorithmIDs`; v14 otherwise puts ML-DSA-44 first where `SubtleCrypto.supports('verify','ML-DSA-44')` is true (workerd only with `webcrypto_modern_algorithms`)". Date 2026-11-05.

**assets/site/scripts/auth/kv.mjs:** remove the `typescript` import. Replace `ts.parseConfigFileTextToJson` with a small dependency-free JSONC reader (strip `//` and `/* */` comments outside strings, strip trailing commas, `JSON.parse`). Keep the injectable `readConfig` and the exported function names so `tests/unit/auth-scripts.test.ts` passes unchanged (adjust the test only if it asserts on TypeScript itself). Comment header: "technical design §…".

**assets/site/** comments: "technical spec" → "technical design"; remove "bloom" wording (worker.ts, config.ts, gate/arrival.ts) → "the site's own unlock effect"; hooks.ts "design overview → Hooks" → "technical design §6"; config.ts "§5.5, §14" → "§5.5"; handlers.ts sign-out docstring → "Revokes this device's session only and clears the cookie. No Clear-Site-Data (technical design §5.4)". No behavioural code change except `kv.mjs`.

**references/technical-design.md**
- Line 3: "Ported from the <site>…" → "The shipped code under `assets/site/` is this skill's own; this document is its design record." Remove "upstream suite" wording (§10.2 → "End-to-end tests (not shipped; kept as a reference for a site that adds Playwright)"); branch `feat/passkey-login`; "the contract" → "the UI states below" / the named copy string; `createSession(kv, user, credentialId, meta, now)`; §3.1 add the missing file rows; §3.2 add the `build` script change; §5 refetch rule "every `visibilitychange` back to visible or window `focus` refetches"; §10.1 table = the 14 shipped suites (69 tests); renumber §11→§12 gap; F1 quotes per E §3.1 ("approximate", "eventually consistent", IP keys discouraged in general); F3 add the Free-plan daily-limit fail-open/closed fact and a line in §9.1 ("fail closed is the setting for security-critical Workers; check the route's toggle in the dashboard; Custom Domain behaviour is undocumented"); F5 version 14.4.4; F6 add `webcrypto_modern_algorithms`; F7 ML-DSA ids -48/-49/-50 and the condition; F11 add per-Preview secrets and custom-domain Preview hosts; F14 unchanged; §7.2 `Astro.locals.runtime` removed in adapter 13; "Node 24 runs `.ts` natively" → "Node 26 (and 22.18+)"; `__Host-Http-` noted as an optional hardening in §5.x cookies; `crypto.subtle.verify` "constant-time in practice (not stated in Cloudflare's docs)"; "Chrome 153 local test" lines → "observed in testing". Keep the architecture, flows, threat model otherwise.

**references/pitfalls.md**
- Fix the split table (blank line) so the "names a user" row joins "Build and config".
- `Astro.locals.runtime.env` row → adapter 13.
- `ratelimits` inside `previews` row → "older wrangler only (4.157 accepts it)".
- `kv namespace create` row → mention `--update-config=false`.
- `node --test` row → add import aliases/decorators; drop any transform-types mention; "on Node < 22.18 upgrade (`.nvmrc` says 26)".
- allowScripts row → per §3.10.
- Preview noindex row → add "custom-domain Preview URLs get no automatic header; the Worker's own applies".
- Add: `secret put` error 10215 (latest version undeployed) → `npx wrangler versions secret put` then `versions deploy`, or deploy first.
- Add: `npm test` "Cannot find module …/tests/unit" → Node < 26.8 with a directory argument → the shipped `test` script uses the quoted glob.

**references/resume.md:** Step 8 signal unchanged (`"id": "` count). No change.
**assets/templates/claude-md-section.md:** `node --test 'tests/unit/*.test.ts'`; replace `<setup-skill-dir>` per Step 4; state which placeholders are real.
**assets/templates/wrangler.additions.jsonc:** unchanged (header already says to leave `id` out).

### 4.5 `README.md`, `.claude/CLAUDE.md`, `.claude-plugin/*` (builder B5; research D, B §"Adapter 15", C §9, F §1)

**`.claude-plugin/plugin.json`:** `version` → `3.0.0`. Description unchanged. `marketplace.json` unchanged.

**README.md**
- Requirements: "Node.js 26 LTS (22.23.4 minimum)".
- Install: add the one-step form `claude plugin install astro-cloudflare-workers-setup --marketplace kanjidoc/astro-cloudflare-workers-setup`. Manual install: note it copies only the setup skill (the passkey skill needs the plugin), or copy the whole repo into `~/.claude/skills/astro-cloudflare-workers-setup/` which loads as a skills-directory plugin.
- New section **What's new in 3.0** (above 2.1): re-verified against Astro 7.4 / adapter 14.4 / wrangler 4.157 / Node 26 LTS / Claude Code 2.1.318 (Nov 2026); Node 26 pinned, floor 22.23.4; TypeScript held at 6 (TS 7 breaks `astro check`), Dependabot ignores the major; `previews` block so PR previews build; the on-demand-page navigation pitfall documented; `_headers` cache rule described correctly; dashboard labels and Registrar/transfer facts refreshed; passkey skill: `npm test` works on every supported Node, ops scripts no longer need TypeScript, design doc re-synced with the shipped code; adapter 15 / `cf` migration path documented for later. "Breaking: floors move to Astro 7.4 and adapter 14.4; generated sites pin Node 26."
- Notes: "Verified against Astro 7.4, `@astrojs/cloudflare` 14.4, `wrangler` 4.157 and Node 26 LTS (November 2026)."

**.claude/CLAUDE.md** (repo guide)
- Baseline table → §2 (all rows), with "The verified baseline (2026-11-05)".
- Design principles: fix the `/_astro/*` sentence ("the adapter would inject the identical rule but skips it because `_headers` already sets one"); add bullets for "**`previews: {}` is required** (wrangler preview refuses to run without it)", "**TypeScript stays on 6** (TS 7 has no JS API; `astro check` refuses it; Dependabot ignores the major)", "**Node 26 LTS pin, 22.23.4 floor**". Floors ^7.4 / ^14.4.
- Rejected list: add "adapter 15 / `cf` until GA" and "the Workers Builds REST API in place of the dashboard connect (the GitHub App install is still a browser step; keep the two-role model)".
- Passkey section: replace the Provenance bullet with "**Source of truth.** `assets/site/` is this plugin's own code; it has no upstream. Change it here, keep the unit suites green (`node --test 'tests/unit/*.test.ts'` in a scratch copy with `@simplewebauthn/*@14`), and re-run the cold test." Token cost ~5.5k (2.1.318). Keep principles/rejected/testing.
- **Watch** → replace with a condensed "Adapter 15 / `cf` migration path" (from B): status, the hard stop, what changes (config, commands, Workers Builds commands, what still needs wrangler, auth), revisit triggers. ~25 lines.
- Testing a change: `validate .` now also checks the plugin (keep both commands); token numbers ~19.8k / ~5.5k (2.1.318); "Phase A needs a GitHub account for Step 1 (`gh repo create`) but no Cloudflare account"; note that a `--plugin-dir .` session treats the repo as a protected path, so edit from a normal session and test in the `--plugin-dir` one; the passkey unit suite command above.
- Releasing: unchanged; add "`claude plugin tag --dry-run` exits 1 until the version is bumped".
- Knowledge policy unchanged.

## 5. Verification plan (after the builds and reviews)

1. `python3 -m py_compile scripts/*.py && node --check scripts/gen-images.mjs`; preflight shim matrix (§4.3).
2. `claude plugin validate . --strict && claude plugin validate .claude-plugin/plugin.json --strict`; `claude --plugin-dir . plugin details astro-cloudflare-workers-setup` (setup ≤ ~20.5k).
3. Passkey unit suite in a scratch copy on Node 26 and on Node 24 (`npx -p node@24`): 69/69 with the glob script; no `typescript` installed.
4. **Cold run, Phase A** (fresh agent, empty temp dir, `.nvmrc` 26, the new Step 4 line): `0 errors`, `Complete!`, `No bindings found.`; `verify_site.py --local` 0 FAIL after Steps 13–14; gen-images twice byte-identical.
5. **Live throwaway**: `gh repo create kanjidoc/acws-coldtest-20261105 --private`; `npm run deploy` to workers.dev; `verify_site.py` live; push a branch and, if the Workers Builds GitHub App already covers the repo (check via `GET /accounts/{id}/builds/workers/{tag}` after a dashboard-free connect attempt through the Builds API — only if the app install permits), observe the production build on `.nvmrc` 26 and a branch Preview (D2, D5 evidence). If the app does not cover the repo, record that Builds could not be exercised and keep D2/D5 on documentary evidence.
6. **Passkey Steps 1–8** on the scratch site (custom domain precondition is waived for the test by pointing `RP_ID`/`ORIGIN` at the workers.dev host — test only): `npm test` 69/69, `npm run verify` lists the bindings, `verify_site.py --local --gated` 0 FAIL, KV namespaces created with `--update-config=false`, secret set; deploy; `--gated` live 0 FAIL.
7. Delete: the GitHub repo, the Worker, both KV namespaces (deletes pre-approved by the owner).
8. Release: bump validated, commit, push, `claude plugin tag --push`, `claude plugin marketplace update kanjidoc && claude plugin update astro-cloudflare-workers-setup@kanjidoc`.

## 6. Out of scope (recorded, not done)

- Trimming setup SKILL.md below 500 lines (spec recommendation); an `evals/` suite; a plugin icon for the Anthropic directory; adopting the Builds REST API; `sendSignal()` in the passkey flow; `__Host-Http-` cookies; a `packageManager` field at Step 7 (becomes in scope only if the live Workers Build fails `npm ci`).

## 7. Review amendments (applied after the five adversarial reviews)

- **Fail closed, confirmed.** Cloudflare's Static Assets billing page (2026-11-03) says requests matched by `run_worker_first` get a 429 past the Free daily limit instead of falling back to assets. The passkey gate therefore fails closed; §4.4's "fail-open" wording is replaced by that fact.
- **Step 11 ordering.** The "confirm the hostname is not attached to another Worker" check now precedes `npm run deploy` (wrangler auto-confirms its override prompts without a TTY).
- **Adapter 15 pointer.** Skill text points at the public repo guide URL, not at "the repo guide"; the pin command is `npm install @astrojs/cloudflare@14 wrangler@4` (adapter 15 has no wrangler peer).
- **Majors install.** `npm install astro@latest …` with adapter 14 would ERESOLVE on an Astro major; maintenance B and the pitfalls row now keep the adapter on 14 and `typescript` on 6, and stop on an Astro major (it needs adapter 15 and the migration).
- **TypeScript pin syntax.** `typescript@6`, not `typescript@^6` (unquoted `^` can be a zsh glob); npm writes `^6.x`.
- **`previews` reason.** The adapter's build output already carries `"previews": {}`; the root block makes it explicit and version-proof. Step 12 tells a resumed site to add it.
- **Step 0.** Detect `Shell cwd was reset to …` and hand off `/cd` as a 👤 action; project settings load only in a session started in, or `/cd`'d to, the folder.
- **kv.mjs.** Strips a UTF-8 BOM; an unterminated block comment throws.
- **Template.** `prerender = false` pages must be listed in `assets.run_worker_first`, or browser navigations get `404.html`.
- **Repo guide.** The passkey unit-suite recipe needs both templates filled; token numbers are re-measured at release; the `.cloudflare/output/` guard covers `deploy`, `versions upload` and `preview` (`--dry-run` still passes).

## 8. Verification results (2026-11-05)

- **Cold run (headless `claude -p --plugin-dir`, empty folder, Node 26.10):** Preflight, Phase A, Steps 13–15, 17 and the local checks passed; resolved astro 7.4.5 / adapter 14.4.4 / wrangler 4.157.0 / typescript 6.0.3 / @types/node 26.6.6; `npm run verify` → `0 errors`, `Complete!`, `No bindings found.`; local verifier 0 FAIL. The real deploy was a permission prompt (the site's own `ask` rule) that a headless session cannot answer; run by the orchestrator instead: live verifier **14 passed, 0 failed**.
- **Workers Builds (connected through the REST API):** production build on `main` with `.nvmrc` 26 → `Installing nodejs 26.13.0` (about 23 s), `0 errors`, `Complete!`, deployed; branch Preview build → success, Preview URL 200 with `x-robots-tag: noindex`. **D2 (Node 26) and D5 (`previews`) confirmed.** The image's npm was 10.9.2 and `npm ci` accepted the npm 11 lockfile.
- **Cold-run findings applied:** verifier stops (exit 2) when the live homepage is 404/5xx and no longer passes Cloudflare's own error page as a custom 404; Step 10 names the `error code: 1042` state and the deploy prompt; Step 13 commit command; `<canonical-domain>` fallback in robots; `jsonLd.url` follows `site`; Step 5 formatting note; preflight wording; template lines for workers.dev-only sites and credential lanes; `Bash(npx wrangler deploy *)` added to `ask`.
- **Passkey skill:** see the PASSKEY cold-run report (Steps 1–11 on the same site with the custom-domain precondition waived).
- **Accepted trims (post-review):** the Anonymity-variant sentence "Announce to the user when this variant is active" (kept in Confirm Inputs Q9); the Step 12 build-token clause (maintenance 18.E and the pitfalls row carry it); duplicated credential, finish-line and docs-query sentences. Final setup SKILL.md: 611 lines, ~20.8k tokens on-invoke.
- **Passkey cold run (Steps 1–11, custom-domain precondition waived):** 69/69 tests; dry run lists `AUTH_KV`, `AUTH_RATE_LIMIT`, `ASSETS` and the three vars; local `--gated` 16 passed / 0 failed; branch Preview built in ~90 s and served the lock page, 401 for assets and `/auth/session`, 403 for sign-in; live `--gated` **19 passed, 0 failed**; invite and list worked; public site restored (14 passed, 0 failed). Six wording fixes applied. Noted for 3.1: the lock/invite templates place `<script>` after `</Layout>` (works, but the built HTML puts it after `</html>`); the sitemap lists `/lock/`; a site with no header has no sign-out button and the skill should say so.
