# Pitfalls — symptom → root cause → fix

Consult this when a command errors or the site misbehaves. Grouped by phase. `<skill-dir>` is the skill directory named at the top of SKILL.md.

## Phase A — Foundation

| Symptom | Root cause | Fix |
|---|---|---|
| `gh repo create` errors "not a git repository" | ran before `git init` | run `git init -b main` first — Step 1 combines them into one command |
| Scaffold files land in a stray adjective-noun folder (e.g. `./technological-telescope`) | the folder held an entry `create-astro` doesn't allow before Step 2 — e.g. a `.claude/` folder (`.git/` is fine) | move the folder's contents — including dotfiles — into the project root and delete the empty folder. Prevent it: write nothing into the folder before Step 2 (`.claude/setup-inputs.json` comes *after* the scaffold) |
| A command hangs with no output and never returns | it hit an interactive prompt with no terminal attached (`npx`, a scaffolder question, `npx @astrojs/upgrade` on a major) | Ctrl-C; re-run with the documented non-interactive flags (`--yes`, `--dry-run`); a hang always means a swallowed prompt |
| `npm install` "Timeout" inside `npm create astro` | the scaffolder's nested install hit a default timeout | the scaffold itself succeeded — re-run `npm install` standalone |
| `npm warn EBADENGINE` for `undici` (required `node >=22.19.0`) on every install | Node 22.12–22.18 (Astro's floor is 22.12) | harmless warning; upgrade to Node 24 LTS (or ≥ 22.19) to silence it |
| `npm warn install-scripts … blocked … workerd (postinstall)` (also `fsevents`) | npm 12 runs dependency install scripts only when allowed; the scaffold's `allowScripts` lists only `esbuild` | harmless — build and dry-run still work; optionally `npm install-scripts approve workerd` |
| `gen-images.mjs` exits 2: "sharp not found in this project" | `sharp` is an *optional* dependency of `astro` — absent after `--omit=optional` or on an unsupported platform | `npm i -D sharp`, then re-run `node "<skill-dir>/scripts/gen-images.mjs" …` from the project root |
| `gen-images.mjs` exits 2: mark missing, "still the Astro logo", or "run from the project root" | `public/favicon.svg` not yet replaced with the approved mark, or the command ran outside the project folder | write the approved mark to `public/favicon.svg` first; run from the folder containing `package.json` |
| Default Astro favicon still shows in the browser tab | only `favicon.svg` was replaced — browsers also auto-request `/favicon.ico` | re-run `gen-images.mjs` (it rebuilds `favicon.ico` and `apple-touch-icon.png` from `favicon.svg`); hard-refresh — browsers cache favicons aggressively |
| Dry-run lists `env.IMAGES`, or the build log says "Enabling image processing with Cloudflare Images" | `imageService` left at the adapter default `'cloudflare-binding'` (adds an Images binding) | set `imageService: 'compile'` in `astro.config.mjs` (Step 4), rebuild — build-time transforms, no binding |
| `<Image>` works in `astro dev` but 404s in production | `imageService: 'passthrough'` emits runtime `/_image?` URLs an assets-only Worker can't serve | use `imageService: 'compile'` |
| TS errors: cannot find `worker-configuration.d.ts` | `tsconfig.json` includes it but it was never generated | run `npm run generate-types` |
| `wrangler types` asks for `@types/node`, or TS errors on Node globals | Node compat is on by default for `compatibility_date` ≥ 2026-08-04, so the generated types reference Node regardless of flags | `npm i -D @types/node@24` — match the `.nvmrc` major (Step 4's install line already does) |
| `npm run check` reports errors | real type errors, or a stale `worker-configuration.d.ts` after a `wrangler.jsonc` change | fix the types; if `wrangler.jsonc` changed, run `npm run generate-types` first. `npm run build` runs `astro check` too, so type errors also fail CI |
| Every page renders on-demand instead of prerendering | `output: 'server'` was set, or pages export `prerender = false` (`output` already defaults to `'static'`) | use `output: 'static'` and remove stray `prerender = false` |
| `npm run dev` / `npm run preview` returns immediately, or the server keeps running (Ctrl-C and `pkill` don't stop it) | Astro 7 auto-backgrounds dev/preview when an AI agent runs them | report the URL it prints; `npx astro dev status` / `logs` to debug; stop with `npx astro dev stop` (`npx astro preview stop`). `ASTRO_DEV_BACKGROUND=0` runs it in the foreground |
| `[WARN] [config] Shiki syntax highlighting uses inline styles that are not compatible with Content Security Policy` on every build | Shiki (the default highlighter) is CSP-incompatible, and `security.csp` is on | `markdown: { syntaxHighlight: false }` (Step 4 sets it); a blog/docs site with code blocks uses `'prism'` plus a Prism theme stylesheet |
| Words run together on the page (`<span>hello</span>`⏎`<em>world</em>` → "helloworld") | Astro 7's default `compressHTML: 'jsx'` strips whitespace between elements on separate lines | keep inline text and links on one line, or insert `{" "}`; `compressHTML: true` restores the old behavior. Check the built HTML reads correctly |
| Build fails with a CompilerError on an unclosed tag (unexpected token) | Astro 7's Rust compiler requires every non-void element to be closed | close the tag. It also no longer auto-corrects invalid nesting (a `<div>` inside `<p>`) — fix the markup if a page renders oddly |
| A project file at `src/fetch.ts` (or `.js`) causes unexpected routing errors | Astro 7 reserves `src/fetch.ts` for advanced routing, like `src/middleware.ts` | rename it (e.g. `src/lib/fetcher.ts`) and update imports |
| A remark/rehype plugin is ignored or fails to import | Astro 7 renders Markdown with Sätteri; `@astrojs/markdown-remark` is no longer installed | `npm i @astrojs/markdown-remark`, then `markdown: { processor: unified() }` (import `unified` from it) — or port the plugin to Sätteri |
| `gh repo create` errors "Name already exists on this account" | the repo name is already taken under the user's account | pick a different name, or 👤 confirm with the user whether to use the existing repo |
| `gh repo create` fails with a 403 / scope error | the `gh` token lacks the `repo` scope | 👤 user runs `gh auth refresh -s repo` (or `gh auth login` again), then retry |

## Phase B — First Deploy

| Symptom | Root cause | Fix |
|---|---|---|
| Dry-run or deploy lists an unexpected `env.SESSION` | `session: false` missing from `astro.config.mjs` | add it (Astro ≥ 7.2), rebuild — the dry-run should print `No bindings found.` |
| `wrangler login` never completes | the browser **Allow** click wasn't performed, the command timed out, or the localhost callback can't be reached (remote/headless machine) | 👤 the user clicks **Allow**; run login in the background or with a ≥ 10-minute timeout; if the callback can't be reached, use `npx wrangler login --device` and relay the code promptly (it expires) |
| Deploy goes to an unexpected account, or `wrangler login` seems ignored | `CLOUDFLARE_API_TOKEN` in the environment takes priority over OAuth | run `npx wrangler whoami` first — if already authenticated, confirm the account and skip login |

## Phase C — Productionization

| Symptom | Root cause | Fix |
|---|---|---|
| An unknown URL returns HTTP 200, or a 404 with an empty body | `assets.not_found_handling` is not set | add `"not_found_handling": "404-page"` to the `assets` block in `wrangler.jsonc` (Step 5) and ensure `src/pages/404.astro` exists |
| `wrangler deploy` fails `code: 100117` "externally managed DNS records" | the hostname already has user-created A/AAAA/CNAME records | 👤 user deletes the conflicting records in the Cloudflare DNS dashboard, then redeploy. `override_existing_dns_record` does **not** fix the generic case ([workers-sdk#9878](https://github.com/cloudflare/workers-sdk/issues/9878) — it only ever applied to Worker-owned records) |
| `*.workers.dev` URL stops working after attaching a custom domain | adding `routes` auto-disables it | set `"workers_dev": true` in `wrangler.jsonc` |
| The `*.workers.dev` copy of the site shows up in search results | `workers_dev: true` keeps a second public host alive | add `https://<worker>.<subdomain>.workers.dev/*` with `X-Robots-Tag: noindex` to `public/_headers` (Step 11) |
| Site live globally but `DNS_PROBE_FINISHED_NXDOMAIN` on your own network | a local DNS forwarder (router, AdGuard Home, Pi-hole) cached the empty pre-attach answer — NODATA, RFC 2308, TTL up to ~30 min | always query with `dig @1.1.1.1 …` (never a bare `dig`) during setup; if already cached, flush the forwarder's cache, use Chrome Secure DNS (DoH), or wait it out |
| `og:image` / canonical render as relative paths | `site` is missing from `astro.config.mjs` | set `site: 'https://<domain>'` — it makes `Astro.site` (and absolute URLs) resolve |
| `og:image` / canonical / sitemap URLs point at `*.workers.dev`, not the custom domain | `site` in `astro.config.mjs` was never updated after attaching the domain | set `site` to the custom domain, rebuild, redeploy (Step 11) — `verify_site.py`'s site-host check reports the mismatch |
| CSP `<meta>` tag absent from the page | CSP is inactive in `astro dev`, or `security.csp` is missing from `astro.config.mjs` | keep the Step 4 `security.csp` block; test with `npm run build && npm run preview`, not `astro dev` |
| Web Analytics dashboard shows 0 visits | the beacon is blocked by the CSP, or the snippet is missing | add `https://static.cloudflareinsights.com` to `security.csp.scriptDirective.resources` alongside `'self'` (Step 16); check `grep -o 'script-src[^;]*' dist/client/index.html` |
| The analytics beacon loads twice | automatic setup is on for the proxied hostname *and* the manual snippet is in `Layout.astro` | 👤 Web Analytics → Manage site → **Enable with JS Snippet installation** (turns automatic injection off for that hostname) |
| All security headers missing on the live site | `public/_headers` did not reach `dist/client/` | confirm `dist/client/_headers` exists after `npm run build`; `public/_headers` (copied at Step 8) must be present — it's copied into the build |
| Hashed `/_astro/*` assets refetched on every navigation | the adapter's auto-injected immutable `Cache-Control` is missing (adapter not in use, or overridden) | keep the `/_astro/*` `immutable` rule in `public/_headers` as the fallback (shipped at Step 8) |
| Link previews stuck on a stale OG image | the OG image lived in `src/assets/` — its content-hashed URL changes every build | keep `og.webp` in `public/` for a stable URL |
| A GitHub Actions workflow was added alongside Workers Builds | reflexive reach for `.github/workflows/deploy.yml` | delete it — Workers Builds is the CI/CD path (first-party Previews; it manages its own scoped API token, nothing stored in GitHub) |
| First GitHub-connected build never deploys, or the commit shows a red ✗ | Node version (`NODE_VERSION` build variable or `.nvmrc`), missing `package-lock.json`, Worker name ≠ `wrangler.jsonc` `name`, `wrangler.jsonc` syntax, or a type error (`npm run build` runs `astro check`) | open the check run's `details_url` (Step 12 `gh api` line), or 👤 `Workers & Pages → <worker> → Deployments → View build history` → the failed log; reproduce locally with `npm run verify` |
| Workers Build fails: "name in your Wrangler configuration file … must match" | the dashboard Worker name ≠ `name` in `wrangler.jsonc` | make them equal (Step 12) |
| An unexpected pull request from Cloudflare (Workers Builds) appears | a name mismatch with the dashboard Worker, or `wrangler.jsonc` missing from the repo | review and merge it, or fix `name` / commit `wrangler.jsonc` — don't close it unread |
| A PR or branch gets no Preview URL | Preview Builds is off, or `wrangler` in `package.json` is older than 4.135 | 👤 Settings → Build → Branch control → **Enable Preview Builds**; `npm i -D wrangler@latest` |
| The live `robots.txt` has rules that aren't in `public/robots.txt` | Managed robots.txt / AI Crawl Control prepends Cloudflare's rules | expected when enabled; the verifier tolerates the prepended groups |
| A launched site stays out of search results | a leftover stealth `noindex` meta tag or `X-Robots-Tag` header | remove both layers (`references/anonymity-variant.md` launch checklist); `verify_site.py` without `--stealth` FAILs on a leftover `noindex` |
| `verify_site.py --local` exits 2 | the preview isn't running, or the URL isn't `localhost` (the preview binds only `localhost`/`::1`, so `127.0.0.1` fails) | `npm run build && npm run preview`, then pass `http://localhost:<port>` exactly as printed; stop with `npx astro preview stop` afterwards |

## Accessibility

| Symptom | Root cause | Fix |
|---|---|---|
| Footer is not announced as the `contentinfo` landmark | `<footer>` is nested inside `<main>` (becomes a sectioning footer) | make `<main>` and `<footer>` siblings inside a non-sectioning wrapper |
| Keyboard focus is invisible on buttons/links | `outline: none` / `outline: 0` removed the default ring, or a parent's `overflow: hidden` clips it | add `:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }`; don't clip focusable children |
| Focused element hidden behind a sticky header (WCAG 2.4.11) | the sticky header covers the scroll target | `html { scroll-padding-top: <header height>; }` |
| Small icon links/buttons fail the target-size check (WCAG 2.5.8) | the clickable area is under 24×24 CSS px | pad the link to at least 24×24 px, or space targets 24 px apart |
| Footer/muted text fails the contrast check | the muted color is too light (e.g. `rgba(0,0,0,0.52)` on white ≈ 4.3:1) | use a color with ≥ 4.5:1 (e.g. `rgba(0,0,0,0.58)` on white ≈ 5.3:1) |
| Slow Largest Contentful Paint | the hero image is `loading="lazy"` | use `loading="eager" fetchpriority="high"` for the above-the-fold image |

## Maintenance

| Symptom | Root cause | Fix |
|---|---|---|
| A Dependabot PR for `@astrojs/cloudflare` or `wrangler` fails on peer dependencies | coupled packages bumped separately | the shipped `.github/dependabot.yml` groups `astro`, `@astrojs/*`, `wrangler` and `@cloudflare/*` into one PR — restore the `groups` block if it was removed |
| `npx @astrojs/upgrade` sits waiting | a major upgrade asks for confirmation on a TTY | Ctrl-C; run `npx @astrojs/upgrade --dry-run` first; for a major, install explicitly (`npm install astro@latest @astrojs/cloudflare@latest @astrojs/sitemap@latest`), then `npm run verify` |
