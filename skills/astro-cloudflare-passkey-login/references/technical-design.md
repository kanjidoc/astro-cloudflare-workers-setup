# Passkey sign-in: technical design

Read this only for a deviation from the shipped code or when debugging. The procedure is SKILL.md. Ported from the <site> private sign-in (its branch `feat/private-sign-in`, commit 62a9a67); `<apex>`, `<backup-host>` and `<user>` stand for the site's own values.

This document covers how the feature works, not how anything looks. Where a site's own visual layer needs a hook, it names the hook (a data attribute or an event).

---

## 1. Goals and non-goals

| Goals | Non-goals (YAGNI) |
| :-- | :-- |
| Every page except a small public allowlist needs a valid session | Passwords, email, magic links, recovery codes |
| Passkeys only (WebAuthn discoverable credentials), for exactly the names in `USERS` | Any identity provider, Cloudflare Access, OAuth |
| First passkey per person or device through a one-time invite made on the owner's laptop | An admin UI on the site. Admin work is laptop scripts only. |
| Server-side sessions with per-device revocation | A database beyond one Workers KV namespace |
| Stealth kept: noindex everywhere, link previews still work | Rate limiting as a hard quota (it only slows attackers down) |
| Free plan only (Workers Free, KV free tier, Rate Limiting binding) | Analytics, audit dashboards, notifications |
| Expose UI states as data attributes so a site can style and animate the flow | Deciding anything visual |

---

## 2. Architecture

Every request runs the Worker first (`assets.run_worker_first: true`). The Worker is a custom entry, `src/worker.ts`. It decides between redirect, public asset, lock page, auth endpoint and gated content, then hands off to static assets or to Astro's handler.

```
                        browser / link-preview bot
                                   │
                                   ▼
┌────────────────────────── src/worker.ts (every request) ──────────────────────────┐
│ 1. host == BACKUP_HOST (<backup-host>)? ─► 301 to apex, same path│
│ 2. public allowlist (GET/HEAD)? ──────────────► env.ASSETS.fetch(request)           │
│ 3. /auth/*  or  /invite/* ? ──────────────────► handle() → Astro on-demand routes   │
│ 4. session cookie → sha256 → KV "session:<hash>"                                    │
│      ├─ valid ─► handle() (prerendered asset or on-demand page)                     │
│      │           + HTMLRewriter <html data-user data-arrival?> on HTML           │
│      │           + private cache headers                                            │
│      └─ none/invalid                                                                │
│           ├─ GET/HEAD and Sec-Fetch-Dest absent or "document"                       │
│           │     ─► env.ASSETS.fetch("/lock/")   status 200, no-store                │
│           │        (URL bar keeps the requested URL; bots get OG tags)              │
│           └─ anything else ─► 401, empty body, no-store                             │
│ 5. applySecurityHeaders() on every response it returns                              │
└─────────────────────────────────────────────────────────────────────────────────────┘
          │                         │                              │
          ▼                         ▼                              ▼
  Workers Static Assets      Astro handler                 Workers KV "AUTH_KV"
  (dist/client, _headers)    (@astrojs/cloudflare/handler)  user:, invite:, cred:, session:
                             /auth/* JSON, /invite/[token]  Rate Limiting "AUTH_RATE_LIMIT"
```

Why the gate lives in the Worker entry and not in Astro middleware: middleware runs at build time for prerendered pages, so it can't protect them at request time (see Verified facts F4).

The build must keep at least one on-demand route. If every route is prerendered, the Cloudflare Vite plugin builds an assets-only Worker and **drops `main`**, which would silently remove the gate (F5). The `/auth/*` endpoints and `/invite/[token]` are on-demand, and a build check enforces this (§10.3).

---

## 3. Components and files

### 3.1 New files

