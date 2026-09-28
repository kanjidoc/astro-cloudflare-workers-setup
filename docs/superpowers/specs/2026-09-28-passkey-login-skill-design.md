# `astro-cloudflare-passkey-login`: design

**Status:** design decisions delegated to Claude by the owner on 2026-09-28 ("it is up to you"); recorded here for review · **Date:** 2026-09-28

A second skill in this plugin. It takes a site built by `astro-cloudflare-workers-setup` and makes it **private**: every page needs a passkey sign-in, with no passwords, no identity provider and no admin UI. It is a faithful port of the private sign-in built by hand on `twofabianos` (branch `feat/private-sign-in`, specs under that repo's `docs/superpowers/specs/2026-09-28-private-sign-in-*.md`), with the site-specific parts turned into inputs and the visual layer left to the user.

## 1. Decisions already made (with the owner)

| # | Question | Decision |
| :-- | :-- | :-- |
| D1 | Scope | **Faithful port.** Passkeys only, whole site gated, invite links, KV sessions, unstyled lock page. No path-prefix gating, no alternative auth methods. |
| D2 | Where it lives | **A second skill in this plugin**, beside the setup skill. The setup skill gets a one-line pointer; its `CLAUDE.md.template` mentions the option. |
| D3 | How the code ships | **As copyable assets** (byte-identical files under `assets/site/`), plus the **technical design as a reference** for deviations and debugging. Claude edits only the per-site parts. |
| D4 | Tests installed into each site | **Unit tests + the build guard** (`node:test`, no new dev dependencies). The live gate is checked with `curl` and `verify_site.py --gated`. No Playwright in generated sites. |
| D5 | Timing | **Spec and plan now; assets copied after the `add-login` session reports its build finished and reviewed.** The skill ships tested code, not a mid-build snapshot. |
| D6 | Name | `astro-cloudflare-passkey-login` |

## 2. Goals and non-goals

| Goals | Non-goals |
| :-- | :-- |
| From a live, plugin-built site to a live, private site in one guided session | Sites not built by the setup skill (the skill checks the contract and stops if it isn't met) |
| Identical, already-tested auth code in every site | Regenerating security code per site |
| The same two-role model as the setup skill: 🤖 Claude runs commands, 👤 the user does browser steps | Anything visual: the lock page ships unstyled with only the contract's hooks |
| Free plan only: Workers Free, KV free tier, Rate Limiting binding | Passwords, magic links, OAuth, Cloudflare Access, recovery codes, an admin UI |
| Private means undiscoverable: `noindex` on every response, link previews still work | Path-prefix gating, per-page roles, more than a handful of users |
| Resumable, like the setup skill | Playwright or a browser download in generated sites |

## 3. What the skill produces in a site

### 3.1 Behaviour (unchanged from the twofabianos technical design)

- `assets.run_worker_first: true` and a custom entry `src/worker.ts`. On every request the Worker: redirects the `*.workers.dev` backup host to the apex (passkeys are bound to the RP ID); serves a small exact public allowlist from `env.ASSETS`; routes `/auth/*` and `/invite/*` to on-demand Astro endpoints; otherwise requires a valid session. Without one, a document request gets the prerendered lock page **at the requested URL** (200, `no-store`) and anything else gets a 401.
- WebAuthn via SimpleWebAuthn v14: discoverable credentials, `userVerification: 'required'`, `supportedAlgorithmIDs: [-8, -7, -257]`, `attestationType: 'none'`.
- Sessions in one KV namespace (`AUTH_KV`): the cookie holds a random token, KV holds only its SHA-256. Fixed TTL, no renewal. Challenges live in an HMAC-signed cookie, not KV. The only secret is `AUTH_COOKIE_SECRET`.
- First passkey per person via a single-use invite link minted by `npm run invite -- <name>`. Ops scripts: `auth:list`, `auth:revoke`.
- Rate Limiting binding `AUTH_RATE_LIMIT`, per IP and bucket.
- The Worker sets every security header itself (`_headers` doesn't apply to Worker-generated responses), including `X-Robots-Tag: noindex, nofollow` on every response. The lock page carries the OG tags, so link previews work.
- A one-time arrival cookie becomes `<html data-arrival="unlock">` on the first gated HTML after sign-in, and `<html data-user="<name>">` on every gated HTML. These are hooks for the user's own visual layer; the skill ships no animation.
- **At least one route stays on-demand**, and a build guard fails the build if the generated Worker config loses `main`, `run_worker_first` or the custom entry.

### 3.2 Files

**Copied verbatim from `assets/site/`** (byte-identical for every site; copied once with `cp -R`, guarded by the absence of `src/worker.ts`):

```
src/worker.ts
src/lib/auth/{encoding,crypto,cookies,challenge,store,session,webauthn,http,handlers}.ts
src/lib/gate/{classify,headers,redirect,arrival}.ts
src/pages/auth/{session,signout}.ts
src/pages/auth/signin/{options,verify}.ts
src/pages/auth/invite/{options,verify}.ts
src/pages/invite/[token].astro          functional, unstyled, hooks only
src/scripts/{hooks,auth-flow,signout,arrival}.ts
scripts/auth/{kv,invite,list,revoke}.mjs
tests/build-guard.test.ts
tests/unit/**                            the pure-helper suites and tests/unit/helpers/fake-kv.ts
.dev.vars.example
```

**Filled by Claude from `assets/templates/`** (varies per site):

| Template | Becomes | Per-site values |
| :-- | :-- | :-- |
| `auth-config.ts.template` | `src/lib/auth/config.ts` | `USERS` (1–10 lowercase names), `SESSION_TTL_S`, `INVITE_TTL_S`, rate limit, the copy strings |
| `allowlist.ts.template` | `src/lib/gate/allowlist.ts` | The default public set (`/_astro/*.css\|js\|woff2` by extension, `/favicon.svg`, `/favicon.ico`, `/apple-touch-icon.png`, `/robots.txt`, `/og.webp`) plus any exact paths the site's lock page needs. **Never images under `/_astro/`, never a wildcard.** |
| `lock.astro.template` | `src/pages/lock.astro` | The site's `Layout` import and `noindex` prop; the contract's hooks and nothing else |
| `wrangler.additions.jsonc` | edits to `wrangler.jsonc` | `main`, `assets.run_worker_first`, `kv_namespaces`, `ratelimits`, `vars` (`RP_ID`, `ORIGIN`, `BACKUP_HOST`), and the required `previews` block with its own KV namespace |
| `claude-md-section.md` | appended to the site's `CLAUDE.md` | Architecture, the "≥1 on-demand route" rule, "never put private content in JS/CSS", the new `npm run verify` expectation, commands, credentials by name |

**Edited in place:** `package.json` (deps `@simplewebauthn/server@^14`, `@simplewebauthn/browser@^14`; scripts `test`, `invite`, `auth:list`, `auth:revoke`; `build` gains the build guard), `.gitignore` (`.dev.vars*`, `!.dev.vars.example`), `src/layouts/Layout.astro` (a `chrome` prop so the lock and invite pages render without the site header, and the gated `<script>` for `arrival.ts` and `signout.ts`), `README.md`, `CHANGELOG.md`.

**Untouched:** `astro.config.mjs` (`output: 'static'`, `session: false`, `imageService: 'compile'` and the hashed meta CSP all stay), `public/_headers` (a comment noting the Worker is now authoritative).

### 3.3 De-branding rules for the copied code

The twofabianos code carries `tf` in a few names. The assets use neutral names, and their unit tests are updated to match:

| twofabianos | asset |
| :-- | :-- |
| `__Host-tf-session`, `__Host-tf-challenge`, `__Host-tf-arrival` | `__Host-auth-session`, `__Host-auth-challenge`, `__Host-auth-arrival` |
| `tf:auth-state` event | `auth:state` |
| `USERS = ['tony','emily']`, copy strings in `src/data/auth.ts` | template values in `src/lib/auth/config.ts` |
| `/sw.js`, `/og-v1.png`, `/brand/**` in the allowlist | dropped; `/og.webp` (the setup skill's OG card) added |

Nothing else changes. Every other difference between an asset and its twofabianos source is a bug in the port.

### 3.4 Generated-site contract additions

- `npm run verify` now lists `AUTH_KV`, `AUTH_RATE_LIMIT`, `ASSETS` and the vars instead of `No bindings found.` The setup skill's Step 9 expectation no longer applies to a private site; the passkey skill's CLAUDE.md section says so.
- `npm test` runs `node --test tests/unit/`. Node **24** (per `.nvmrc`) runs `.ts` natively; Node 22.18+ also does. The skill checks `node -v` and stops below 22.18.
- New routes `/lock/`, `/auth/*`, `/invite/*` are reserved. A future catch-all page must reject those slugs.

## 4. The procedure (SKILL.md)

Same conventions as the setup skill: `${CLAUDE_SKILL_DIR}`, 🤖/👤 roles, "state it, wait, verify" hand-offs, a resume map in `references/resume.md`, a token budget well under the setup skill's ~19k.

**Preconditions (stop if any fails, and say which):**
- `wrangler.jsonc` with an `assets` block and a `name`; `astro.config.mjs` importing `@astrojs/cloudflare` with `output: 'static'`; `package.json` scripts `build`, `verify`, `deploy`, `generate-types`; `.nvmrc`. These are the setup skill's fingerprints.
- The site is live: `routes[].pattern` resolves and `curl -sI https://<apex>/` returns 200. A custom domain is required, since passkeys bind to the RP ID and a `*.workers.dev` host would lock users out on a rename.
- Clean git tree, `npm run verify` clean, `npx wrangler whoami --json` authenticated (token or existing login; never `wrangler login` when a token is present).
- Node ≥ 22.18. Astro 7.x, adapter 14.x, wrangler ≥ 4.135 (the setup skill's floors).

**Inputs to confirm (one message, like the setup skill's "Confirm inputs"):** user names; apex and backup host (read from `wrangler.jsonc` and `wrangler whoami`, confirmed not asked); session TTL (default 24 h), invite TTL (default 7 days), rate limit (default 10 / 60 s); any extra public files the lock page will need (default none). The skill states that user verification is required at every sign-in and that Worker Previews will only ever show the lock page.

**Steps:**

| # | Who | Step | Verify |
| :-- | :-- | :-- | :-- |
| 1 | 🤖 | `git switch -c feat/passkey-login` | branch exists |
| 2 | 🤖 | `npm i @simplewebauthn/server@^14 @simplewebauthn/browser@^14`; drift check against the Versions table | `npm ls` shows 14.x |
| 3 | 🤖 | `cp -R ${CLAUDE_SKILL_DIR}/assets/site/. .` (only if `src/worker.ts` is absent) | files present |
| 4 | 🤖 | Fill the templates; edit `wrangler.jsonc`, `package.json`, `.gitignore`, `Layout.astro`; write `.dev.vars` from the example with a random secret | `git status` lists the expected set |
| 5 | 🤖 | `npm run generate-types` | `worker-configuration.d.ts` has `AUTH_KV`, `AUTH_RATE_LIMIT` |
| 6 | 🤖 | `npm test`, then `npm run verify` | tests pass; dry run lists the bindings, `Configuration being used: "dist/server/wrangler.json"`, and `main` present |
| 7 | 🤖 | `npm run preview` in the background, then the gate matrix with `curl` and `verify_site.py --local --gated http://localhost:4321`; `npx astro preview stop` | random path → 200 lock page with `X-Robots-Tag`; `Sec-Fetch-Dest: image` → 401; `/_astro/*.css` → 200; `/auth/session` → 401 JSON |
| 8 | 🤖 (with the user's OK) | Create account resources: `wrangler kv namespace create <name>-auth` and `<name>-auth-preview` (run with `cd` to a temp dir so wrangler can't rewrite `wrangler.jsonc`); write the ids into `wrangler.jsonc` and `previews`; `openssl rand -base64 32 \| npx wrangler secret put AUTH_COOKIE_SECRET`; the same for `npx wrangler preview base-config secret put AUTH_COOKIE_SECRET` | `wrangler kv namespace list`, `wrangler secret list` |
| 9 | 🤖 | Commit and push the branch. If Workers Builds is connected, the Worker Preview shows the lock page (👤 optional look) | `gh` check run on the branch |
| 10 | 👤 → 🤖 | Merge to `main` (or `npm run deploy` when Builds isn't connected). Wait for the `main` check run like the setup skill's Step 12 | `verify_site.py --gated https://<apex>` 0 FAIL; `curl -sI https://<backup>/x` → 301 to the apex |
| 11 | 🤖 → 👤 | `npm run invite -- <first user>`; the user opens the link on their device and saves the passkey; repeat per user; `npm run auth:list` | each user listed with a credential |
| 12 | 🤖 | Docs: append the CLAUDE.md section, CHANGELOG entry, README note; commit. `.dev.vars` stays local and gitignored. | `git status` clean |

**Rollback note in the skill:** `npx wrangler rollback` or a revert makes the site public again. Safe only while no private content exists. Once private content ships, roll back only to a gated version.

## 5. Changes to the setup skill and the plugin

| File | Change |
| :-- | :-- |
| `skills/astro-cloudflare-workers-setup/SKILL.md` | One sentence near *Anonymity-first variant*: making a site private is a separate skill, `astro-cloudflare-passkey-login`, run after the site is live. |
| `assets/CLAUDE.md.template` | One line under the maintenance or roadmap area: "To make the site private (passkey sign-in), run the `astro-cloudflare-passkey-login` skill." |
| `scripts/verify_site.py` | New `--gated` flag. It implies the stealth expectations (noindex everywhere, no sitemap, OG downgraded to WARN) and adds: a random path returns 200 HTML containing `data-screen="lock"`; the same request with `Sec-Fetch-Dest: image` returns 401; both carry `X-Robots-Tag: noindex` and the security headers; `/auth/session` without a cookie returns 401. With `--local` the same checks run against `astro preview`. Exit codes unchanged. |
| `.claude-plugin/plugin.json` | `version` → **2.1.0** (new skill; no floors or generated-project shape change for existing sites). |
| `.claude-plugin/marketplace.json` | Description mentions the optional passkey sign-in. |
| `README.md` | A "Making a site private" section and *What's in the box* entry. |
| `.claude/CLAUDE.md` | New skill's layout; the principles below; provenance (which twofabianos commit the assets came from and the de-branding rules); "Rejected" additions. |

The passkey skill reaches the verifier at `${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/scripts/verify_site.py`. Both skills ship in one plugin, so the sibling path always exists. This keeps the setup skill's "three scripts" rule and avoids a second copy.

## 6. Design principles to record (so they aren't quietly undone later)

- **Private means noindex.** The Worker sets `X-Robots-Tag: noindex, nofollow` on every response. The lock page keeps OG tags so link previews still work. `robots.txt` stays open (crawlers must fetch a page to see noindex). Never `Disallow: /`.
- **The gate lives in the Worker entry, not Astro middleware.** Middleware runs at build time for prerendered pages and can't protect them.
- **At least one on-demand route, always.** An all-prerendered build silently drops `main`. The build guard is not optional.
- **The `previews` block is required.** Worker Previews inherit no bindings or vars. Previews get their own KV namespace and can only ever show the lock page.
- **The Worker is authoritative for headers.** `_headers` still applies to `env.ASSETS.fetch()` responses but not to Worker-generated ones.
- **The Worker fails closed.** Missing `AUTH_COOKIE_SECRET` or `AUTH_KV` means 503 on auth endpoints and the lock page everywhere, never gated content. Don't use `secrets.required` (it blocks the local `.dev.vars` overrides).
- **Public by extension, never by directory.** `/_astro/*.css|js|woff2` are public because the lock page needs them; images under `/_astro/` are gated. Consequence: private content must never be baked into JS or CSS.
- **Unstyled, like everything else the plugin ships.** The lock and invite pages carry only the data hooks. The `data-arrival` and `data-user` hooks exist so the user can build an unlock effect without touching the auth code.
- **The setup-skill invariants that this skill keeps:** `output: 'static'`, `session: false`, `imageService: 'compile'`, the hashed meta CSP (all client code is Astro-processed modules; no inline scripts or `define:vars`), `not_found_handling: "404-page"`, HSTS without `preload`, token-first credentials.

**Rejected (don't re-propose without new evidence):** Cloudflare Access (login page can't be designed; IdPs the owner doesn't trust); a password gate (phishable, a secret to guess); Better Auth / Auth.js (assume a database, heavy for a handful of users); Lucia (deprecated; its session guide is the model followed); Playwright in generated sites; path-prefix gating; `secrets.required`; storing challenges in KV (eventual consistency); a `returnTo` parameter (open redirect surface; the lock page is served in place instead).

## 7. Testing the skill before release

1. **Syntax and manifests:** `python3 -m py_compile scripts/*.py`; `claude plugin validate . --strict && claude plugin validate .claude-plugin/plugin.json --strict`; `claude --plugin-dir . plugin details astro-cloudflare-passkey-login` for the token cost.
2. **Assets in isolation:** in a scratch site produced by the setup skill's Phase A (Steps 1–9, no accounts), run the passkey skill's Steps 1–7 under `claude --plugin-dir <repo>`. Expect `npm test` green, `npm run verify` listing the bindings with `main` present, and `verify_site.py --local --gated` at 0 FAIL. Then delete `src/pages/auth/session.ts` and every other on-demand route and confirm the build guard **fails** the build.
3. **`verify_site.py --gated` against a public site** (for example `cloudflare.com`) must not crash and must report FAILs, not exceptions. Against `https://twofabianos.com` once its gate is live, expect 0 FAIL.
4. **Steps 8–12** need real accounts and a browser: review them line by line against the twofabianos rollout, and dogfood them the first time the skill is run on a real site.
5. **Provenance check:** `diff -r` each asset against its twofabianos source at the recorded commit; the only differences allowed are the de-branding rules in §3.3.

## 8. Open items that wait for the `add-login` session

- The final, reviewed contents of every file listed in §3.2, at a commit hash to record in `.claude/CLAUDE.md`.
- Its follow-up pitfalls list, for `references/pitfalls.md`.
- Whether `ratelimits` inside `previews` was accepted by wrangler on a real deploy (the design allows dropping it there).
- The exact `npm run verify` output on the finished build, for the skill's expected-output text.
