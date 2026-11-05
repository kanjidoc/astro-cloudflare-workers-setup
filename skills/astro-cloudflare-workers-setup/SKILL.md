---
name: astro-cloudflare-workers-setup
description: Builds a static Astro site and ships it on Cloudflare Workers, from an empty folder to a live, auto-deploying site — scaffold, first deploy, custom domain, GitHub-connected Workers Builds, SEO, security headers, accessibility, analytics, and maintenance. Use when building a new static site with Astro on Cloudflare Workers (portfolio, blog, business landing, docs, coming-soon page), when resuming or productionizing such a site, or when the user says "set up Astro + Cloudflare", "new Astro site on Cloudflare Workers", "static site with Astro", "deploy Astro to Cloudflare", or names both technologies even casually.
---

# Astro Static Site → Cloudflare Workers

Skill directory: `${CLAUDE_SKILL_DIR}` — every `scripts/`, `references/`, `assets/` path (and `<skill-dir>` in reference files) is relative to it.

The by-the-book path for **any static Astro site on Cloudflare Workers** — portfolio, blog, business landing, docs, event or stealth/coming-soon page. Follow the steps in order.

> Verified baseline and sources: see *Versions & sources*. Scaffolding uses `@latest`, so installs are always current — see *Staying current*.

**Platform:** this skill's commands target **macOS and Linux**. On Windows, run it inside **WSL2** (a plain Windows shell will fail on `mkdir -p`, `rm -rf`, `~`, `file`, etc.).

## Start here — before anything else

When this skill is invoked, **Claude opens by orienting the user** — in the chat, in plain language — before running any command:

1. **What this builds:** "I'll build you a real website with Astro and put it online with Cloudflare — fast, served worldwide, and free to host. Once it's set up, whenever you publish a change (I'll handle the `git push`), it goes live on its own within a couple of minutes. You can connect your own domain name too." (Save the jargon — "edge", "CI/CD", "SSR" — for if the user asks.)
2. **Four phases get you to a live site (A–D), then there's optional ongoing maintenance.** The user can stop between phases and resume later.
3. **The user will do a few things personally.** Claude runs every command and edits every file, but can't click in a browser — so at a handful of points (possibly a login, the Cloudflare dashboard, optionally buying a domain) **Claude will stop, say exactly what to click, and wait**. Say this up front so the first hand-off isn't a surprise.
4. **What it needs:** a GitHub account and a Cloudflare account (both free); a custom domain is optional and costs money (≈ $10/yr).
5. **Progress is tracked:** Claude keeps a visible checklist (the session's task list, else a short numbered list in chat), one item per step, showing what's done and what's left.

### The two roles

- **🤖 Claude** runs all commands, edits all files, and verifies.
- **👤 The user** does browser/dashboard/decision steps — marked **👤 USER ACTION**.

**Hand-off protocol** — at every 👤 USER ACTION: (1) state in plain language exactly what to do; (2) ask the user to reply when finished (reporting what they saw, if it matters); (3) wait — never proceed or guess; (4) on resume, verify it worked — a CLI check where one exists, else a specific on-screen result the user confirms — before continuing.

**Keep the user informed:** announce each phase in one sentence before it starts and confirm it in one line when it ends. **Placeholders** like `<repo-name>` are for Claude to fill with real values — never write a literal `<placeholder>` into a file. **For an experienced user** (several answers at once, or "just go"), batch the remaining *Confirm Inputs* questions into one message.

## Staying current

Setup scaffolds with `@latest`; the config shapes below match the *Verified baseline* (Versions & sources). **Step 4 checks the installed Astro/adapter/wrangler majors against it** — if one moved, verify the affected steps against current docs and tell the user what changed. For current behavior: Astro → the `astro-docs` MCP (`search_astro_docs`) first, then Context7; Cloudflare → the `cloudflare-docs` MCP, or fetch any page as Markdown at `https://developers.cloudflare.com/<path>/index.md` (use `/workers/llms.txt` only to find pages).

## When to use

A greenfield static site, or resuming/productionizing one whose foundation exists. **Don't use for:** an existing non-Astro site, a Cloudflare *Pages* project (this targets *Workers*), or a server-rendered-by-default app.

## Phases

| Phase | Goal |
|---|---|
| **A — Foundation** (Steps 1–9) | Project folder → `npm run verify` clean (type check, build, `wrangler deploy --dry-run`). |
| **B — First Deploy** (Step 10) | Live on `*.workers.dev`. Needs a Cloudflare login unless wrangler is already authenticated. |
| **C — Productionization** (Steps 11–16) | Custom domain, GitHub auto-deploy, content, SEO, fonts, headers, accessibility, analytics. |
| **D — Project setup for Claude Code** (Step 17) | `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `ROADMAP.md`. |
| **✅ Completion** | Final verification + handoff summary. **The skill ends here.** |
| **E — Maintenance** (Step 18) | Dependency updates, compatibility bumps, monitoring — ongoing, after completion. |

**Resuming mid-flow** — if the folder already has files from an earlier session, read `references/resume.md`: one evidence command, then an ordered rule list that names the step to pick up at. Don't redo prior steps; tell the user where you're resuming and get a one-word confirm.

---

## Step 0 — Create the project folder

**👤 USER ACTION — confirm the project folder location.** Tell the user: "I'll create a folder for your site at `~/Projects/<repo-name>` — is that okay?" It's a yes/no; only ask for an alternative if they want one. Then Claude creates it and works there:

```bash
mkdir -p ~/Projects/<repo-name>
cd ~/Projects/<repo-name>
```

Confirm the folder is empty (`ls -A`). If the skill was invoked from inside an empty, correctly-named folder, skip the `mkdir`. All later commands run here. If the Bash result says `Shell cwd was reset to …`, 👤 ask the user to run `/cd ~/Projects/<repo-name>` and reply (restarting `claude` there also works, but then they re-invoke the skill); confirm with `pwd`. Either way, the project's `.claude/settings.json` and `.mcp.json` (Step 8) load only in a session started in, or `/cd`'d to, this folder. **Write nothing into it before Step 2** (see Step 2).

## Preflight — verify the environment

Tell the user "first I'll check your machine has the right tools," then run:

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/preflight.py"
```

It checks Node 22.23.4+ (26 LTS recommended), git, the GitHub CLI (`gh`) and its auth, `curl`, `python3`, and `dig`, and prints exact remediation for any failure. **Accounts:** preflight confirms `gh` is signed in (a GitHub account is **required**: the repo *and* the Cloudflare auto-deploy connect through it); a Cloudflare account is required and is verified at Step 10.

If anything fails, Claude must **not** silently auto-fix it. **On a brand-new machine several failures are normal** — a one-time setup that makes every later project fast. Guide the user:

- **macOS:** install Homebrew (one command from brew.sh), then `brew install node git gh`.
- **Linux:** install via the package manager — Node 22.23.4+, ideally 26 LTS (`nvm install 26` if the distro ships an older one); install `gh` per cli.github.com.
- Then `gh auth login` — an interactive browser/device-code flow; walk the user through each prompt.

Re-run `preflight.py` after remediation and loop until it exits 0. If `python3` isn't found, try `python`.

**Recommended:** add the docs MCP servers so Claude can check current behavior — `claude mcp add --transport http cloudflare-docs https://docs.mcp.cloudflare.com/mcp` and `claude mcp add --transport http astro-docs https://mcp.docs.astro.build/mcp` (no auth; Step 8 also adds both to the project's `.mcp.json`). Cloudflare's Claude Code plugin is optional (it also adds the account MCP server `mcp.cloudflare.com/mcp`, OAuth on first use): `/plugin marketplace add cloudflare/skills`, then `/plugin install cloudflare@cloudflare`. An already-connected Cloudflare account MCP may be used read-only for dashboard read-backs (zone status, Builds settings, a failed build's log, conflicting DNS records); it's never required, so never ask users to install it during setup.

## Confirm inputs

Gather these before any irreversible command (batch them for an experienced user):

1. **Repo name and site name** — the repo defaults to the folder name; the display name (page titles, social card) defaults to a title-cased repo name.
2. **Visibility** — public or private. Never assume.
3. **One-line description** — also the tagline on the social card.
4. **Site purpose & type** — portfolio, blog, business/professional landing, documentation, event/coming-soon, project page? Drives the JSON-LD schema, the brand mark, and the **content model** (Step 13 — a blog or docs site uses Astro Content Collections; a one-pager uses typed data modules).
5. **Primary language** — defaults to English; sets `<html lang>` and `og:locale`.
6. **Domain** — a custom domain (optional, costs money — Step 11), or just the free `*.workers.dev` URL? Record the full hostname (e.g. `example.dev`); never assume `.com`.
7. **Brand mark** — an existing logo, or should Claude propose a simple one (Step 2)?
8. **Landing-page content** — gathered in detail at Step 13; don't invent copy.
9. **⚠️ Anonymity posture — this is a fork.** A normal indexable site (default), **or** a stealth/coming-soon page that must not be discovered yet? Stealth changes Steps 1, 2, 4, 11 and 13–14 — if chosen, **read `references/anonymity-variant.md` now, before Step 1** (private repo, vague description). Flag it clearly to the user and announce that the variant is active.

The answers are written to `.claude/setup-inputs.json` right after Step 2 — not before.

---

# Phase A — Foundation

Tell the user: "Phase A — I'll scaffold the project and get it building locally; this part is all me, watch the checklist." Goal: the folder becomes a site that type-checks, builds, and passes `wrangler deploy --dry-run`.

### Step 1 — GitHub repo + `git init`

`gh repo create --source .` needs the directory to already be a git repo. Combined:

```bash
git init -b main && \
gh repo create <repo-name> --private \
  --description "<description>" --source . --remote origin
```

Use `--public` if chosen. The remote is **empty** (no README/license) — correct; don't `git pull`. Verify with `git remote -v`. Don't push yet — the first commit comes in Step 10. (If the name is already taken or the token lacks `repo` scope, see `references/pitfalls.md`.)

### Step 2 — Scaffold Astro, brand mark, images

```bash
npm create astro@latest . -- --template minimal --install --no-git --no-ai --skip-houston --yes
```

**The folder must hold nothing but `.git/` when this runs** — otherwise create-astro silently scaffolds into a random `./adjective-noun` subfolder. Move any existing `.claude/` (Claude Code can create one) out (`mv .claude ../.claude-hold`) and back afterwards. `--no-ai` stops create-astro writing `AGENTS.md` (create-astro ≥5.3 writes no `CLAUDE.md` symlink; Step 17 writes the real one); the minimal template already extends `astro/tsconfigs/strict`. Confirm `package.json`, `astro.config.mjs`, `src/pages/index.astro` exist. If `npm install` timed out inside the scaffolder, the scaffold still succeeded — re-run `npm install`. A *hanging* command hit an interactive prompt with no terminal — Ctrl-C and re-run with the documented flags.

**Record the inputs** — now that `package.json` exists, Write `.claude/setup-inputs.json` with the Confirm-Inputs answers (real values):

```json
{ "repo": "<repo-name>", "visibility": "private", "description": "<description>", "site_type": "<type>", "site_name": "<site-name>", "lang": "en", "locale": "en_US", "domain": null, "stealth": false, "analytics": "pending", "workers_dev_url": null }
```

`domain` is the full hostname, `"tbd"` if they want a custom domain but haven't picked one, or `null` for workers.dev only; `analytics` is `pending`, `declined` or `on`. Update it with Edit as values become known (Steps 10, 11, 16). It's gitignored (Step 8) and deleted at *Completion*.

**Replace the default Astro mark** in `public/favicon.svg` with a **simple, project-relevant mark** — a monogram of the initials or a minimal geometric/iconographic shape. **Not an emoji, not the Astro logo.** If the purpose suggests no obvious mark, **👤 ask the user** (a described concept, their initials, or a logo file — by its full path). Claude proposes a concrete mark; the user approves or redirects. Then generate every raster image from it in one call, from the project root:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/gen-images.mjs" "<Site Name>" "<one-line description>"
```

It writes `public/favicon.ico` (16/32/48/64), `public/apple-touch-icon.png` (180×180) and `public/og.webp` (1200×630 neutral text card; text is escaped, long names wrap and shrink). Add `--no-og` for a stealth site or when the user supplies their own `og.webp`. It uses the site's own `sharp`: exit 2 "sharp not found" → `npm i -D sharp` and re-run; exit 2 "still the Astro logo" → replace the mark first. Verify: `file public/favicon.ico` reports `4 icons`.

### Step 3 — Install the Cloudflare adapter

```bash
npx astro add cloudflare --yes
```

This installs `@astrojs/cloudflare` and `wrangler` (in `dependencies`, a required peer of the adapter), adds the adapter to `astro.config.mjs`, adds a `generate-types` script, includes `worker-configuration.d.ts` in `tsconfig.json`, and **generates a root `wrangler.jsonc`**. **Keep it** — optional to the build, but home to `name` (must match the dashboard Worker for Workers Builds), `compatibility_date` and `not_found_handling`. The adapter stays even though every page is static: it gives workerd-based `astro dev`/`astro preview`, a build-time immutable-caching rule for `/_astro/*` (skipped when `public/_headers` already sets one, as Step 8's file does), and a one-line `prerender = false` opt-in later. `worker-configuration.d.ts` doesn't exist yet — Step 6 makes it.

### Step 4 — Dependencies + `astro.config.mjs`

**Version-drift check:**

```bash
npm ls astro @astrojs/cloudflare wrangler --depth=0
```

Expect `astro@7` (≥7.4), `@astrojs/cloudflare@14` (≥14.4), `wrangler@4` (≥4.135) — the *Verified baseline*. Adapter 14.4+ declares `astro ^7.4.0`, so bump them together. If a **major** is newer, tell the user and offer: (a) pin the verified majors — `npm install astro@7 @astrojs/cloudflare@14 wrangler@4`; or (b) proceed after checking the upgrade guide and changelog against the config below. **If `@astrojs/cloudflare` is 15.x:** it replaces `wrangler.jsonc` with `cloudflare.config.ts` and deploys with the `cf` CLI; this skill's steps assume 14 — pin with `npm install @astrojs/cloudflare@14 wrangler@4` (15 has no wrangler peer, so `astro add` didn't install it; delete any `cloudflare.config.ts` it left) and tell the user adapter 15 needs a migration this skill doesn't do yet (see *Watch: adapter 15 / `cf` migration path* in https://github.com/kanjidoc/astro-cloudflare-workers-setup/blob/main/.claude/CLAUDE.md).

Install the remaining dependencies in one line (stealth: drop `npm i @astrojs/sitemap &&`):

```bash
npm i @astrojs/sitemap && npm i -D @astrojs/check typescript@6 @types/node@26 prettier prettier-plugin-astro
```

`@astrojs/check` + `typescript` let `astro check` run without an interactive prompt; `@types/node` matches `.nvmrc`. `typescript@6` (npm resolves 6.x and writes `^6.x.y`; an unquoted `^` can be a zsh glob): `@astrojs/check` (peer `^5 || ^6`) refuses TypeScript 7, the Go port with no JS API, which a bare `typescript` would install. Then Write the complete `astro.config.mjs` (it replaces what the adapter left):

```js
// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://<repo-name>.workers.dev',
  output: 'static',
  session: false,
  adapter: cloudflare({ imageService: 'compile' }),
  integrations: [sitemap()],
  security: { csp: { directives: ["object-src 'none'", "base-uri 'self'"] } },
  markdown: { syntaxHighlight: false },
});
```

- **`site`** — *required* for absolute URLs (canonical, `og:*`, sitemap). Step 10 replaces it with the workers.dev URL wrangler prints, Step 11 with the custom domain.
- **`output: 'static'`** — prerender every page; opt one into on-demand rendering with `export const prerender = false`.
- **`session: false`** (Astro 7.2+) — no sessions on a static site: no SESSION KV binding, nothing provisioned. Remove it only if an on-demand page uses `Astro.session` (wrangler then auto-provisions the namespace on deploy).
- **`imageService: 'compile'`** — transforms images with sharp at build time and adds no Cloudflare Images (`IMAGES`) binding, so the Worker stays binding-free and builds faster. The default `'cloudflare-binding'` also optimizes prerendered images (Astro's standard pipeline since adapter 14.4) but attaches an `IMAGES` binding.
- **`security.csp`** — Astro hashes bundled scripts and styles into a real CSP (no `'unsafe-inline'`), emitted as a `<meta>` tag for prerendered pages. A meta CSP can't carry `frame-ancestors`, so `X-Frame-Options` stays in `_headers`. CSP is inactive in `astro dev`. Step 16 adds the analytics host.
- **`markdown.syntaxHighlight: false`** — Shiki's inline styles are CSP-incompatible (a build warning). A blog/docs site with code blocks uses `'prism'` plus a Prism theme stylesheet.
- **Stealth:** omit the `sitemap` import and `integrations`.

### Step 5 — Finish `wrangler.jsonc`

Keep the adapter-generated file (tab-indented; the block below is shown with spaces and its comment is for you, not the file); make only three edits: confirm `compatibility_date` is **today** (`YYYY-MM-DD`; `astro add` writes the date of the workerd bundled with the installed `@cloudflare/vite-plugin`, often several days behind), add `"not_found_handling": "404-page"` inside `assets`, and add `"previews": {}` (`wrangler preview`, the Workers Builds preview command, refuses to run without a `previews` block; the adapter's build output carries one today, and this makes it explicit; empty is fine). Result:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "compatibility_date": "<today YYYY-MM-DD>",
  "compatibility_flags": ["global_fetch_strictly_public"],
  "name": "<repo-name>",  // = package.json "name", copied by astro add (create-astro lowercases the folder name); use this exact form for the dashboard Worker (Step 12) and the workers.dev host
  "main": "@astrojs/cloudflare/entrypoints/server",
  "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "404-page" },
  "observability": { "enabled": true },
  "previews": {}
}
```

`global_fetch_strictly_public` makes `fetch()` to the Worker's own zone go through Cloudflare's front door, not straight to the origin (it matters only for on-demand pages). `nodejs_compat`/`nodejs_compat_v2` are default-on for compatibility dates ≥ 2026-08-04 — don't add them. `not_found_handling: "404-page"` serves `404.html` (Step 13) with a real HTTP 404. For an all-static build the adapter writes an assets-only config to `dist/client/wrangler.json` (no `main`, no bindings); `main`/`ASSETS` only take effect once a page sets `prerender = false`, and output then moves to `dist/server/wrangler.json`. Edit only the root file — never `dist/**/wrangler.json` or `.wrangler/deploy/config.json`.

### Step 6 — Generate types

```bash
npm run generate-types
```

`worker-configuration.d.ts` (~600 KB) holds Workers runtime types — **commit it**, and **regenerate after any `compatibility_*` or bindings change** in `wrangler.jsonc`.

### Step 7 — Scripts + version

```bash
npm pkg set scripts.build="astro check && astro build" scripts.check="astro check" scripts.deploy="npm run build && wrangler deploy" scripts.verify="npm run build && wrangler deploy --dry-run" version=0.1.0
```

`build` type-checks first, so a type error fails CI instead of shipping. `verify` is the "deploy-ready?" check for this and every later session. Keep the scaffold's `dev`, `preview`, `astro` and the adapter's `generate-types`. Don't add a `wrangler dev` script — `astro dev` and `astro preview` already run in workerd.

### Step 8 — Project hygiene

Copy the files that are the same for every site, then append the ignore entries:

```bash
cp -R "${CLAUDE_SKILL_DIR}/assets/site/." .
for l in .wrangler/ '.env*' '!.env.example' .claude/settings.local.json .claude/setup-inputs.json; do grep -qxF "$l" .gitignore || echo "$l" >> .gitignore; done
```

**Run the copy once, here** — it overwrites, so on resume it runs only if `.nvmrc` is absent. The ignore loop is idempotent. The copy adds:

- **`.nvmrc`** — `26` (Workers Builds installs that major; its default is 24). Keep the scaffold's `engines` as written.
- **`.editorconfig`** and **`.prettierrc`** (Prettier + `prettier-plugin-astro`, installed at Step 4; `singleQuote` matches the code this skill writes).
- **`src/styles/global.css`** — the universal reset only (Step 13).
- **`public/_headers`** — security headers and immutable `/_astro/*` caching (Step 14).
- **`.github/dependabot.yml`** — weekly updates, grouped (Astro + Cloudflare packages together, dev tooling together), with `typescript` majors ignored (see Step 4).
- **`.mcp.json`** — the Cloudflare and Astro docs MCP servers (no auth).
- **`.claude/settings.json`** — scoped allows for routine commands (`npm run *`, `npx astro *`, the dry-run, `git add/commit/push`, docs fetches); a real `wrangler deploy` still asks. Broad personal allows belong in the gitignored `.claude/settings.local.json`.

The scaffold's `.gitignore` covers only `.env` and `.env.production` — hence `.env*` (keeping `.env.example` committable); it already ships `.vscode/`. Do **not** ignore `worker-configuration.d.ts`. **Commit `package-lock.json`** — Workers Builds and reproducible installs need it.

> Everything worth backing up *is* committed; ignored entries are build artifacts, restorable `node_modules`, secrets and per-machine settings. Keep secrets out of git even in a private repo (Cloudflare's secret store and a password manager); if env vars are used, commit a `.env.example` (keys only).

### Step 9 — Verify the foundation

```bash
rm -rf dist .wrangler && npm run verify   # no auth needed
```

Expect `0 errors` (astro check), `[build] Complete!`, then from the dry-run: `Using redirected Wrangler configuration` / `Configuration being used: "dist/client/wrangler.json"`, `Read N files from the assets directory …/dist/client`, and `No bindings found.` No Worker script, so no `env.ASSETS`. If `env.SESSION` or `env.IMAGES` appears, `session: false` or `imageService: 'compile'` is missing.

Offer a first look: `npm run dev` (under Claude Code, Astro backgrounds it and prints the URL, usually `http://localhost:4321` — give the user that). When they're done, run `npx astro dev stop` (`npx astro dev status` / `logs` for debugging; `ASTRO_DEV_BACKGROUND=0` opts out, `ASTRO_PREVIEW_BACKGROUND=0` for `npm run preview`; `pkill` does not stop it). Then tell them: "Phase A done — the site builds and runs locally, ready to deploy." See `references/pitfalls.md` for any error.

---

# Phase B — First Deploy

Tell the user: "Phase B — first deploy. You may need to log in to Cloudflare in your browser."

### Step 10 — Cloudflare login + first deploy

**Check for existing auth first:**

```bash
npx wrangler whoami --json >/dev/null 2>&1 && echo authed
```

If it prints `authed` (an OAuth session, or `CLOUDFLARE_API_TOKEN`, which takes priority), run `npx wrangler whoami`, confirm the account name with the user, and **skip login** — never run `wrangler login` while `CLOUDFLARE_API_TOKEN` is set. If it fails, check stderr: a network error is not "not logged in".

**👤 USER ACTION — Cloudflare account, then browser login** (only if not authed). Ask whether the user has a Cloudflare account; if not, they create one now (free) at dash.cloudflare.com — wait for them. Then Claude runs `npx wrangler login` in the background or with a timeout of 10+ minutes (it waits for the browser); the user clicks **Allow** and replies. If the browser can't reach the localhost callback (SSH, container, remote machine), use `npx wrangler login --device` and relay the URL and code at once — the code expires after 5 minutes. Re-run the whoami check.

Deploy:

Running it may raise a permission prompt (the site's `.claude/settings.json` asks for real deploys); tell the user to expect it.

```bash
npm run deploy
```

Wrangler prints the live `https://<repo-name>.<account-subdomain>.workers.dev` URL. Record it as `workers_dev_url` in `.claude/setup-inputs.json` and set `site` in `astro.config.mjs` to it (one-line Edit; it goes live with the next deploy). Check it's up (a brand-new workers.dev subdomain can take a minute or two to resolve — retry before diagnosing):

```bash
curl -sI https://<workers.dev host>
```

Expect `HTTP/2 200` and `server: cloudflare` (a `404` — `curl -s` shows the body `error code: 1042` — means no Worker exists under that name yet: the deploy didn't happen). The full `verify_site.py` run comes at *Completion* — most of its checks depend on Steps 13–16. Then commit and push:

```bash
git add -A && git commit -m "Initial Astro + Cloudflare Workers setup" && git push -u origin main
```

**This is the milestone — make it land.** Tell the user, with genuine enthusiasm: "🎉 Your website is live on the internet — open it now: <URL>. That's a real, public, HTTPS site, served worldwide from Cloudflare's edge." Invite them to click and share it. It's a clean pause point.

---

# Phase C — Productionization

Tell the user: "Phase C — making it production-grade: domain, auto-deploy, content, SEO, accessibility." **Step 11 must be done before Step 12.**

### Step 11 — Custom domain

Optional — the site already works on `*.workers.dev`. A custom domain must become an **active zone in the user's Cloudflare account**; `<domain>` is always the full hostname they chose (e.g. `example.dev`). Three cases:

**Case 1 — no domain yet → buy one on Cloudflare Registrar.** 👤 USER ACTION. Claude first **confirms the exact name in writing** (a typo is bought and paid for) and states it costs ≈ $10/yr, **auto-renews**, and needs a card. Easiest: `Workers & Pages → <worker> → Domains` → purchase (registers and attaches at once); else `Domain Registration → Register domains` → Search → Purchase. It needs a verified account email; afterwards verify the ICANN registrant email, or the domain is parked. It's an active zone at once, with Cloudflare DNS — no nameserver change, no 100117 conflict.

**Case 2 — domain owned elsewhere → bring it to Cloudflare.** 👤 USER ACTION: `Domains → Onboard a domain`, then point the registrar's nameservers at Cloudflare's. Optional transfer once the zone is **Active**: `Transfer domains` with the auth/EPP code (up to 10 days; domain ≥60 days old, not moved in the last 60).

**Case 3 — already a Cloudflare zone → proceed.**

If the user drops the custom domain, set `domain` to `null` in `.claude/setup-inputs.json` and skip to Step 12.

Once the domain is an active zone: record the hostname as `domain` in `.claude/setup-inputs.json` (replacing `"tbd"`), **update `site`** in `astro.config.mjs` to `https://<domain>` (and `jsonLd.url` in `src/data/site.ts` if it exists yet — it repeats `site`), and attach the apex in `wrangler.jsonc`:

```jsonc
"workers_dev": true,
"routes": [{ "pattern": "<domain>", "custom_domain": true }]
```

`workers_dev: true` keeps the `*.workers.dev` fallback alive; noindex it so it doesn't compete with the real domain — append to `public/_headers` (the real host from Step 10):

```
https://<repo-name>.<account-subdomain>.workers.dev/*
  X-Robots-Tag: noindex
```

Before deploying, 👤 ask the user to confirm `<domain>` isn't attached to another Worker (`Workers & Pages` → each other Worker → `Domains`). Under Claude (no TTY), wrangler auto-confirms its custom-domain override prompts and would move it silently. Then `npm run deploy`.

**Pitfall — error 100117 "externally managed DNS records":** if the hostname already has user-created A/AAAA/CNAME records the deploy fails. **👤 USER ACTION:** in `Domains → <zone> → DNS → Records`, delete the conflicting `A`/`AAAA` on the apex and any `CNAME` on `www` — leave `MX`/`TXT` alone — then Claude redeploys. (`override_existing_dns_record` is an API flag wrangler sets itself, not a config key, and only overrides Worker-owned records — workers-sdk#9878, closed.)

**www → apex — 👤 USER ACTION (recommended; one canonical host).** `<zone> → DNS → Records → Add record`: type `A`, name `www`, IPv4 `192.0.2.0`, **Proxied**. Then `Rules → Overview → Create rule → Redirect Rule` → template **Redirect from WWW to Root** (301).

Verify (pass `@1.1.1.1` — a bare `dig` caches a stale empty answer): `dig @1.1.1.1 +short <domain> A`, `curl -sI https://<domain>` (200, `server: cloudflare`), and `curl -sI https://www.<domain>` (301 to the apex). If `dig` is absent, `curl` covers reachability. Commit and push: `git add -A && git commit -m "Add custom domain" && git push`.

**Credentials:** Workers Builds (Step 12) auto-creates its own scoped user API token in the dashboard — deleting it breaks auto-deploy. No secrets live in the repo or GitHub. Email (MX records) is out of scope — if asked, point the user to their registrar.

### Step 12 — GitHub-connected auto-deploy (Cloudflare Workers Builds)

Once connected, every push to `main` auto-deploys; PRs and other branches get a Preview (URL posted as a PR comment). Workers Builds, not GitHub Actions: first-party previews, no GitHub secrets.

The Worker's name in the dashboard must equal `name` in `wrangler.jsonc`. If it doesn't, the build fails and Workers Builds opens a "name conflict" pull request — merge it or fix `name`; don't close it unread.

**👤 USER ACTION — connect the repo in the dashboard.** Relay these as a step-by-step checklist and have the user confirm each:

1. `dash.cloudflare.com → Workers & Pages → <worker-name> → Settings → Builds` (some docs say `Build`) `→ Connect`.
2. Authorize the **Cloudflare Workers and Pages** GitHub App. When it asks repository access, choose **Only select repositories** and pick this repo.
3. Set these build fields (each on its own line — a run-on list gets mis-entered):
   - **Production branch** (the form may label it *Git branch*): `main`
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Preview command:** leave the default `npx wrangler preview`
   - **Branch control → Enable Preview Builds:** checked
   - (No Node field — the build reads `.nvmrc` from Step 8.)
4. Save, then under `Settings → Builds → Build cache` confirm it shows enabled (new connections default to on); if not, Enable.
5. **Success looks like:** the Builds section shows the connected repo and branch. Ask the user to confirm they see that.

Previews need wrangler ≥4.135 (Step 3 installs newer); `wrangler preview` needs a `previews` block (Step 5; add `"previews": {}` to `wrangler.jsonc` if a resumed site lacks it). workers.dev previews get `X-Robots-Tag: noindex` automatically; custom-domain previews don't. A "Set up Worker Previews" banner on an older Worker is a one-way switch.

**Trigger and verify the first build** — no dashboard trip needed:

```bash
git commit --allow-empty -m "ci: trigger first build" && git push
gh api "repos/{owner}/{repo}/commits/$(git rev-parse HEAD)/check-runs?per_page=100" --jq '.check_runs[]|select(.name|startswith("Workers Builds"))|"\(.status) \(.conclusion) \(.details_url)"'
```

Re-run the `gh api` line every ~30 s (Monitor or a background until-loop; Monitor's default 5-minute deadline needs re-arming or extending). Empty output = still building; the check run usually appears only when the build finishes. `completed success` means connected and deployed. `failure` → give the user the `details_url` and go to Step 18.E (`references/maintenance.md`). Nothing after ~10 minutes → 👤 ask the user to check `Workers & Pages → <worker> → Deployments`. Auto-deploy is the headline feature — don't leave Step 12 until a build has succeeded.

### Step 13 — Content, styling & SEO

**👤 USER ACTION — ask what the landing page should say.** Get the actual copy from the user — headline, intro, any sections or links. **Don't invent the site's text.** If they want a placeholder, ask what it should say.

**Content architecture — adding content stays a one-file edit:**
- **Reusable UI → `src/components/`** — Astro's standard; build pages from small components.
- **Content model — by site shape:** *a one-pager or a few unique pages* (this skill's default) → keep copy/links in **typed `.ts` modules under `src/data/`** (`as const`); Astro advises *against* Content Collections for just a few pages. *A blog, docs, or any collection of like content* → **Astro Content Collections** (`src/content.config.ts`, `defineCollection` from `astro:content`, a `glob()` loader from `astro/loaders`, Zod schemas with `z` from `astro/zod`; query with `getCollection()`; render via `src/pages/blog/[...slug].astro`). RSS: `npm install @astrojs/rss` plus `src/pages/rss.xml.js` returning `rss({ title, description, site: context.site, items })`, and `<link rel="alternate" type="application/rss+xml" href="/rss.xml">` in the head. Astro 7 renders Markdown with Sätteri; remark/rehype plugins need `@astrojs/markdown-remark` and `markdown: { processor: unified() }`.

**`src/styles/global.css`** (copied at Step 8) holds only a universal reset (`box-sizing`, responsive images): a wired-up home for site-wide styles with **no visual decisions baked in** — no colors, fonts, type scale or layout to undo. The page is structurally complete, semantic and accessible on browser defaults.

**Hand off the design.** A user who sees their live site unstyled may think something broke: tell them it's *by design, not broken* (nothing to fight later), and give the on-ramp: *"When you want it styled, ask me — describe the look, or say 'design my site' — and I'll build it on this structure."* (Claude can use the `frontend-design` skill.)

**`src/layouts/Layout.astro`** — imports `global.css`, sets `<html lang>`, and carries the head metadata:

```astro
---
import '../styles/global.css';
import { jsonLd } from '../data/site';
interface Props { title: string; description?: string; noindex?: boolean; }
const { title, description, noindex } = Astro.props;
const canonical = new URL(Astro.url.pathname, Astro.site);
const ogImage = new URL('/og.webp', Astro.site).href;
---
<!doctype html>
<html lang="<lang>">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="generator" content={Astro.generator} />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="sitemap" href="/sitemap-index.xml" />
    {noindex ? <meta name="robots" content="noindex" /> : <link rel="canonical" href={canonical} />}
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="<site-name>" />
    <meta property="og:locale" content="<locale>" />
    {!noindex && <meta property="og:url" content={canonical} />}
    <meta property="og:title" content={title} />
    {description && <meta property="og:description" content={description} />}
    <meta property="og:image" content={ogImage} />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content={title} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    {description && <meta name="twitter:description" content={description} />}
    <meta name="twitter:image" content={ogImage} />
    <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
  </head>
  <body><slot /></body>
</html>
```

Set `lang` and `og:locale` to the project's actual language (Confirm Inputs Q5).

**`src/data/site.ts`** — the page copy as typed `as const` exports (name, headline, intro, sections, links), plus `jsonLd`: pick the schema.org `@type` for the site (`Person`, `Organization`, `LocalBusiness`, `WebSite`, `Physician`, …), with `url` equal to `site`. The user edits copy here, never in page markup.

**`src/pages/index.astro`** — the landing page: renders the copy from `src/data/site.ts`, wrapped in `Layout`, semantic HTML (`<main>`, a single `<h1>`, headings, paragraphs, links). Structurally clean; no CSS. Astro 7 strips whitespace between elements on separate lines (`compressHTML: 'jsx'`) — keep inline text and links on one line or insert `{" "}`, and read the built `dist/client/index.html` to confirm words don't run together.

**`src/pages/404.astro`** — uses `<Layout title="Page not found" noindex>`, an `<h1>` and a home link; builds to `dist/client/404.html`. `noindex` drops the canonical/`og:url` (the page is also reachable at `/404` with status 200, so it must not claim a canonical URL).

**Sitemap** — already configured (Step 4); it emits `sitemap-index.xml`. **`public/robots.txt`**:

```
User-agent: *
Allow: /
Sitemap: https://<canonical-domain>/sitemap-index.xml
```

(`<canonical-domain>` is the workers.dev host if there's no custom domain.)

Optional (custom domain only): to opt out of AI training, 👤 `<zone> → Security → Settings` (filter **Bot traffic**) `→ AI Crawler and Agent access policies`: Training = Disallow + **Enable Bot Preference Sync** (or the Managed robots.txt toggle in `AI Crawl Control → Quick Actions`). Cloudflare then prepends a managed block to the live `robots.txt` — expected; the verifier tolerates it.

**Images** — `og.webp`, `apple-touch-icon.png` and `favicon.ico` came from Step 2; re-run `gen-images.mjs` only if the site name or tagline changed. For a photo or logo card, replace `public/og.webp` with a 1200×630 image and pass `--no-og` on any re-run. **`public/.well-known/security.txt`** (optional) — `Contact:` + `Expires:`.

**Step 13 completion check** — confirm `public/og.webp` (not for stealth), `public/apple-touch-icon.png`, `public/favicon.svg`, `public/favicon.ico`, `src/pages/404.astro`, `src/styles/global.css`, `src/data/site.ts` exist. Then the placeholder-leak check — **passing = no output** (grep then exits 1, or 2 before Step 17 creates `CLAUDE.md`; neither is an error):

```bash
grep -rInE '\{\{|<(repo-name|domain|canonical-domain|lang|locale|site-name|Site Name|tagline|token|description|worker-name|account-subdomain|workers\.dev host|today YYYY-MM-DD|skill-dir|placeholder|github-repo-URL|name / purpose / type|Cloudflare Registrar / external)>' src public astro.config.mjs wrangler.jsonc CLAUDE.md README.md 2>/dev/null
```

Then the **local check** — the same sequence ends Steps 13, 14 and 16. It formats what Claude wrote first, so the user's editor never reformats it later:

```bash
npx prettier --write src astro.config.mjs --log-level warn
npm run build && npm run preview
python3 "${CLAUDE_SKILL_DIR}/scripts/verify_site.py" http://localhost:4321 --local
npx astro preview stop
```

Use the URL the preview prints. Expect 0 FAIL; SKIPs are checks that need the live host; a "Hashed asset … nothing to verify" WARN is normal on a page with no bundled JS, `<Image>` or fonts; the analytics WARN clears at Step 16 (it stays if analytics is declined). **Stealth:** add `--stealth` here and in Steps 14/16 — never remove the noindex layers to clear a standard-mode FAIL. Commit the step's work: `git add -A && git commit -m "Add landing page, layout, SEO metadata and robots.txt"` (Step 17 pushes it).

For a **stealth** site, this step changes — `references/anonymity-variant.md`.

### Step 14 — Performance: fonts, CSP, headers

**Fonts** — a styling decision, so the site ships browser-default fonts. When one is added, use **Astro's built-in Fonts API**, *not* `@fontsource`: declare it in `astro.config.mjs` under `fonts: [{ provider: fontProviders.google(), name: '<font>', cssVariable: '--font-x', weights: [...], subsets: ['latin'] }]` (import `fontProviders` from `astro/config`), render `<Font cssVariable="--font-x" preload />` from `astro:assets` in `Layout.astro`'s head, and use `var(--font-x)` in their CSS. It self-hosts at build time with automatic fallback metrics. Note the pattern in the project `CLAUDE.md`.

**CSP** — configured at Step 4 (`security.csp`); nothing to add until Step 16.

**`public/_headers`** (copied at Step 8) — HSTS `max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and immutable caching for `/_astro/*` (the adapter skips its identical rule because this file sets one). HSTS `preload` is opt-in only — hstspreload.org calls it "not recommended" and removal takes months. Drop `includeSubDomains` if any subdomain is HTTP-only.

**Verify locally** — run the local check (Step 13) and confirm `dist/client/_headers` exists.

**Images** — with `imageService: 'compile'` use `<Image>` from `astro:assets` freely; `loading="eager" fetchpriority="high"` for the LCP image, `lazy` below the fold.

### Step 15 — Accessibility (WCAG 2.2 AA)

Structure is done at setup; visual accessibility is guidance for when the user styles. (Browser defaults already pass contrast and focus checks; the risk starts with styling.)

- **Structure — do now:** `<footer>` is a **sibling** of `<main>`, never nested inside it; `<nav aria-label="…">` around any icon nav; `aria-label` on every icon-only `<a>`; semantic HTML over `<div>`; never `loading="lazy"` the LCP image.
- **Visual — guidance for when the user styles:** text contrast ≥ 4.5:1; if a custom focus style replaces the browser default, keep `:focus-visible` rings clearly visible; interactive targets ≥ 24×24 CSS px (SC 2.5.8); a sticky header/footer must not cover the focused element (SC 2.4.11 — `scroll-padding-top` equal to the header height); help/contact links in the same place on every page (SC 3.2.6).

### Step 16 — Cloudflare Web Analytics

**👤 USER ACTION:** `dash.cloudflare.com → Web Analytics → Add a site` — pick the proxied hostname, or type the workers.dev one. If automatic setup shows enabled, switch to **Enable with JS Snippet installation** under Manage site — our own snippet works on workers.dev, stays inside the CSP, and isn't loaded twice. Ask the user to **paste the whole snippet to Claude**; Claude extracts the token and sets `analytics` in `.claude/setup-inputs.json` (`declined` if skipped). Claude adds the beacon to `Layout.astro` `<head>`, PROD-gated:

```astro
{import.meta.env.PROD && (
  <script defer src="https://static.cloudflareinsights.com/beacon.min.js"
    data-cf-beacon={`{"token": "<token>"}`} />
)}
```

Then allow the beacon host in the CSP — add `scriptDirective` inside the Step 4 `security.csp` (the block as Prettier formats it):

```js
  security: {
    csp: {
      directives: ["object-src 'none'", "base-uri 'self'"],
      scriptDirective: {
        resources: ["'self'", 'https://static.cloudflareinsights.com'],
      },
    },
  },
```

`'self'` is required because `resources` replaces the default. Verify with `npm run build && grep -o 'script-src[^;]*' dist/client/index.html` — it must include `https://static.cloudflareinsights.com` — then run the local check (Step 13). The token is public by design; committing it is fine. The beacon posts to `cloudflareinsights.com` — include `https://cloudflareinsights.com` if a `connect-src` or `default-src` is ever added.

---

# Phase D — Project setup for Claude Code

### Step 17 — `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `ROADMAP.md`

Set the repo up so future Claude sessions start productive and project knowledge stays *in the repo*. Tell the user in one line: "these files let me — or any future Claude session — pick this project up instantly; you don't need to read them."

- **`README.md`** — replace the scaffold's placeholder: project name, one-line description, stack, local-dev commands, the deploy model, project layout, a pointer to `CLAUDE.md`. README is for humans; `CLAUDE.md` is for Claude.
- **`CLAUDE.md`** — from `${CLAUDE_SKILL_DIR}/assets/CLAUDE.md.template`, with the project's real values (from `.claude/setup-inputs.json`). No placeholders — drop the template's `> Fill every <placeholder>` line too. **Stealth:** append a "Stealth posture & launch checklist" section from `references/anonymity-variant.md`, writing its image step as "run the setup skill's `gen-images.mjs` without `--no-og`" rather than a `<skill-dir>` path. (Only scaffolds from create-astro <5.3 without `--no-ai` had a `CLAUDE.md → AGENTS.md` symlink; run `[ -L CLAUDE.md ] && rm CLAUDE.md` first.)
- **`CHANGELOG.md`** — Keep-a-Changelog format; start with `[0.1.0]` dated today (`package.json` is already `0.1.0` from Step 7).
- **`ROADMAP.md`** — `Now` / `Next` / `Later` sections; 👤 ask the user what belongs there.
- **Already in place from Step 8** — `.claude/settings.json`, `.mcp.json`, `.github/dependabot.yml`; leave them.
- **Memory & knowledge policy** — the template's `CLAUDE.md` tells future sessions to record decisions in `CLAUDE.md`/`CHANGELOG.md`/`ROADMAP.md`, **not** in personal Claude memory.
- **Public repos:** 👤 ask whether they want a `LICENSE` (no license = all-rights-reserved by default).

Commit and push — Workers Builds deploys everything since Step 12:

```bash
git add -A && git commit -m "docs: add README, project guide, changelog, roadmap" && git push
```

---

# Completion — the skill ends here

The skill is **finished** when every Phase A–D step is done and the live site verifies clean.

1. **Build** — re-run the Step 12 `gh api` check-runs line until it shows `completed success` for `HEAD`.
2. **Verify live** — `python3 "${CLAUDE_SKILL_DIR}/scripts/verify_site.py" https://<canonical-domain>` (or the `*.workers.dev` URL if there's no custom domain); add `--stealth` for the anonymity variant — never remove the noindex layers to clear a standard-mode FAIL. Resolve every `[FAIL]` (the Step 13 WARN notes apply).
3. **Leak check** — the Step 13 `grep` prints nothing.
4. **Clean up** — `rm .claude/setup-inputs.json`; its facts now live in `CLAUDE.md`.
5. **Confirm the checklist** is fully done.
6. **Deliver the Completion Summary** — fill in real values:

> ✅ **Setup is complete — your site is live.**
>
> - **Live site:** https://<canonical-domain> — open it; that's a real, public website. (`*.workers.dev` is a backup URL.) *Stealth — instead: "it's live and reachable, but kept out of search engines until launch."*
> - **Repository:** <github-repo-URL>
> - **Auto-deploy:** every `git push` to `main` rebuilds and publishes within a couple of minutes; PRs and other branches get a Preview (URL posted as a PR comment). You never run a deploy command again.
> - **Edit your content:** open a file in `src/data/` — e.g. to change the headline, edit the text between the quotes in `src/data/site.ts` and save. Preview locally with `npm run dev` (→ localhost:4321), then `git add -A && git commit -m "update" && git push` — live within a couple of minutes. (A blog post: add a file under `src/content/`.)
> - **Design it:** your site is intentionally plain — no styling was baked in, so nothing fights you. Ask me "design my site" or describe the look you want, and I'll style it on this structure. Nothing is broken.
> - **The repo documents itself:** `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `ROADMAP.md`.
> - **Handled — you don't think about these again:** hosting is free on Cloudflare's edge; HTTPS is automatic and renews itself; security headers and a real 404 are set; Dependabot keeps dependencies current via automatic PRs; your whole site is backed up in GitHub (laptop dies → nothing lost); if a build ever fails, the commit shows a red ✗ in GitHub and the previous version stays live.
> - **Verified:** `verify_site.py` confirmed HTTPS + Cloudflare, security headers, CSP, SEO/OG/JSON-LD, sitemap, the custom 404, and — if Web Analytics is on — that its beacon is present and allowed by the CSP. *Stealth — instead: HTTPS + Cloudflare, security headers, CSP, the `noindex` meta + `X-Robots-Tag`, a crawlable `robots.txt`, and the custom 404.*

Then **stop** — the skill's job is done. Tell the user the Maintenance section is reference for later and needs nothing now.

---

# Phase E — Maintenance (ongoing — after the skill is complete)

Not part of setup — run only when the user asks. **Step 18** (compatibility-date bumps, dependency updates, new content, dynamic pages, Workers Builds debugging, monitoring, docs upkeep) lives in `references/maintenance.md`; read it then.

---

## Verification

`python3 "${CLAUDE_SKILL_DIR}/scripts/verify_site.py" <url> [--stealth] [--gated] [--local]` checks HTTPS + Cloudflare, security headers, immutable asset caching, OG/Twitter/canonical/JSON-LD, CSP (meta tag or header), that `og:image` resolves, sitemap, `robots.txt`, no leftover `noindex`, a real HTML 404, the analytics beacon and that the CSP allows it, and favicons. `--stealth` for the anonymity variant; `--gated` for a private site made with the `astro-cloudflare-passkey-login` skill (implies `--stealth`); `--local` for a `localhost` preview (skips the checks that need the live host). Fix every `[FAIL]`; `[WARN]` is advisory.

## Troubleshooting

For any error or unexpected symptom, consult **`references/pitfalls.md`** — a symptom → root-cause → fix table.

## Anonymity-first variant

For a site that must not be discovered yet, follow **`references/anonymity-variant.md`** — defense-in-depth `noindex`, no sitemap/JSON-LD/OG, a launch checklist, and the limits of stealth (a custom domain's TLS certificate is publicly logged within minutes).

## Making a site private

Not part of setup. Once the site is live on its custom domain, the sibling skill **`astro-cloudflare-passkey-login`** adds passkey-only sign-in (a Worker gate, KV sessions, invite links). Don't improvise auth inside this skill; hand off to it.

## Versions & sources

**Verified baseline** (2026-11-05) — the single source for version claims in this skill:

| Package / runtime | Verified | Floor the skill needs |
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
| Python (scripts) | 3.9.6 | 3.9 |
| Claude Code | 2.1.318 | — |

On conflict prefer, in order: Astro adapter docs → Cloudflare Workers Static Assets docs → Cloudflare Workers Builds docs (how to query them: *Staying current*). Cloudflare's Astro framework guide (as of its 2026-10-12 revision) still shows the pre-v13 `dist/_worker.js` layout for on-demand rendering; trust the Astro adapter docs over it.
