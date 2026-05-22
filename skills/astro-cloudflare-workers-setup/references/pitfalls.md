# Pitfalls — symptom → root cause → fix

Consult this when a command errors or the site misbehaves. Grouped by phase.

## Phase A — Foundation

| Symptom | Root cause | Fix |
|---|---|---|
| `gh repo create` errors "not a git repository" | ran before `git init` | run `git init -b main` first — Step 1 combines them into one command |
| Scaffold files land in a stray adjective-noun folder | an older `create-astro` refused to scaffold into a directory containing `.git/` | rare on current versions (they scaffold in place); if it happens, move the folder's contents — including dotfiles — into the project root and delete the empty folder |
| Build error mentioning a Cloudflare Images binding | `imageService` left at the adapter default `cloudflare-binding` | set `imageService: 'compile'` in `astro.config.mjs` (Step 4) |
| `<Image>` works in `astro dev` but 404s in production | `passthrough` / `cloudflare-binding` emit runtime `/_image?` URLs a static deploy can't serve | use `imageService: 'compile'` — transforms are baked into hashed files at build time |
| TS errors: cannot find `worker-configuration.d.ts` | `tsconfig.json` includes it but it was never generated | run `npm run generate-types` |
| TS errors on Node globals after generating types | `nodejs_compat` flag present without `@types/node` | `npm install --save-dev @types/node` |
| `npm install` "Timeout" inside `npm create astro` | the scaffolder's nested install hit a default timeout | the scaffold itself succeeded — re-run `npm install` standalone |
| `npm run check` reports errors | real type errors, or a stale `worker-configuration.d.ts` after a `wrangler.jsonc` change | fix the types; if `wrangler.jsonc` changed, run `npm run generate-types` first |
| Every page renders on-demand instead of prerendering | `output` defaults to `'server'` when an adapter is present | set `output: 'static'` explicitly |
| Default Astro favicon still shows in the browser tab | only `favicon.svg` was replaced — browsers also auto-request `/favicon.ico` | replace both files; generate a real `.ico` with the Step 2 script |
| `gh repo create` errors "Name already exists on this account" | the repo name is already taken under the user's account | pick a different name, or 👤 confirm with the user whether to use the existing repo |
| `gh repo create` fails with a 403 / scope error | the `gh` token lacks the `repo` scope | 👤 user runs `gh auth refresh -s repo` (or `gh auth login` again), then retry |
| A command hangs with no output and never returns | it hit an interactive prompt with no terminal attached (`npx`, a scaffolder question) | Ctrl-C; re-run with the documented non-interactive flags (`--yes`); a hang always means a swallowed prompt |
| `import sharp` fails (`ERR_MODULE_NOT_FOUND`) in the favicon/OG script | `sharp` is not resolvable — it is only *usually* a transitive Astro dependency | `npm install --save-dev sharp`, then re-run the script from the project root |

## Phase B — First Deploy

| Symptom | Root cause | Fix |
|---|---|---|
| First deploy stalls on a "Would you like Wrangler to add it?" KV prompt | the `SESSION` binding has no namespace ID | pre-provision: `wrangler kv namespace create SESSION`, then add the `kv_namespaces` block to root `wrangler.jsonc` (Step 10) |
| `wrangler login` never completes | the browser OAuth click was not performed | this is a 👤 user action — the user must click **Allow** in the browser; Claude cannot do it |

## Phase C — Productionization

| Symptom | Root cause | Fix |
|---|---|---|
| An unknown URL returns HTTP 200 instead of 404 | `assets.not_found_handling` is not set | add `"not_found_handling": "404-page"` to the `assets` block in `wrangler.jsonc` (Step 5) and ensure `src/pages/404.astro` exists |
| `wrangler deploy` fails `code: 100117` "externally managed DNS records" | the hostname already has user-created A/AAAA/CNAME records | 👤 user deletes the conflicting records in the Cloudflare DNS dashboard, then redeploy. `override_existing_dns_record` does **not** fix the generic case ([workers-sdk#9878](https://github.com/cloudflare/workers-sdk/issues/9878), closed 2026-05 — it only ever applied to Worker-owned records) |
| `*.workers.dev` URL stops working after attaching a custom domain | adding `routes` auto-disables it | set `"workers_dev": true` in `wrangler.jsonc` |
| Site live globally but `DNS_PROBE_FINISHED_NXDOMAIN` on your own network | a local DNS forwarder (router, AdGuard Home, Pi-hole) cached the empty pre-attach answer — NODATA, RFC 2308, TTL up to ~30 min | always query with `dig @1.1.1.1 …` (never a bare `dig`) during setup; if already cached, flush the forwarder's cache, use Chrome Secure DNS (DoH), or wait it out |
| `og:image` / canonical render as relative paths | `site` is missing from `astro.config.mjs` | set `site: 'https://<domain>'` — it makes `Astro.site` (and absolute URLs) resolve |
| CSP `<meta>` tag absent from the page | CSP is inactive in `astro dev`, or `security.csp` is not enabled | enable `security: { csp: true }`; test with `npm run build && npm run preview`, not `astro dev` |
| Web Analytics dashboard shows 0 visits | the "Enable" auto-inject mode is Pages-only — it never lands on a Worker | use "Enable with JS Snippet installation" and add the beacon to `Layout.astro`, PROD-gated |
| Hashed `/_astro/*` assets refetched on every navigation | Cloudflare's conservative default `Cache-Control: max-age=0` | add the `/_astro/*` `immutable` rule to `public/_headers` |
| Link previews stuck on a stale OG image | the OG image lived in `src/assets/` — its content-hashed URL changes every build | keep `og.webp` in `public/` for a stable URL |
| A GitHub Actions workflow was added alongside Workers Builds | reflexive reach for `.github/workflows/deploy.yml` | delete it — Workers Builds is the CI/CD path (first-party preview URLs, no token to rotate) |
| `og:image` / canonical / sitemap URLs point at `*.workers.dev`, not the custom domain | `site` in `astro.config.mjs` was never updated after attaching the domain | set `site` to the custom domain, rebuild, redeploy (Step 11) — `verify_site.py` will otherwise report phantom OG/canonical failures |
| All security headers missing on the live site | `public/_headers` did not reach `dist/client/` | confirm `dist/client/_headers` exists after `npm run build`; `public/_headers` must be present and is copied at build time |
| First GitHub-connected build never deploys | Workers Builds dashboard config wrong (build command, Node version) or build cache off | `dash.cloudflare.com → Workers & Pages → <worker> → Deployments` → open the failed build log; re-check the Step 12 settings |

## Accessibility

| Symptom | Root cause | Fix |
|---|---|---|
| Footer is not announced as the `contentinfo` landmark | `<footer>` is nested inside `<main>` (becomes a sectioning footer) | make `<main>` and `<footer>` siblings inside a non-sectioning wrapper |
| Keyboard focus is invisible on buttons/links | `text-decoration: none` or `border-radius` hides/clips the default ring | add `:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }` |
| Footer/muted text fails the contrast check | the muted color is too light (e.g. `rgba(0,0,0,0.52)` = 4.07:1) | use a token with ≥ 4.5:1 (e.g. `rgba(0,0,0,0.58)` = 4.74:1) |
| Slow Largest Contentful Paint | the hero image is `loading="lazy"` | use `loading="eager" fetchpriority="high"` for the above-the-fold image |
