## Private site: passkey sign-in

Added with the `astro-cloudflare-passkey-login` skill. Every page needs a passkey session; there are no passwords and no identity provider.

**Architecture.** `wrangler.jsonc` `main` is the custom entry `src/worker.ts`, and `assets.run_worker_first: true` runs it before every request. Order: redirect `BACKUP_HOST` to the apex → public allowlist (`src/lib/gate/allowlist.ts`) → `/auth/*` and `/invite/*` to Astro → session check (KV `AUTH_KV`; the cookie holds a token, KV holds its SHA-256) → lock page in place (200, `no-store`) for documents, 401 for everything else. The Worker sets every security header itself, including `X-Robots-Tag: noindex, nofollow`; `public/_headers` still applies to asset responses, but the Worker is authoritative (`src/lib/gate/headers.ts`): a header change belongs in both places, or the Worker re-imposes its defaults.

**Rules that keep the gate working.**
- **At least one route must stay on-demand** (`src/pages/auth/session.ts` is one). An all-prerendered build silently drops `main`. `npm run build` runs `tests/build-guard.test.ts`, which fails the build if that happens.
- **Never put private content in JS or CSS.** `/_astro/*.css|js|woff2` are public by extension because the lock page needs them. Private content goes in HTML, images, KV or on-demand responses.
- **New pages are private by default.** To make one file public, add its exact path to `PUBLIC_FILES` in the allowlist. Never a directory or wildcard.
- **Reserved routes:** `/lock/`, `/auth/*`, `/invite/*`. A catch-all page must reject those slugs.
- **`npm run verify` now lists bindings** (`AUTH_KV`, `AUTH_RATE_LIMIT`, `ASSETS`, vars) and `Configuration being used: "dist/server/wrangler.json"`. `No bindings found.` would mean the gate is gone.
- **The `previews` block is required.** Worker Previews inherit no bindings or vars; they have their own KV namespace and only ever show the lock page.
- `astro.config.mjs` is unchanged: `output: 'static'`, `session: false`, `imageService: 'compile'` and the hashed meta CSP all stay. All client code is Astro-processed `<script>` modules; no inline scripts or `define:vars`.

**Commands.**
| Command | What |
| :-- | :-- |
| `npm test` | Unit tests for the pure auth and gate helpers (`node --test tests/unit/`) |
| `npm run invite -- <name> [--hours <n>]` | Prints a single-use invite URL (default 7 days). Send it over a private channel. |
| `npm run auth:list` | Passkeys, sessions and pending invites |
| `npm run auth:revoke -- --session <id8>` / `--credential <id8>` / `--user <name>` / `--invite <name>` | Revoke one device, one passkey (and its sessions), all of a person's sessions, or their invites |
| `python3 <setup-skill-dir>/scripts/verify_site.py --gated https://<apex>` | Live gate check |

The scripts call `npx wrangler kv key … --binding AUTH_KV --remote` with `$CLOUDFLARE_API_TOKEN` (or the existing wrangler login). `--local` targets the preview's local KV.

**Credentials, by name only.** Worker secret `AUTH_COOKIE_SECRET` on production and in the Previews base config (`npx wrangler preview base-config secret put AUTH_COOKIE_SECRET`). Rotate with `openssl rand -base64 32 | npx wrangler secret put AUTH_COOKIE_SECRET`; in-flight sign-ins (≤5 min) fail once. Local: `.dev.vars` (gitignored) from `.dev.vars.example`. Never `secrets.required` (it blocks the local `RP_ID`/`ORIGIN` overrides); the Worker fails closed instead (503 on `/auth/*`, lock page everywhere).

**Settings** live in `src/lib/auth/config.ts` (session 24 h fixed, invite 7 days, challenge 5 min) and `wrangler.jsonc` (rate limit 10 / 60 s per IP per bucket). Users and copy: `src/data/auth.ts`.

**Rollback.** `npx wrangler rollback` or a revert makes the site public again. Safe only while no private content exists. Once private content ships, roll back only to a gated version.

**Styling the lock page.** `src/pages/lock.astro` and `src/pages/invite/[token].astro` are unstyled on purpose. Keep every `data-*` hook (`data-screen`, `data-part`, `data-auth-action`); style with CSS and use `<html data-auth-state>` (idle, prompting, verifying, success, failure, signing-out), the `auth:state` event, `<html data-arrival="unlock">` (once, on the first page after sign-in) and `<html data-user="<name>">` for your own effects.