| File | Purpose | Interface |
| :-- | :-- | :-- |
| `src/worker.ts` | Worker entry: host redirect, allowlist, gate, lock page, security headers, the `data-user`/`data-arrival` rewrite, hand-off to Astro | `export default { fetch(request, env, ctx) } satisfies ExportedHandler<Env>` |
| `src/lib/gate/allowlist.ts` | Pure check of whether a path is public | `isPublicPath(pathname: string): boolean` |
| `src/lib/gate/classify.ts` | Decides whether an unauthenticated request should get the lock page | `wantsDocument(request: Request): boolean` |
| `src/lib/gate/headers.ts` | Security headers and cache policy | `applySecurityHeaders(res, opts)`, `applyGatedCache(res, pathname)` |
| `src/lib/auth/config.ts` | Constants and env reads | `USERS`, `type User` (from `src/data/auth.ts`), TTLs, `authConfig(env): { rpID, rpName, origin, cookieSecret, kv, limiter } \| null` |
| `src/lib/auth/encoding.ts` | base64url, hex | `b64url.encode/decode`, `hex(buf)` |
| `src/lib/auth/crypto.ts` | Random tokens, hashing, HMAC | `randomToken(bytes=32): string`, `sha256Hex(s): Promise<string>`, `hmacSign(key, data)`, `hmacVerify(key, data, sig): Promise<boolean>` (uses `crypto.subtle.verify`, which is constant-time) |
| `src/lib/auth/cookies.ts` | Parse and serialise cookies | `readCookie(req, name)`, `sessionCookie(token)`, `clearSessionCookie()`, `challengeCookie(value)`, `clearChallengeCookie()` |
| `src/lib/auth/challenge.ts` | Stateless signed challenge | `sealChallenge(secret, payload): Promise<string>`, `openChallenge(secret, cookie, now, purpose): Promise<ChallengePayload \| null>` |
| `src/lib/auth/store.ts` | Typed KV access, the only module that touches `AUTH_KV` | `getSession/putSession/deleteSession`, `getCredential/putCredential`, `getInvite/deleteInvite`, `getUser` |
| `src/lib/auth/session.ts` | Resolve and create sessions | `resolveSession(req, kv): Promise<{ user, keyHash, record } \| null>`, `createSession(env, user, credId, meta): Promise<string /*Set-Cookie*/>` |
| `src/lib/auth/webauthn.ts` | Thin wrappers around SimpleWebAuthn with fixed settings (§5.1) | `authOptions(cfg)`, `verifyAuth(cfg, response, expectedChallenge, cred)`, `regOptions(cfg, user)`, `verifyReg(cfg, response, expectedChallenge)` |
| `src/lib/auth/http.ts` | Shared endpoint guards | `requireSameOrigin(req, origin)`, `requireJson(req)`, `rateLimit(limiter, req, bucket)`, `json(body, status)` |
| `src/pages/lock.astro` | Prerendered lock screen (`/lock/`). Unstyled; carries the hooks in §6. | Uses `Layout` with `noindex` (no canonical or `og:url`, since it's served under any URL) |
| `src/pages/invite/[token].astro` | On-demand invite page (`prerender = false`) | Renders the invite or unavailable variant (§5.3) |
| `src/pages/auth/signin/options.ts`, `.../signin/verify.ts` | Sign-in endpoints | §5.2 |
| `src/pages/auth/invite/options.ts`, `.../invite/verify.ts` | Registration endpoints | §5.3 |
| `src/pages/auth/signout.ts` | Revokes the current session | §5.4 |
| `src/pages/auth/session.ts` | Who am I, used after a bfcache restore | `GET` → `200 {user}` or `401` |
| `src/scripts/auth-flow.ts` | Client state machine shared by lock and invite (§6.1) | `createAuthFlow({ kind, startCeremony, fetchOptions, verify, readyForSuccess? })` |
| `src/scripts/arrival.ts` | Bundled module on gated pages: the bfcache session check (§6.5) | none |
| `src/scripts/signout.ts` | Sign-out mechanics (8 s timeout on the POST, navigate only on 204): sets `data-auth-state="signing-out"`, waits for the visual layer's optional `readyToLeave()` promise (default: resolves immediately), then POSTs and navigates (§5.4) | none |
| `scripts/auth/kv.mjs` | Wrapper around `npx wrangler kv key …` (`--remote` by default, `--local` for tests) | `put/get/list/del` |
| `scripts/auth/invite.mjs` | `npm run invite -- <name>` | §8.1 |
| `scripts/auth/list.mjs` | `npm run auth:list` | §8.1 |
| `scripts/auth/revoke.mjs` | `npm run auth:revoke -- …` | §8.1 |
| `tests/unit/*.test.ts` | `node:test` unit tests for pure helpers | §10.1 |
| `.dev.vars.example` | Committed template, no real secret | §8.3 |

### 3.2 Changed files

| File | Change |
| :-- | :-- |
| `wrangler.jsonc` | `main: "./src/worker.ts"`, `assets.run_worker_first: true`, `kv_namespaces`, `ratelimits`, `vars`, and a `previews` block (§8.2). Then run `npm run generate-types`. |
| `worker-configuration.d.ts` | Regenerated: `AUTH_KV: KVNamespace`, `AUTH_RATE_LIMIT: RateLimit`, the vars, and `AUTH_COOKIE_SECRET` |
| `package.json` | Deps `@simplewebauthn/server@^14`, `@simplewebauthn/browser@^14`. Scripts `test`, `invite`, `auth:list`, `auth:revoke`. |
| `.gitignore` | Add `.dev.vars*` and `!.dev.vars.example` (today only `.env*` is covered) |
| `src/layouts/Layout.astro` | Gets a `chrome` prop; on gated pages (`chrome === 'page'`) it includes `arrival.ts` and `signout.ts`. A sign-out control is any `<button data-auth-action="signout">`. |
| `public/_headers` | No rule changes. Its comment gains a note that the Worker is now authoritative (§7.4). |
| `CLAUDE.md`, `CHANGELOG.md` | The skill's Step 12 |

`astro.config.mjs` doesn't change: `output: 'static'`, `session: false` and `imageService: 'compile'` all stay. Setting `prerender = false` on the few routes above is enough (Astro's default "hybrid" behaviour).

---

## 4. Data model (one KV namespace, binding `AUTH_KV`)

Every value is JSON. The same summary is also stored as KV **metadata** (≤1 KiB), so `wrangler kv key list` shows everything in one list call.

| Key | Value | TTL | Written by | Read by |
| :-- | :-- | :-- | :-- | :-- |
| `user:<name>` | `{ name, webauthnUserID }`. The ID is 32 random bytes, base64url, stable forever. | none | `invite` script (only if missing) | invite options |
| `invite:<sha256hex(token)>` | `{ user, createdAt, expiresAt }` | `604800` s (7 days) | `invite` script | invite page, invite options/verify |
| `cred:<credentialID>` | `{ user, webauthnUserID, publicKey (b64url COSE), counter, transports, deviceType, backedUp, aaguid, createdAt, lastUsedAt }` | none | invite verify. Sign-in verify updates `counter` and `lastUsedAt`. | sign-in verify, scripts |
| `session:<sha256hex(token)>` | `{ user, credentialId, createdAt, ua (≤120 chars), country }` | `86400` s (24 h), fixed | sign-in verify, invite verify | gate, endpoints, scripts |

- **Raw tokens are never stored.** Session and invite tokens are 32 random bytes (base64url). KV holds only their SHA-256. A 256-bit random token needs no pepper or slow hash.
- **The challenge isn't in KV.** It lives in a signed cookie (§5.1), because a KV write isn't guaranteed visible to a read at another location within 60 s, and it saves a write each time.
- **Write budget** (free tier: 1,000 writes/day). A sign-in costs 2 writes (the credential counter and the session). A registration costs 3. A sign-out costs 1 delete. Two people stay orders of magnitude under the limit.
- **Read budget** (100,000/day). One `session:` read per gated request (HTML and gated images). Public assets cost 0 reads.
- **Consistency:** revoking or signing out takes effect everywhere within about 60 s (default `cacheTtl`). The browser that signs out loses its cookie immediately. A brand-new session or credential is visible at once in the same location, which is where the next request comes from.

---

## 5. Auth flows

### 5.1 Fixed WebAuthn and cookie settings

