# Pitfalls — symptom → root cause → fix

`<skill-dir>` is this skill's directory; `<setup-skill-dir>` is `<skill-dir>/../astro-cloudflare-workers-setup`.

## Build and config

| Symptom | Root cause | Fix |
|---|---|---|
| `npm run verify` prints `No bindings found.` and `dist/client/wrangler.json`; live site is NOT gated | Every route is prerendered, so the adapter wrote an assets-only config and **silently dropped `main`** | Keep at least one `prerender = false` route (`src/pages/auth/session.ts`); `tests/build-guard.test.ts` in `npm run build` catches this — never remove it |
| Build guard: "wrangler.jsonc main has drifted from the custom entry" | `main` was reset to `@astrojs/cloudflare/entrypoints/server` (a re-run of `astro add cloudflare`, or a merge) | set `"main": "./src/worker.ts"` again |
| Preview URL: `/auth/*` returns 503, or the Worker throws about `AUTH_KV` | Worker Previews inherit **no** bindings or vars | the `previews` block in `wrangler.jsonc` needs `vars`, its own `kv_namespaces` id and `ratelimits`; `npx wrangler preview base-config secret put AUTH_COOKIE_SECRET` |
| Wrangler rejects `ratelimits` inside `previews` | schema drift | drop `ratelimits` from `previews` only; the code treats a missing limiter as "no limit" and logs once |
| `wrangler deploy` fails: KV namespace id missing | `kv_namespaces[].id` is optional for build/preview/dry-run but required for a real deploy | Step 8: `wrangler kv namespace create` and paste both ids |
| `wrangler kv namespace create` rewrote `wrangler.jsonc` | newer wrangler offers to add the binding to the config it finds | run it from a directory without a `wrangler.jsonc` (`cd "$(mktemp -d)"`), copy the id by hand |
| `Astro.locals.runtime.env` throws | removed in adapter 14 | `import { env } from 'cloudflare:workers'` (the shipped code already does) |
| TypeScript: `AUTH_KV` / `RateLimit` unknown | types not regenerated after the `wrangler.jsonc` edit | `npm run generate-types` |
| `node --test` fails with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` | Node's strip-only TS rejects enums, namespaces, parameter properties | keep helpers to erasable TypeScript; on Node < 22.18 upgrade (`.nvmrc` says 24) |
| `.dev.vars` ignored / `RP_ID` not overridden locally | `secrets.required` set in `wrangler.jsonc` | remove it; the Worker fails closed on its own |
| Wrangler warns `No environment found in configuration with name "e2e"` | leftover `CLOUDFLARE_ENV` from another project's scripts | harmless; unset it |

## Sign-in behaviour

| Symptom | Root cause | Fix |
|---|---|---|
| Registration prompts for an ML-DSA / post-quantum key, or verification fails on algorithm | SimpleWebAuthn v14 prefers ML-DSA when it detects runtime support | `supportedAlgorithmIDs: [-8, -7, -257]` on both generate and verify (shipped default) |
| Sign-in on `*.workers.dev` fails every time | passkeys are bound to the RP ID (the apex) | expected: the backup host 301s to the apex; previews only ever show the lock page |
| Sign-in fails with the counter error | authenticator reported a counter ≤ the stored one while either is non-zero | a cloned or reset authenticator; revoke the credential (`npm run auth:revoke -- --credential <id8>`) and re-invite |
| Invite link says "already used" before the person opened it | someone consumed it, or it expired | `npm run auth:list`; revoke unexpected credentials; mint a new invite. GET never consumes an invite, so chat unfurls are harmless |
| `_headers` rules don't show on 401s, redirects or JSON | `_headers` never applies to Worker-generated responses | the Worker sets them (`src/lib/gate/headers.ts`); `verify_site.py --gated` checks the 401 |
| A private image loads for a signed-out user from the browser cache | old cache entry | sign-out sends `Clear-Site-Data: "cache"`; gated responses are `private, no-store` / `private, max-age…`; hard refresh once |
| Open redirect on the backup host | building the redirect with `new URL(pathname + search, ORIGIN)` treats `//evil` as a host | set `pathname`/`search` on `new URL(ORIGIN)` (`src/lib/gate/redirect.ts`, shipped) |
| Invite URLs appear in logs | the token is in the path | never log full URLs; the shipped code logs outcome codes and names only |

## Ops scripts

| Symptom | Root cause | Fix |
|---|---|---|
| `npm run invite` writes to local KV, `auth:list` shows nothing on the live site | wrangler `kv` commands default to **local** | the scripts pass `--remote`; use `--local` only against `npm run preview` |
| `npm run invite -- "Tony F"` is refused | names must be lowercase `[a-z0-9-]` (they are KV keys) | use a lowercase name listed in `src/data/auth.ts` |
| `wrangler` opens a browser login | no `$CLOUDFLARE_API_TOKEN` and no saved login | set the token or log in once outside this skill; never `wrangler login` when the token is set |
