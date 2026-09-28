---
name: astro-cloudflare-passkey-login
description: Makes a live Astro static site on Cloudflare Workers private with passkey-only sign-in — WebAuthn via SimpleWebAuthn, sessions in Workers KV, single-use invite links, a Worker gate that runs before every request, an unstyled lock page, and laptop scripts to invite, list and revoke. No passwords, no identity provider, free plan only. Use on a site built by astro-cloudflare-workers-setup when the user says "make my site private", "add login", "add passkey sign-in", "lock the site", "only I should be able to see it", or asks for authentication on an Astro + Cloudflare Workers site.
---

# Passkey sign-in for an Astro site on Cloudflare Workers

Skill directory: `${CLAUDE_SKILL_DIR}`. Every `references/` and `assets/` path is relative to it. The verifier lives in the sibling skill: `${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/scripts/verify_site.py`.

Turns a **live site built by `astro-cloudflare-workers-setup`** into a private one. After this, every page needs a passkey session; anyone else sees a lock page at every URL. Passkeys only: no passwords, no email, no Google or Cloudflare Access. Two or three people, a handful at most.

**Two roles.** 🤖 Claude runs commands. 👤 The user does browser steps (marked `👤 USER ACTION`): saving a passkey, merging a PR. Each hand-off: state it, wait, verify. Creating account resources (KV namespaces, a secret) is Claude's job but needs the user's one-word OK first.

**Design in one paragraph.** `wrangler.jsonc` `main` becomes a custom Worker entry `src/worker.ts`, run before every request. It redirects the `*.workers.dev` host to the apex, serves a small exact public allowlist, routes `/auth/*` and `/invite/*` to on-demand Astro endpoints, and requires a KV-backed session for everything else. Without one, a document request gets the prerendered lock page **at the requested URL** (200, `no-store`); anything else gets 401. Sessions: random token in a `__Host-` cookie, SHA-256 in KV, fixed 24 h. First passkey per person via a single-use invite link from `npm run invite`. The Worker sets every security header itself, including `X-Robots-Tag: noindex, nofollow`: a private site is never indexed, but link previews still work because the lock page carries the OG tags. Full detail: `references/technical-design.md` (read it only for a deviation or a bug).

**What ships unstyled.** The lock and invite pages carry only data hooks. Tell the user this is by design: "when you want the lock screen designed, ask me". The hooks (`data-auth-state` on `<html>`, the `auth:state` event, `data-arrival="unlock"`, `data-user`) are theirs to build on.

## Preconditions — check, and stop with the reason if any fails

```bash
node -v; grep -c '"assets"' wrangler.jsonc; grep -o '"pattern": "[^"]*"' wrangler.jsonc; grep -c "@astrojs/cloudflare" astro.config.mjs; grep -c "output: 'static'" astro.config.mjs; npm pkg get scripts.build scripts.verify scripts.deploy scripts.generate-types; cat .nvmrc; git status --porcelain | wc -l; npx wrangler whoami 2>/dev/null | grep -E 'Account Name|API Token|OAuth'; grep -oE '[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev' public/_headers wrangler.jsonc | head -1; ls src/worker.ts 2>/dev/null
```

- **Built by the setup skill:** `assets` in `wrangler.jsonc`, the adapter and `output: 'static'` in `astro.config.mjs`, the four npm scripts, `.nvmrc`. Missing → this skill doesn't apply; say so.
- **A custom domain is live:** a `routes[].pattern` exists and `curl -sI https://<apex>/` returns 200. Passkeys bind to that host; a site on `*.workers.dev` alone would strand every passkey the day it gets a domain. No domain → run the setup skill's Step 11 first.
- **Authenticated:** `wrangler whoami` shows an account. Token present → never `wrangler login`. Nothing → 👤 ask the user to set `CLOUDFLARE_API_TOKEN` or log in once.
- **Node ≥ 22.18** (`.nvmrc` says 24; the unit tests run `.ts` natively).
- **Clean git tree** (`git status --porcelain` prints nothing) and **`npm run verify` clean** before any change. Dirty → 👤 ask the user to commit or stash first; this skill branches and commits.
- `src/worker.ts` already present → `references/resume.md`.

## Confirm inputs (one message)

Read `<apex>` from `routes[].pattern` and `<name>` from `wrangler.jsonc`. `<backup-host>` is `<name>.<subdomain>.workers.dev`: the precondition grep finds it in `public/_headers` (setup Step 11 wrote a noindex block for it). If nothing prints, 👤 ask the user to copy it from the dashboard (Workers & Pages → the Worker → Settings → Domains & Routes). Confirm all three, don't ask. Ask:

1. **Who signs in?** One to ten lowercase names (`[a-z0-9-]`, 1–32 chars, used as KV keys and in the greeting; the build refuses anything else). Default: the user's first name. A name may equal the site's name (the guard skips the lock page's `<head>`), but never put a name in a stylesheet, script or the lock page body.
2. **Any extra public files the lock page will show?** Exact paths only (a logo). Default: none.
3. Defaults to state, not ask: sessions 24 h fixed (the lock shows about once a day per device), invites 7 days single-use, 10 attempts / 60 s per IP, Face ID / Touch ID / PIN required at every sign-in, Worker Previews only ever show the lock page, `*.workers.dev` redirects to the apex.

## Steps

### Step 1 — Branch

`git switch -c feat/passkey-login`. Pushing to `main` deploys, so everything lands on the branch until Step 10.

### Step 2 — Dependencies

```bash
npm i @simplewebauthn/server@^14 @simplewebauthn/browser@^14 && npm ls @simplewebauthn/server @simplewebauthn/browser astro @astrojs/cloudflare wrangler --depth=0
```

Expect `@simplewebauthn/*` 14.x, `astro` 7.x, `@astrojs/cloudflare` 14.x, `wrangler` ≥ 4.135. A different major → check the changelog before continuing and tell the user what moved (see *Versions*).

### Step 3 — Copy the code

Only if `src/worker.ts` is absent (the copy overwrites):

```bash
cp -R "${CLAUDE_SKILL_DIR}/assets/site/." . && ls src/worker.ts src/lib/auth src/lib/gate src/pages/auth scripts/auth tests/unit tests/build-guard.test.ts .dev.vars.example
```

### Step 4 — Fill the per-site files

All from `${CLAUDE_SKILL_DIR}/assets/templates/`. Replace every `<placeholder>`; afterwards this grep must print nothing:

```bash
grep -rnE '<(apex|backup-host|kv-id|preview-kv-id|user-[0-9]|site-name|extra-public-path)>' src wrangler.jsonc
```

- `auth.ts.template` → `src/data/auth.ts`: the names from Q1. Copy strings may be reworded, never removed.
- `allowlist.ts.template` → `src/lib/gate/allowlist.ts`: add Q2's exact paths to `PUBLIC_FILES` (none → copy as is). Never a directory or wildcard, never an image under `/_astro/`.
- `lock.astro.template` → `src/pages/lock.astro` and `invite.astro.template` → `src/pages/invite/[token].astro`: set the `Layout` import path and the `title`. Keep every `data-*` hook and the closing `<script>` unchanged.
- `wrangler.additions.jsonc` → **targeted Edits** to `wrangler.jsonc`: set `main`, add `run_worker_first` inside the existing `assets`, add `kv_namespaces` (without `id` for now), `ratelimits`, `vars`, `previews`. Never rewrite the file; keep `compatibility_date`, `routes`, `observability` as they are.
- `package.json`: `"build": "astro check && astro build && node --test tests/build-guard.test.ts"`, `"test": "node --test tests/unit/"`, `"invite": "node scripts/auth/invite.mjs"`, `"auth:list": "node scripts/auth/list.mjs"`, `"auth:revoke": "node scripts/auth/revoke.mjs"`. `verify` and `deploy` are unchanged.
- `.gitignore`: append `.dev.vars*` and `!.dev.vars.example`.
- `src/layouts/Layout.astro`: add `chrome?: 'page' | 'none'` to `Props` (default `'page'`). Everything that is site chrome — header, nav, footer, and the two scripts `<script src="../scripts/arrival.ts"></script>` and `<script src="../scripts/signout.ts"></script>` — renders only when `chrome === 'page'`; `<slot />` always renders. Anonymous visitors see the lock page with `chrome="none"`, so nothing in the chrome (page titles in a nav, a sign-out button) may leak. If the site has a header component, add a `<button type="button" data-auth-action="signout">` to it (unstyled). The lock and invite pages pass `chrome="none"`; make `src/pages/404.astro` pass it too (the Worker serves the site's 404 for unknown `/auth/*` and `/invite/*` paths).
- `public/_headers`: add the comment `# src/worker.ts runs first and sets these same headers on every response it returns; these rules still reach asset responses, but the Worker is authoritative.` If the site customised its headers (dropped `includeSubDomains`, changed `Referrer-Policy` or `Permissions-Policy`), mirror that in `src/lib/gate/headers.ts`, which otherwise re-imposes the defaults on every response.
- `public/robots.txt`: remove the `Sitemap:` line (the sitemap is behind the gate now; `robots.txt` itself stays public and crawlable).
- `.dev.vars` (gitignored) from `.dev.vars.example` with `AUTH_COOKIE_SECRET=$(openssl rand -base64 32)`.

Then `npx prettier --write src --log-level warn` (not `wrangler.jsonc`: Prettier would re-indent the adapter's file).

### Step 5 — Types

`npm run generate-types`. `worker-configuration.d.ts` must now mention `AUTH_KV`, `AUTH_RATE_LIMIT`, `RP_ID`, `ORIGIN`, `BACKUP_HOST`.

### Step 6 — Unit tests and the dry run

```bash
npm test && npm run verify
```

Expect two `node --test` summaries with `fail 0` (the unit suites, then the build guard's 5 tests after the build), `astro check` `0 errors`, then the dry run: `Configuration being used: "dist/server/wrangler.json"`, an `Attaching additional modules` table, and `Your Worker has access to the following bindings:` listing `AUTH_KV`, `AUTH_RATE_LIMIT`, `ASSETS` and the three vars. **`No bindings found.` means the gate was dropped**: see `references/pitfalls.md`, first row.

### Step 7 — Local gate check

```bash
npm run preview &
python3 "${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/scripts/verify_site.py" --local --gated http://localhost:4321
curl -sI -H 'Sec-Fetch-Dest: image' http://localhost:4321/x.png | head -1
npx astro preview stop
```

Expect 0 FAIL and `HTTP/1.1 401`. Normal: SKIPs for HTTPS/Cloudflare, and a WARN for the analytics beacon when analytics isn't set up. A robots.txt WARN means the `Sitemap:` line is still there (Step 4). Optional 👤 look: open `http://localhost:4321/` and see the unstyled lock page. A local passkey round-trip needs Chrome's virtual authenticator; skip it here, Step 11 does the real one. Commit the step's work.

### Step 8 — Cloudflare resources (🤖, after the user's OK)

Tell the user: two free KV namespaces and one secret will be created on the account. Then:

```bash
W="$PWD/node_modules/.bin/wrangler"; cd "$(mktemp -d)" && "$W" kv namespace create <name>-auth && "$W" kv namespace create <name>-auth-preview; cd -
```

Run from an empty directory so wrangler can't rewrite `wrangler.jsonc`, with the project's own wrangler (a bare `npx wrangler` there would download the latest). Paste the two ids into `kv_namespaces[0].id` and `previews.kv_namespaces[0].id`. Then:

```bash
openssl rand -base64 32 | npx wrangler secret put AUTH_COOKIE_SECRET
openssl rand -base64 32 | npx wrangler preview base-config secret put AUTH_COOKIE_SECRET
npx wrangler secret list
```

The secret is never printed or stored anywhere else. `npm run verify` again; the ids don't change its output.

### Step 9 — Push the branch

Commit and `git push -u origin feat/passkey-login`. With Workers Builds connected (setup Step 12), the branch gets a Worker Preview that shows the lock page (👤 optional look; sign-in there is impossible by design). Check the run with the setup skill's `gh api` line for the branch.

### Step 10 — Deploy

👤 **USER ACTION** — merge the branch into `main` (or, without Workers Builds, 🤖 `npm run deploy`). Wait for the **`main`** check run to finish, as in setup Step 12. Then:

```bash
python3 "${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/scripts/verify_site.py" --gated https://<apex>
curl -sI https://<backup-host>/x | grep -iE '^(HTTP|location)'
```

Expect 0 FAIL and a `301` with `location: https://<apex>/x`. **From this moment everyone without a session sees the lock page.**

### Step 11 — Enrol

```bash
npm run invite -- <first-name>
```

👤 **USER ACTION** — open the printed URL on the device that will hold the passkey, tap the button, save the passkey (Face ID / Touch ID / PIN). They land on `/` signed in. Repeat for each name, sending the link over a private channel. Verify with `npm run auth:list`: one credential per person. A second device with a synced passkey (iCloud Keychain, Proton Pass, 1Password…) just signs in; a device without one needs its own invite.

### Step 12 — Docs

Append `assets/templates/claude-md-section.md` (placeholders filled) to the site's `CLAUDE.md`. Add a `CHANGELOG.md` entry ("Private passkey sign-in") and a README line. Commit and push. Tell the user: the site is private, the lock page is unstyled on purpose, and how to invite, list and revoke.

## Completion

- `verify_site.py --gated https://<apex>` → 0 FAIL, and `curl -sI https://<backup-host>/x` → 301.
- `npm run auth:list` shows every person.
- `git status` clean on `main`; `.dev.vars` present locally and ignored.
- The user knows: how to invite someone new, how to revoke a lost device, that rollback past the gate makes the site public, and that `npm run verify` must keep listing bindings.

## Troubleshooting

`references/pitfalls.md`. The three that matter most: an all-prerendered build **silently drops the Worker** (build guard); Worker Previews **inherit nothing** (`previews` block); `_headers` **doesn't apply** to Worker-generated responses (the Worker sets headers).

## Versions (verified 2026-09-28)

| Package | Verified | Floor |
| :-- | :-- | :-- |
| `@simplewebauthn/server` / `browser` | 14.0.3 / 14.0.0 | ^14 (pins `supportedAlgorithmIDs`; v14 otherwise prefers ML-DSA) |
| astro / `@astrojs/cloudflare` / wrangler | 7.3.5 / 14.3.3 / 4.141.0 | the setup skill's floors |
| Node | 24 | 22.18 for `node --test` on `.ts` |