| Setting | Value | Why |
| :-- | :-- | :-- |
| `rpID` | `env.RP_ID`: `<apex>` (local: `localhost`) | Passkeys are bound to the apex |
| `expectedOrigin` | `env.ORIGIN`: `https://<apex>` (local: `http://localhost:4321`). Exact match, a single value. | Phishing resistance |
| `rpName` | `RP_NAME` from `src/data/auth.ts` | Shown by the OS or password-manager prompt |
| Registration `authenticatorSelection` | `{ residentKey: 'required', userVerification: 'required' }` | Discoverable credential, so the lock screen needs no username. UV at every ceremony (§5.1 decision). |
| `attestationType` | `'none'` | No attestation policy is needed for two people |
| `supportedAlgorithmIDs` | `[-8 (Ed25519), -7 (ES256), -257 (RS256)]`, passed to both generate and verify | Deterministic. v14 otherwise prefers ML-DSA when it detects runtime support (F7). |
| `excludeCredentials` | not used | A duplicate passkey is harmless and revocable. Avoids a confusing "already registered" failure. |
| Authentication | `allowCredentials: []` (discoverable), `userVerification: 'required'`, `timeout: 120000` | Button-only lock screen. No conditional UI or autofill (there's no input field). |
| `requireUserVerification` on verify | `true` (the library default). No fallback if an authenticator skips UV. | §5.1 decision |
| Counter | Persist `newCounter`. SimpleWebAuthn rejects a counter that doesn't increase once either side is non-zero. Synced passkeys (iCloud Keychain, Proton Pass, 1Password) usually report 0 every time, which passes. | F8 |
| Session cookie | `__Host-auth-session=<token>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400` | `__Host-` pins it to the exact host with no `Domain` attribute |
| Challenge cookie | `__Host-auth-challenge=<b64url(payload)>.<b64url(HMAC-SHA256)>; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=300` | Payload `{ c: challenge, p: 'auth'\|'reg', i?: inviteHash, u?: user, exp }`. Cleared on every verify attempt. |
| Secret | `AUTH_COOKIE_SECRET` (Worker secret, ≥32 random bytes) | The only secret. It signs challenge cookies. |

### 5.2 Sign-in (lock screen)

| UI state (contract) | Client action | HTTP | Server |
| :-- | :-- | :-- | :-- |
| `idle` (page load) | Prefetch options (§6.1) | `POST /auth/signin/options` `{}` | Same-origin check, rate limit, `generateAuthenticationOptions`, `Set-Cookie: __Host-auth-challenge` → `200 { options }` |
| `idle` → `prompting` | Tap on unlock. `startAuthentication({ optionsJSON })` | — | — |
| `prompting` → `idle` | Cancelled or timed out (`NotAllowedError` / `ERROR_CEREMONY_ABORTED` / `AbortError`) | — | — |
| `prompting` → `verifying` | Assertion returned | `POST /auth/signin/verify` body `AuthenticationResponseJSON` | Same-origin, JSON and rate-limit checks. Open the challenge cookie (`p==='auth'`, not expired). `cred:<response.id>` must exist and `response.userHandle === cred.webauthnUserID`. `verifyAuthenticationResponse`. Update the counter. Create the session. Clear the challenge cookie. |
| `verifying` → `success` | `200 { ok: true, user }` | | `Set-Cookie: __Host-auth-session` |
| `verifying` → `failure` | Any non-200, network error, or a 20 s client timeout | | `401 { ok: false }` for every verification failure (no detail), `429` when rate limited, `503` on misconfiguration |
| `failure` → `idle` | The next tap starts a fresh attempt with fresh options | | |

After `success`: navigate with `location.replace(sameURL)` (§6.2). The verify response has already set the one-time arrival cookie (§6.3).

### 5.3 Invite registration

1. the owner runs `npm run invite -- <user>` and sends the printed `https://<apex>/invite/<token>` over a private channel.
2. `GET /invite/<token>` is on-demand. It looks up `invite:<sha256(token)>`:
   - **Found and unexpired:** status `200`. Renders the invite variant with `name` for the contract's "hi {name}".
   - **Missing, used or expired:** status `410`. Renders the unavailable variant. All three cases get the same response (no enumeration).
   - Headers: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`.
   - **GET never consumes the invite.** Link-preview bots that unfurl the link in a chat are harmless.
3. The state machine is the same as sign-in, with different endpoints:

| Step | HTTP | Server |
| :-- | :-- | :-- |
| Options (prefetched on load) | `POST /auth/invite/options` `{ token }` | Checks and rate limit. Invite must exist (`410` otherwise). Read `user:<name>`. `generateRegistrationOptions({ userID, userName: name, userDisplayName: name, … })`. Challenge cookie `{ p:'reg', i: inviteHash, u: name }`. |
| Verify | `POST /auth/invite/verify` `{ token, response }` | Checks. The cookie's `i` must equal `sha256(token)` and its `u` must match. Re-read the invite (must still exist). `verifyRegistrationResponse`. `delete invite:<hash>` first (so a race can't register twice), then `put cred:<id>`, create the session. → `200 { ok: true, user }` |

   - A `410` at any point (the invite was used meanwhile) makes the client call `location.reload()`, and the server then renders the unavailable variant.
   - On success: `location.replace('/')`. The verify response sets the arrival cookie (§6.3). The replace means Back never returns to the spent link.
4. A second device with a synced passkey (iCloud Keychain, Proton Pass, 1Password) needs nothing: it just signs in. A device without the synced passkey needs a new invite.

### 5.4 Sign-out

`POST /auth/signout` (same-origin JSON) → the server deletes `session:<hash>` and responds `204` with:
- `Set-Cookie: __Host-auth-session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`
- no `Clear-Site-Data`: browsers hold that response until the cache is wiped, which left the page blank after sign-out. Gated responses are `private, no-store`, so nothing private is cached anyway.

Before the POST, `signout.ts` sets `data-auth-state="signing-out"` and awaits the visual layer's optional `readyToLeave()` (for the fade). After the `204`, the client calls `location.replace('/')`. The Worker serves the lock page at `/` because the cookie is gone. Only the current session is revoked. Other devices stay signed in.

### 5.5 Session lifetime (24 hours, fixed)

- A session lasts **24 hours from the unlock** and is never renewed, so each device shows the lock screen (and the unlock) about once a day. a deliberate default: the unlock is seen regularly.
- The lifetime is one constant (`SESSION_TTL_S` in `config.ts`), used for both the cookie's `Max-Age` and the KV `expirationTtl`.
- A cookie with no matching KV record is treated as signed out, and the lock response clears the stale cookie.

---

## 6. Front-end mechanics

### 6.1 State machine wiring (`src/scripts/auth-flow.ts`)

- **States:** `idle | prompting | verifying | success | failure`, exactly as in the contract.
- **Hooks for the visual layer:**
  - `document.documentElement.dataset.authState = state`
  - `document.dispatchEvent(new CustomEvent('auth:state', { detail: { from, to } }))`
- **Button:** a real `<button>`. Taps are ignored unless the state is `idle` or `failure`.
- **Options prefetch:** options are fetched on load and on `pageshow`. They count as stale after 4 minutes (the challenge cookie lives 5), and a `visibilitychange` back to visible refetches them if stale. With fresh options, the tap calls `startAuthentication` / `startRegistration` synchronously inside the click handler, so Safari's user-activation requirement is met. If they're stale, the tap fetches first (still usually within activation).
- **Error mapping** (from SimpleWebAuthn's `WebAuthnError.code` or `cause.name`):
  - `ERROR_CEREMONY_ABORTED`, `NotAllowedError` or `AbortError` → `idle`. Silent, as the contract requires. Cancel and timeout can't be told apart, and both are treated as a cancel.
  - Any other ceremony error (e.g. `SecurityError`, `InvalidStateError`) → `failure`.
- **`verifying` hold:** the machine stays in `verifying` until the server answers or a 20 s `AbortSignal.timeout` fires. **`readyForSuccess?: () => Promise<void>`** is an optional hook the visual layer can register (for example, to let an animation finish). `success` is entered only after both the `200` and this promise resolve. The default resolves immediately.
- **`success`:** navigate (§6.2). No JS waits on animations; any entrance effect belongs to the destination page (§6.3).
- **No inline styles and no `define:vars`.** Everything the visual layer needs comes through data attributes, classes and the event above.

### 6.2 Navigation after success and "return to the page you asked for"

- The lock page is **served at the requested URL** (no redirect), so returning is just reloading that URL with a session. There's **no `returnTo` parameter**, and so no open redirect.
- The navigation is **`location.replace(url)`** where `url = location.pathname + location.search`. It's same-origin and script-initiated with `replace` history handling. The spec allows this navigation type (push or replace, as long as it isn't triggered from browser UI), and a local test in Chrome 153 confirmed that a cross-document view transition fires for it, even to the identical URL after an async fetch (F10). **Never `location.reload()`**: reloads are excluded from view transitions (verified).
- **Fragment:** the navigation target is `pathname + search` without the `#hash` (navigating to the identical URL with a hash would only be a fragment jump). The fragment is dropped. For two people and no deep-linked anchors today, that's accepted (YAGNI).
- **Invite:** `location.replace('/')`.
- **Signed in and visiting `/lock/` directly:** `303` to `/`.

### 6.3 The arrival signal (one-time, for the site's own unlock effect)

Every successful `verify` response (sign-in and invite) also sets `__Host-auth-arrival=lock|invite; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=30`. On the next gated **HTML** response to a `GET` with `Sec-Fetch-Dest: document`, the Worker's `HTMLRewriter` (already running for `data-user`, §6.6) adds `data-arrival="unlock"` and, for invites, `data-arrival-from="invite"` to `<html>`, and expires the cookie in the same response. It's consumed once, so reloads, back/forward and later visits are normal direct visits (no `data-arrival`). HEAD, prefetch and image requests never consume it.

- **Hook for the visual layer:** `[data-arrival="unlock"]` on the first page after sign-in. A site can play an entrance animation from it with CSS alone, so a script failure can't strand the page. The shipped code adds no animation.
- **Reduced motion:** the mechanism never skips the signal; the visual layer reads `prefers-reduced-motion` itself.

### 6.4 CSP

- The existing hashed `<meta>` CSP stays. `script-src 'self' 'sha256-…'` already includes `'self'`.
- `auth-flow.ts`, `arrival.ts`, `signout.ts` and `@simplewebauthn/browser` are normal Astro-processed `<script>` modules, so they're bundled or inlined and hashed by Astro.
- There are no inline classic scripts, no `style=""` attributes and no `define:vars`, anywhere.

### 6.5 bfcache

| Page | Risk | Mechanism |
| :-- | :-- | :-- |
| Lock and invite | A restored page could sit in `verifying`, or hold stale options | `pageshow` with `persisted` resets the state to `idle` and refetches options. Their responses are `no-store`, and the success navigation uses `replace`, so a Back after unlocking never lands on them. |
| Gated pages after sign-out | Back could restore private content from bfcache | Gated HTML is `Cache-Control: private, no-store`. The sign-out uses `replace` and changes the HttpOnly cookie (Chrome evicts no-store bfcache entries when cookies change). Belt and braces: `arrival.ts` listens for `pageshow` with `persisted` and calls `GET /auth/session`, which answers `401` → `location.reload()` → lock page. This covers Safari, which may keep no-store pages. |
| Gated pages across back/forward | A back/forward traverse could replay the unlock animation | The arrival cookie is consumed by the first gated HTML response, so a traverse never carries `data-arrival`. |

### 6.6 Identity for the page behind the lock

On every gated `text/html` response, the Worker's `HTMLRewriter` sets `<html data-user="<user>">`. It also strips `ETag` (the body now differs per user) and forces `private, no-store`. No JS is needed, and it's CSP-neutral. Whether and how the name is shown is a visual decision. `GET /auth/session` returns the same value for scripts.

---

## 7. The gate (`src/worker.ts`)

### 7.1 Host handling

| Host | Behaviour |
| :-- | :-- |
| `<apex>` | Gate as described |
| `env.BACKUP_HOST` (`<backup-host>`) | `301` to `https://<apex>` with the same path and query, before anything else. Passkeys are bound to the apex and can't be used here. |
| Anything else (Worker Preview hosts `*-<backup-host>`, `localhost` in tests) | Gated like the apex. On a preview host, sign-in fails by construction (the RP ID doesn't match), so previews only ever show the lock screen. |

### 7.2 Public allowlist (GET and HEAD only; everything else needs a session)

| Pattern | Why it's public |
| :-- | :-- |
| `/_astro/*.css`, `/_astro/*.js`, `/_astro/**/*.woff2` (by extension only, **never images**) | The lock and invite pages' own styles, scripts and fonts. Future private photos processed by Astro land in `/_astro/`, so images stay gated. |
| `/favicon.svg`, `/favicon.ico`, `/apple-touch-icon.png` | Browser chrome |
| `/robots.txt` | Must stay open so crawlers can read the noindex |
| `/og.webp` | Link previews |
| Any exact path the site's lock page needs (a logo). | Exact paths only. Add the file's exact path to `PUBLIC_FILES`; never a directory or wildcard. |
| `/auth/*`, `/invite/*` | Routed to Astro. Each endpoint does its own checks. |

**Consequence to record in CLAUDE.md:** because `/_astro/*.js|css` is public, **private content must never be baked into JS or CSS**. It belongs in gated HTML, gated images, KV or on-demand responses.

### 7.3 Unauthenticated responses

| Request | Response |
| :-- | :-- |
| GET or HEAD, `Sec-Fetch-Dest` absent or `document` (browsers and link-preview bots) | The lock page, fetched with `env.ASSETS.fetch(new URL('/lock/', request.url))`. The trailing slash matters: the asset is `lock/index.html`, and `/lock` would 307. Status `200`, `Cache-Control: no-store`. This happens for **every** path, including ones that don't exist, so nothing leaks about what exists. |
| Any other GET or HEAD (image, script, fetch …) | `401`, empty body, `no-store` |
| Any other method outside `/auth/*` | `401`, empty body |

### 7.4 Headers

- **Security headers on every Worker response:** `applySecurityHeaders` sets them with `headers.set`, so it's idempotent. `_headers` rules do apply to responses from `env.ASSETS.fetch()` (F2), but they don't apply to responses the Worker creates (redirects, 401s, JSON, HTMLRewriter output), so the Worker is authoritative:
  - `X-Robots-Tag: noindex, nofollow` (stealth; on every response and every host)
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (**never `preload`**)
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin` (invite page: `no-referrer`)
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()` (WebAuthn's `publickey-credentials-*` features default to `self` and aren't listed)
- **Cache policy:**
  - Gated HTML: `private, no-store`
  - Gated `/_astro/*` non-allowlisted files (hashed): `private, max-age=31536000, immutable`, overriding the public immutable default
  - Other gated files: `private, no-cache`
  - Lock and invite pages, auth JSON and 401s: `no-store`
  - Public allowlist: unchanged (from `_headers` and the asset defaults)
- **Link previews:** unauthenticated bots get the lock page. It carries `og:title`, `og:description` and `og:image` (absolute `https://<apex>/og.webp`), and `og.webp` is public. `Layout`'s `noindex` prop drops `canonical` and `og:url` on the lock page, because it's served under arbitrary URLs.

---

## 8. Operations

### 8.1 Laptop scripts (`$CLOUDFLARE_API_TOKEN` from the environment; never `wrangler login`)

| Command | What it does |
| :-- | :-- |
| `npm run invite -- <<user>\|<user>> [--hours <n>]` | Checks the name. Creates `user:<name>` if it's missing. Generates the token and writes `invite:<sha256>` with `--ttl` (default 7 days) and metadata. Prints the URL once. The token is never written anywhere else. |
| `npm run auth:list` | Lists `cred:` and `session:` with a short id (the first 8 hex characters), user, created, last used, country, UA and AAGUID. Lists pending invites (user and expiry only). |
| `npm run auth:revoke -- --session <id8>` | Deletes that one session (one device) |
| `npm run auth:revoke -- --credential <id8>` | Deletes the passkey and every session created with it |
| `npm run auth:revoke -- --user <name>` | Deletes all of that person's sessions ("sign out everywhere"). Passkeys stay. |
| `npm run auth:revoke -- --invite <user>` | Deletes that person's pending invites |

- All KV calls go through `npx wrangler kv key … --binding AUTH_KV --remote`. Wrangler 4 needs `--remote` explicitly, because local is the default for `kv` commands.
- Scripts accept `--local` for tests and `--preview` for the preview namespace.
- Nothing prints a session token, the secret or the API token.

### 8.2 One-time setup (the owner's laptop)

```sh
npx wrangler kv namespace create <name>-auth          # → id for wrangler.jsonc
npx wrangler kv namespace create <name>-auth-preview  # → id for previews block
openssl rand -base64 32 | npx wrangler secret put AUTH_COOKIE_SECRET
openssl rand -base64 32 | npx wrangler preview base-config secret put AUTH_COOKIE_SECRET
npm run generate-types
```

The `wrangler.jsonc` additions:

```jsonc
"main": "./src/worker.ts",
"assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "404-page", "run_worker_first": true },
"kv_namespaces": [{ "binding": "AUTH_KV", "id": "<prod id>" }],
"ratelimits": [{ "name": "AUTH_RATE_LIMIT", "namespace_id": "1001", "simple": { "limit": 10, "period": 60 } }],
"vars": { "RP_ID": "<apex>", "ORIGIN": "https://<apex>", "BACKUP_HOST": "<backup-host>" },
"previews": {
  "vars": { "RP_ID": "<apex>", "ORIGIN": "https://<apex>", "BACKUP_HOST": "<backup-host>" },
  "kv_namespaces": [{ "binding": "AUTH_KV", "id": "<preview id>" }],
  "ratelimits": [{ "name": "AUTH_RATE_LIMIT", "namespace_id": "1002", "simple": { "limit": 10, "period": 60 } }]
}
```

- **The `previews` block is required.** Worker Previews inherit no bindings or vars (F11). Previews get their own KV namespace, so preview code never touches production sessions.
- If Wrangler rejects `ratelimits` inside `previews`, drop it there. The code treats a missing limiter as "no limit" and logs once (it's only a brake).
- The namespace ids aren't secrets and can be committed (the repo is private).
- **Don't use `secrets.required`.** When it's set, `.dev.vars` loads only the listed secrets, which would block the local `RP_ID`/`ORIGIN` overrides (F12). Instead the Worker **fails closed**: if `AUTH_COOKIE_SECRET` or `AUTH_KV` is missing, the auth endpoints return `503`, the gate still serves the lock page, and nothing gated is ever served.
- **Rate limit keys** are `${cf-connecting-ip}:${bucket}`, with buckets `signin` and `invite`, plus `invite-get` on the invite page. Cloudflare's docs advise against IP keys for authenticated traffic, but these endpoints are unauthenticated, so IP is the only key available. Exceeding the limit returns `429`, which the UI treats as `failure`.

### 8.3 Local development

`.dev.vars` is gitignored. `.dev.vars.example` is committed:

```
RP_ID=localhost
ORIGIN=http://localhost:4321
BACKUP_HOST=backup.localhost
AUTH_COOKIE_SECRET=replace-with-openssl-rand-base64-32
```

- `.dev.vars` overrides `vars` locally.
- Local KV and rate-limit state live in `.wrangler/state` (already gitignored).
- Create a local invite with `npm run invite -- <user> --local`.
- **The authoritative local check is `npm run build && npm run preview`.** The CSP and `run_worker_first` are only faithful there. Whether `astro dev` routes every static file through `src/worker.ts` isn't relied on.
- Chromium and Firefox accept `Secure` / `__Host-` cookies on `http://localhost`.

### 8.4 CI/CD

- Workers Builds needs **no new build secrets**. The build doesn't read `AUTH_COOKIE_SECRET`. The runtime secret lives on the Worker and survives deploys. The preview secret lives in the Previews base config.
- The build and deploy commands don't change.
- `npm run verify` must stay clean. Its expected output changes: it now lists the `AUTH_KV`, `AUTH_RATE_LIMIT`, `ASSETS` and vars bindings instead of "No bindings found."
- After any `wrangler.jsonc` change, run `npm run generate-types`.

---

## 9. Security review

### 9.1 Threat model

| Threat | Mitigation | Residual risk |
| :-- | :-- | :-- |
| Phishing, look-alike domains | WebAuthn binds to RP ID `<apex>`. The server checks `expectedOrigin` and `expectedRPID` exactly. | None practical |
| Session theft (XSS) | HttpOnly cookie. Strict hashed CSP with no third-party scripts. No user-generated HTML. | A stolen cookie works until revoked or for at most 24 h. `auth:revoke`. |
| Session theft (device or network) | HTTPS only, HSTS, `__Host-` and `Secure`. Only the token's hash is stored. | Physical device access is out of scope |
| CSRF on JSON endpoints | `Origin` must equal `env.ORIGIN`. `Content-Type: application/json` is required (forces a CORS preflight, which is never granted). `Sec-Fetch-Site` must be `same-origin` when present. Session cookie is `SameSite=Lax`, challenge cookie `SameSite=Strict`. | None practical |
| Invite link leakage | 256-bit token, stored hashed, 7-day TTL, single use, sent over a private channel. `auth:list` shows every credential with its creation time and AAGUID, so an unexpected one stands out. If a person's link reports "already used", that's the signal to revoke. | Whoever opens a leaked link first, within 7 days, gets a passkey. Detectable, revocable. |
| Open redirect via return URL | There's no return URL parameter. The lock page is served in place. The navigations go to `location.pathname + search` (same origin) or `/`. | None |
| Account and resource enumeration | The lock page is served for every path. Sign-in errors are a uniform `401 {ok:false}`. Invite unavailable is uniform `410`. | None practical |
| Assertion replay | The challenge is HMAC-bound, 5-minute expiry, cleared after each attempt. The origin check. The counter check (weak for synced passkeys). | The challenge isn't single-use server-side. Replay needs both a captured assertion and the HttpOnly Strict challenge cookie within 5 minutes. Accepted. |
| Brute force and cost abuse | Rate Limiting binding per IP and bucket. Every endpoint rejects malformed input before any KV write. | Per-location and eventually consistent, so it's a brake, not a quota (F1). Free plan daily limits cap the damage. |
| Clickjacking | `X-Frame-Options: DENY` (CSP `frame-ancestors` can't be set via `<meta>`) | None |
| Private assets | Everything outside the allowlist is gated. Images are never public. Gated responses are `private`. Gated responses are never cached (`private, no-store`; hashed assets `private`). | JS and CSS are public by extension, which is why the rule about private content in §7.2 exists |
| bfcache or back-button exposure after sign-out | §6.5 | None practical |
| Logging leaks | Log only outcome codes and user names. Never tokens, cookies, assertion bodies or IPs beyond what Workers Observability already records. | — |

### 9.2 Impact if something is compromised

| Compromised | Impact |
| :-- | :-- |
| KV read access | Public keys (not secret), token *hashes* (can't be turned into cookies), names, UA strings. Nothing usable to sign in. |
| KV write access (implies the Cloudflare account) | An attacker could insert a credential or session. Equivalent to owning the account. Protect the API token. |
| `AUTH_COOKIE_SECRET` | Forged challenge cookies, which enable replaying a *captured* assertion. Rotate: `openssl rand -base64 32 \| npx wrangler secret put AUTH_COOKIE_SECRET`. The only side effect is that in-flight sign-ins (≤5 min) fail once. No dual-key support is needed. |
| `CLOUDFLARE_API_TOKEN` | Full control. Unchanged from today. |

### 9.3 What's stored and how sensitive it is

- Names: `<user>`, `<user>`.
- Passkey public keys and AAGUIDs: low sensitivity.
- Coarse UA and country per session: low. Used only by `auth:list`.
- Nothing about any page's content. No IP addresses.

---

## 10. Testing

### 10.1 Unit tests (`npm test` → `node --test tests/unit/`; the skill ships the pure-helper suites)

- Node 24 runs `.ts` natively (type stripping). Helpers use only erasable TypeScript and `.ts` import extensions (`allowImportingTsExtensions` is already on).
- Web Crypto is global in Node 24. The helpers deliberately avoid the workerd-only `crypto.subtle.timingSafeEqual`: HMAC checks use `crypto.subtle.verify`, and token lookups are by hash, so there's no comparison.

| Module | Cases |
| :-- | :-- |
| `crypto`, `encoding` | Token length and entropy shape. The SHA-256 known vector. Base64url round-trip. |
| `challenge` | Seal/open round-trip. A tampered payload or signature is rejected. Expired is rejected. A wrong purpose is rejected. |
| `cookies` | Exact `Set-Cookie` strings. Parsing with duplicate names, spaces and other cookies present. |
| `allowlist` | Every allowlisted path is public. `/_astro/x.png`, `.webp`, `.svg` and `.avif` are **gated**. Path traversal and encoded variants (`/_astro/..%2f`, `//og.webp`) are gated. |
| `classify` | `Sec-Fetch-Dest` document or absent → lock. Image, script, empty → 401. |
| `headers` | Every response class carries the security headers. The cache policy table from §7.4. |
| `session` | Cookie `Max-Age` and KV TTL both equal `SESSION_TTL_S`. A stale cookie is cleared. The record and metadata shape. |
| `arrival` | The Worker's rewrite adds `data-arrival` only when the arrival cookie is present, and always expires it. |
| `auth-flow` | With a fake ceremony: cancel → idle (no message), other errors → failure, 401/429/503/network/timeout → failure, 200 → success only after `readyForSuccess`. Taps ignored while `prompting` or `verifying`. Options refetched when stale. `pageshow` with `persisted` resets to idle. |

### 10.2 End-to-end (not shipped by the skill; the upstream suite, kept for reference)

- **Chromium with the CDP virtual authenticator:** `WebAuthn.enable`, then `WebAuthn.addVirtualAuthenticator({ protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true })`.
  1. Seed a local invite (`npm run invite -- <user> --local`). Open `/invite/<token>`, save the passkey, land on `/` with `data-user="<user>"`. Opening the invite again shows the unavailable variant with `410`.
  2. New context with the same authenticator: `/some/deep/path?x=1` shows the lock page at that URL. Unlock lands on that exact URL with `data-arrival="unlock"` on `<html>`. A reload of it has no `data-arrival`.
  3. Sign out: lock page at `/`. Pressing Back never shows private content.
  4. `auth:revoke --credential` (local), then sign-in lands in `failure`. `auth:revoke --session`, then the next navigation shows the lock page.
  5. Rate limit: the 11th options call within 60 s from one IP gets `429`.
  6. No CSP violations in the console on the lock, invite and home pages.
- **Firefox and WebKit** (the gate and arrival mechanics; no WebAuthn there): inject the session and arrival cookies captured from Chromium, then navigate. Expect `data-arrival="unlock"` once, and none on the next load. If WebKit refuses `Secure` cookies on `http://localhost`, WebKit covers only the lock page and allowlist.
- **Gate matrix** (Node `http` requests with explicit `Host`, for both `localhost` and `BACKUP_HOST`): every allowlisted path gives `200` and is public. Every other path gives the lock page or `401` by `Sec-Fetch-Dest`. The backup host gives `301` to the apex for every path. The security headers and `X-Robots-Tag` are present on every response, including redirects, 401s and JSON.
- **Build guard:** after `npm run build`, assert the generated Worker config still has a `main` (a regression test for F5) and the output contains the lock page at `lock/index.html`.

### 10.3 Before merge and after deploy

- `npm run check`, `npm test` and `npm run verify` are all clean.
- After deploy:
  - `verify_site.py --gated https://<apex>` passes.
  - `curl -sI https://<backup-host>/x` → `301` to `https://<apex>/x`.
  - `curl -s https://<apex>/anything` → the lock page with `X-Robots-Tag`.
  - Paste the URL into iMessage or Slack and the preview still shows `og.webp`.
  - `wrangler tail` shows CPU time well under the free plan's 10 ms on sign-in (F13).

---

## 11. Rollout

1. **Prep (laptop):** do §8.2. Nothing is live yet. Existing visitors see no change.
2. **Branch:** push `feat/private-sign-in`. The Worker Preview build shows the lock screen on the preview URL (useful for visual review). Unlocking there is impossible by design.
3. **Merge to `main`.** Workers Builds deploys. Wait for the production (`main`) check run, not the first green run (the first green run may be the branch preview). From then on, **everyone without a session sees the lock page** at every URL, link previews keep working.
4. **Enrol:** `npm run invite -- <user>`, then register. Repeat per person, sending each link over a private channel. Check with `npm run auth:list`.
5. **Rollback:** `npx wrangler rollback` (token auth) or `git revert` and push. Rolling back to a pre-gate version makes the site public again. That's safe only while no private content exists. **Once private content ships, never roll back past the gate**: fix forward, or roll back to a gated version.

---


## 13. Verified facts (researched 2026-09-28)

| # | Fact | Source |
| :-- | :-- | :-- |
| F1 | The Workers Rate Limiting binding is GA (2025-09-19) and available on Workers Free. Config: `ratelimits[{ name, namespace_id, simple: { limit, period } }]`, where `period` must be **10 or 60** s. API: `await env.X.limit({ key })` → `{ success }`. Counters are per Cloudflare location and "permissive, eventually consistent… not an accurate accounting system". Docs discourage IP keys for authenticated traffic. **No change to the assumption** (the free-plan availability comes from the GA changelog and community reports; the binding page itself doesn't mention plans). | developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ · developers.cloudflare.com/changelog/post/2025-09-19-ratelimit-workers-ga/ · github.com/sunwjy/furea/issues/16 |
| F2 | `_headers` rules **are** applied to responses served through `env.ASSETS.fetch()`: the asset-worker's `handleRequest` ends with `attachCustomHeaders(...)`. They are **not** applied to responses the Worker creates itself. So the Worker must set headers on its own redirects, 401s, JSON and HTMLRewriter output, and it sets them on everything to be safe. | developers.cloudflare.com/workers/static-assets/headers/ ("not applied to responses generated by your Worker code") · github.com/cloudflare/workers-sdk/blob/main/packages/workers-shared/asset-worker/src/handler.ts |
| F3 | `run_worker_first: true` runs the Worker before every asset request (a boolean, or up to 100 route patterns with `!` negation). Invoking the Worker makes those requests billable against Workers Free's **100,000/day** (only requests that don't invoke the Worker are free). That's fine for two people. | developers.cloudflare.com/workers/static-assets/binding/ · developers.cloudflare.com/workers/platform/limits/ · developers.cloudflare.com/workers/platform/pricing/ |
| F4 | Astro middleware runs at **build time** for prerendered pages, and at request time only for on-demand routes. So the gate must be in the Worker entry. In adapter v13+ the custom entry is set with `main` in `wrangler.jsonc` and calls `handle(request, env, ctx)` from `@astrojs/cloudflare/handler`. Headers in `_headers` aren't applied to Worker-generated responses. | docs.astro.build/en/guides/middleware/ · docs.astro.build/en/guides/integrations-guide/cloudflare/#changed-custom-entrypoint-api |
| F5 | **Changed an assumption.** In the installed adapter (14.3.3), `assetsOnly: () => _buildOutput === "static"`. When no route is on-demand, the Cloudflare Vite plugin writes the output config with `main: void 0`, making the deployment assets-only, so a custom `main` would be silently dropped. At least one `prerender = false` route is required (here, `/auth/*` and `/invite/[token]`). Today's build output (`dist/client/wrangler.json`) indeed has no `main`. | `node_modules/@astrojs/cloudflare/dist/index.js:186` · `node_modules/@cloudflare/vite-plugin/dist/index.mjs:~80037` |
| F6 | workerd has Web Crypto (`getRandomValues`, SHA-256 `digest`, HMAC `sign`/`verify`, Ed25519, ECDSA, RSASSA) and the non-standard `crypto.subtle.timingSafeEqual`. With `compatibility_date` ≥ 2026-08-04, `nodejs_compat` is on by default (ours is 2026-09-27). The design avoids `timingSafeEqual` so the helpers stay testable in Node. PBKDF2 isn't needed (no passwords). | developers.cloudflare.com/workers/best-practices/workers-best-practices/ · developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/ |
| F7 | **Changed an assumption.** SimpleWebAuthn is at **v14** (server 14.0.3, 2026-09-25; browser 14.0.0), not v13. It supports "Cloudflare Workers, Bun, etc." and uses `globalThis.crypto` (no Node imports in the server package). v14 adds post-quantum ML-DSA and, when it detects runtime support, prefers ML-DSA-44 in `generateRegistrationOptions`. Hence the pinned `supportedAlgorithmIDs`. The default `authenticatorSelection` is `{ residentKey: 'preferred', userVerification: 'preferred' }` (we set both to `required`). `verifyRegistrationResponse` and `verifyAuthenticationResponse` default `requireUserVerification: true`. `startAuthentication({ optionsJSON, useBrowserAutofill? })`. Errors come as `WebAuthnError` with `.code` (e.g. `ERROR_CEREMONY_ABORTED`) and `.cause`. | npm registry (`npm view`) · github.com/MasterKale/SimpleWebAuthn CHANGELOG · Context7 `/masterkale/simplewebauthn` (`_autodocs/api-reference/*.md`) · local inspection of `@simplewebauthn/server@14.0.3` |
| F8 | Counters: SimpleWebAuthn throws when the response counter is ≤ the stored one and either is non-zero. The docs note that some authenticators "always return 0", especially multi-device credentials, where cloning can't be detected. Keep storing `newCounter`. | simplewebauthn.dev/docs/packages/server · Context7 authentication.md |
| F9 | **Changed an assumption**, and led to the single-path decision in §6.3. Cross-document view transitions (`@view-transition { navigation: auto; }`): Chrome/Edge 126+, Safari 18.2+ (iOS mirrors). **Firefox: not supported** (`version_added: false`, bug 1860854; current stable is about 156, dev edition 157). `PageRevealEvent`: Chrome 123+, Safari 18.2+, Firefox no. Same-document view transitions are in Firefox 144+. So the fallback can use `document.startViewTransition` there, and must not depend on `pagereveal`. | github.com/mdn/browser-compat-data (`css/at-rules/view-transition.json`, `api/PageRevealEvent.json`) · caniuse.com/cross-document-view-transitions · product-details.mozilla.org/1.0/firefox_versions.json |
| F10 | Which navigations trigger it (normative, CSS View Transitions 2 `navigation` descriptor): same-origin, no cross-origin redirects, and `NavigationType` traverse, or push/replace "with user navigation involvement not equal to 'browser UI'". Reloads are excluded. **Checked locally in Chrome 153:** after a click, a 1.5 s delay and a `fetch`, `location.replace(sameURL)`, `location.assign(sameURL)` (which becomes `replace`) and `location.replace(otherURL)` all produced `pagereveal.viewTransition` ≠ null with `navigationType: replace`. `location.reload()` produced none. So script-initiated navigation after async work does fire it (some blog posts claim otherwise). There's also a 4 s navigation-to-render timeout, after which the transition is skipped. | drafts.csswg.org/css-view-transitions-2/#view-transition-navigation-descriptor · local Playwright test (scratchpad) · css-tricks.com/cross-document-view-transitions-part-1/ |
| F11 | **Changed an assumption.** Worker Previews "do not inherit production settings". `vars` and storage bindings (KV) must be redefined in a `previews` block, which is required but may be empty. Preview secrets are set with `npx wrangler preview base-config secret put NAME`. Preview URLs are public by default. Without this block the gated Worker would crash or fail open on previews, so the design adds the block and fails closed. | developers.cloudflare.com/workers/previews/ · developers.cloudflare.com/workers/previews/configuration/ |
| F12 | When `secrets.required` is set, `wrangler dev` and the Vite plugin load **only** the listed keys from `.dev.vars`, and deploy fails if they're missing. This conflicts with local `RP_ID`/`ORIGIN` overrides, so it isn't used (§8.2). | developers.cloudflare.com/workers/wrangler/configuration/#secrets-configuration-property |
| F13 | Workers Free: 10 ms CPU per invocation, 100,000 requests/day, 128 MB memory, 1 s startup. KV free tier: 100,000 reads, 1,000 writes, 1,000 deletes and 1,000 lists per day (reset 00:00 UTC), 1 GB storage. | developers.cloudflare.com/workers/platform/limits/ · developers.cloudflare.com/workers/platform/pricing/ |
| F14 | KV consistency: writes are immediately visible in the same location and take up to 60 s (or the `cacheTtl`, minimum now 30 s) elsewhere. Negative lookups are cached too. `expirationTtl` must be ≥ 60 s. Concurrent writes are last-write-wins, with at most one write per second per key. That's acceptable here: sessions are created and first read in the same location, revocation within 60 s is fine for two people, and challenges were kept out of KV for this reason. | developers.cloudflare.com/kv/api/write-key-value-pairs/ · developers.cloudflare.com/kv/api/read-key-value-pairs/ · developers.cloudflare.com/changelog/post/2026-01-30-kv-reduced-minimum-cachettl/ |
| F15 | Wrangler 4.141: `wrangler kv key put <key> [value] --binding --ttl --metadata --local\|--remote` (local is the default, so the scripts pass `--remote`). | `npx wrangler kv key put --help` (local) |
| F16 | The current build's CSP `<meta>` already has `script-src 'self' 'sha256-…'`. Astro-processed script modules are hashed automatically. (Astro also offers `Astro.csp.insertScriptHash()`, not needed after the §6.3 decision.) | `dist/client/index.html` · docs.astro.build/en/reference/api-reference/#cspinsertscripthash |

