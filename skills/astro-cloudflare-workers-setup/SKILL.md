---
name: astro-cloudflare-workers-setup
description: Use when building a new static site with Astro deployed to Cloudflare Workers — portfolio, blog, business landing, docs, or any greenfield static site — covering project-folder setup, first deploy, custom domain, GitHub-connected auto-deploy CI/CD, SEO, accessibility, and maintenance. Triggers include "set up Astro + Cloudflare", "new Astro site on Cloudflare Workers", "static site with Astro", "deploy Astro to Cloudflare", or any greenfield static-site request naming both technologies even casually.
---

# Astro Static Site → Cloudflare Workers

The canonical, by-the-book path for **any static site built with Astro and deployed to Cloudflare Workers** — portfolio, blog, business landing, docs, event page, or a stealth/coming-soon page. Follow the steps in order.

> **Authored May 2026**, verified against Astro 6.3, `@astrojs/cloudflare` 13.5, `wrangler` 4.93, Node 22. Scaffolding uses `@latest`, so installs are always current — see *Staying current*.

**Platform:** this skill's commands target **macOS and Linux**. On Windows, run it inside **WSL2** (a plain Windows shell will fail on `mkdir -p`, `rm -rf`, `~`, `file`, etc.).

## Start here — before anything else

When this skill is invoked, **Claude opens by orienting the user** — in the chat, in plain language — before running any command:

1. **What this builds:** "I'll build you a real website with Astro and put it online with Cloudflare — fast, served worldwide, and free to host. Once it's set up, every time you save a change it republishes itself in about 30 seconds. You can connect your own domain name too." (Save the jargon — "edge", "CI/CD", "SSR" — for if the user asks.)
2. **Four phases get you to a live site (A–D), then there's optional ongoing maintenance.** The user can stop between phases and resume later.
3. **The user will do a few things personally.** Claude runs every command and edits every file. But Claude cannot click in a browser — so at a handful of points (a login, the Cloudflare dashboard, optionally buying a domain) **Claude will stop, say exactly what to click, and wait for the user**. Tell the user this up front so the first hand-off isn't a surprise.
4. **What it needs:** a GitHub account and a Cloudflare account (both free); a custom domain is optional and costs money (≈ $10/yr).
5. **Progress is tracked:** Claude keeps a checklist (one item per step) so the user can see what's done and what's left.

### The two roles

- **🤖 Claude** runs all commands, edits all files, and verifies.
- **👤 The user** does browser/dashboard/decision steps — marked **👤 USER ACTION**.

**Hand-off protocol** — at every 👤 USER ACTION: (1) Claude states in plain language exactly what to do; (2) Claude explicitly asks the user to reply when finished (and to report what they saw, if it matters); (3) Claude waits — it never proceeds or guesses; (4) on resume Claude verifies the action worked — a CLI check where one exists, otherwise by asking the user to confirm a specific on-screen result — before continuing.

**Keep the user informed:** announce each phase in one sentence before it starts and confirm it in one line when it ends. **Placeholders** like `<repo-name>` are for Claude to fill with real values — never write a literal `<placeholder>` into a file. **For an experienced user** who supplies several answers at once or says "just go," batch the remaining *Confirm Inputs* questions into one message instead of asking serially.

The skill is **finished** when Phases A–D are done and `verify_site.py` passes — see *Completion*. Phase E is ongoing maintenance, not part of the finish line.

## Staying current

Setup commands scaffold with `@latest`, so installed code is current; the config shapes below are canonical as of the authored date. **Step 4 checks the installed Astro/adapter/wrangler majors against what this skill expects** — if a major has moved, verify the affected steps against current docs (via the Cloudflare Documentation MCP and Context7) and tell the user what changed. When a step says "as of writing," treat it as a checkpoint to confirm.

## When to use

A greenfield static site that should be fast, edge-hosted, and auto-deployed from GitHub. Also to resume or productionize a site whose foundation exists. **Don't use for:** an existing non-Astro site, a Cloudflare *Pages* project (this targets *Workers*), or a server-rendered-by-default app.

## Phases

| Phase | Goal |
|---|---|
| **A — Foundation** (Steps 1–9) | Project folder → `npm run build` clean → `wrangler deploy --dry-run` clean. |
| **B — First Deploy** (Step 10) | Live on `*.workers.dev`. Needs the user's `wrangler login`. |
| **C — Productionization** (Steps 11–16) | Custom domain, GitHub auto-deploy, content, SEO, fonts, headers, accessibility, analytics. |
| **D — Project setup for Claude Code** (Step 17) | `README.md`, `CLAUDE.md`, `.claude/`, `.mcp.json`, `CHANGELOG.md`, `ROADMAP.md`. |
| **✅ Completion** | Final verification + handoff summary. **The skill ends here.** |
| **E — Maintenance** (Step 18) | Dependency updates, compatibility bumps, monitoring — ongoing, after completion. |

**Resuming mid-flow** — detect the incomplete step from concrete repo artifacts and resume there; don't redo prior steps. Tell the user what you detected and where you're picking up, and get a one-word confirm. Detection map: no `package.json` → Step 0/1 · `package.json` but no `@astrojs/cloudflare` → Step 3 · no `worker-configuration.d.ts` → Step 6 · no `src/pages/404.astro` → Step 13 · `wrangler.jsonc` has no `kv_namespaces` → Step 10 not done · no `routes` in `wrangler.jsonc` → Step 11 · no `.mcp.json`/`CLAUDE.md` → Phase D.

---

## Step 0 — Create the project folder

**👤 USER ACTION — confirm the project folder location.** Tell the user: "I'll create a folder for your site at `~/Projects/<repo-name>` — is that okay?" It's a yes/no; only ask for an alternative if they want one. Then Claude creates it and works there:

```bash
mkdir -p ~/Projects/<repo-name>
cd ~/Projects/<repo-name>
```

Confirm the folder is empty (`ls -la`). If the skill was invoked from inside an empty, correctly-named folder, skip the `mkdir`. Claude's shell keeps this working directory for the rest of the session — all later commands run here.

## Preflight — verify the environment

Tell the user "first I'll check your machine has the right tools," then run:

```bash
python3 ~/.claude/skills/astro-cloudflare-workers-setup/scripts/preflight.py
```

It checks Node 22+, git, the GitHub CLI (`gh`) and its auth, `curl`, `python3`, and `dig`, and prints exact remediation for any failure. **Accounts it can't check:** a GitHub account is **required** (the repo *and* the Cloudflare auto-deploy connect through it — verified via `gh auth status`); a Cloudflare account is required and is verified later at `wrangler login`.

If anything fails, Claude must **not** silently auto-fix it. **On a brand-new machine, expect several failures — that's normal**, and setting the tools up is a one-time thing; after it, every future project is fast. Guide the user through it:

- **macOS:** install Homebrew (one command from brew.sh), then `brew install node git gh`.
- **Linux:** install via the package manager — Node must be 22+ (use `nvm` if the distro ships an older one); install `gh` per cli.github.com.
- Then `gh auth login` — an interactive browser/device-code flow; walk the user through each prompt.

Re-run `preflight.py` after remediation and loop until it exits 0. If `python3` isn't found, try `python`.

**Recommended:** add Cloudflare's documentation MCP so Claude can verify current Cloudflare behavior — `claude mcp add --transport http cloudflare-docs https://docs.mcp.cloudflare.com/mcp`. Cloudflare also publishes a Claude Code plugin and account-connected MCP servers (Workers Builds, Observability) — see `developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/`. Step 17 also adds the docs MCP to the project.

## Confirm inputs

Gather these before any irreversible command (batch them for an experienced user):

1. **Repo name** — defaults to the folder name.
2. **Visibility** — public or private. Never assume.
3. **One-line description.**
4. **Site purpose & type** — portfolio, blog, business/professional landing, documentation, event/coming-soon, project page? Drives the JSON-LD schema, the OG image, the brand mark, and the **content model** (Step 13 — a blog or docs site uses Astro Content Collections; a one-pager uses typed data modules).
5. **Primary language** — defaults to English; sets `<html lang>` and `og:locale`.
6. **Domain** — a custom domain (optional, costs money — Step 11), or just the free `*.workers.dev` URL?
7. **Brand mark** — an existing logo, or should Claude propose a simple one (Step 2)?
8. **Landing-page content** — gathered in detail at Step 13; don't invent copy.
9. **⚠️ Anonymity posture — this is a fork.** A normal indexable site (default), **or** a stealth/coming-soon page that must not be discovered yet? Stealth rewrites Steps 13–14 (`references/anonymity-variant.md`). Flag it clearly to the user; if they choose stealth, announce that the variant is active.

---

# Phase A — Foundation

Tell the user: "Phase A — I'll scaffold the project and get it building locally; this part is all me, watch the checklist." Goal: the folder becomes a site that builds clean and passes `wrangler deploy --dry-run`.

### Step 1 — GitHub repo + `git init`

`gh repo create --source .` needs the directory to already be a git repo. Combined:

```bash
git init -b main && \
gh repo create <repo-name> --private \
  --description "<description>" --source . --remote origin
```

Use `--public` if chosen. This creates an **empty** remote (no README/license) — correct; don't `git pull`. Verify with `git remote -v`. Don't push yet — the first commit comes in Step 10. (If the name is already taken or the token lacks `repo` scope, see `references/pitfalls.md`.)

### Step 2 — Scaffold Astro

```bash
npm create astro@latest . -- \
  --template minimal --install --no-git \
  --typescript strict --skip-houston --yes
```

Current `create-astro` detects the existing `.git/` and scaffolds in place. Confirm `package.json`, `astro.config.mjs`, `src/pages/index.astro` exist. If `npm install` timed out inside the scaffolder, the scaffold still succeeded — run `npm install` again. If a command ever *hangs*, it hit an interactive prompt with no terminal — Ctrl-C and re-run with the documented flags.

**Replace both default Astro favicons** (`public/favicon.svg` and `public/favicon.ico`). The replacement is a **simple, project-relevant mark** — a monogram of the initials or a minimal geometric/iconographic shape. **Not an emoji, not the Astro logo.** If the project's purpose doesn't suggest an obvious mark, **👤 ask the user** what they'd like (a described concept, their initials, or a logo file — tell them to give you the full path to the file). Claude proposes a concrete mark and the user approves or redirects.

The `.ico` is generated from the SVG with `sharp`. **`sharp` is usually a transitive Astro dependency — verify, don't assume:** run `npm ls sharp`; if absent, `npm install --save-dev sharp`. Then write `scripts/gen-favicon-ico.mjs` and run it **from the project root**:

```js
// scripts/gen-favicon-ico.mjs — run once: `node scripts/gen-favicon-ico.mjs`, then delete
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
const png = await sharp('public/favicon.svg').resize(32, 32).png().toBuffer();
const ICONDIR = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
const ENTRY = Buffer.alloc(16);
ENTRY.writeUInt8(32, 0); ENTRY.writeUInt8(32, 1);          // 32×32
ENTRY.writeUInt16LE(1, 4); ENTRY.writeUInt16LE(32, 6);     // planes, bit depth
ENTRY.writeUInt32LE(png.length, 8); ENTRY.writeUInt32LE(22, 12); // size, offset
writeFileSync('public/favicon.ico', Buffer.concat([ICONDIR, ENTRY, png]));
```

Verify: `file public/favicon.ico` reports `MS Windows icon resource`.

### Step 3 — Install the Cloudflare adapter

```bash
npx astro add cloudflare --yes
```

This installs `@astrojs/cloudflare` and `wrangler`, adds the adapter to `astro.config.mjs`, adds a `generate-types` script, includes `worker-configuration.d.ts` in `tsconfig.json`, and **generates a complete root `wrangler.jsonc`** (with `main`, `assets`, `compatibility_date`, `compatibility_flags`, `observability`). **Keep it** — the current adapter generates these deliberately and the build depends on them. `worker-configuration.d.ts` doesn't exist yet — Step 6 makes it.

### Step 4 — Configure `astro.config.mjs`

**Version-drift check:** run `npm ls astro @astrojs/cloudflare wrangler`. This skill is verified against `astro@6`, `@astrojs/cloudflare@13`, `wrangler@4`. If any has moved a **major** beyond that, the config below and the adapter's generated files may differ — verify against current docs before continuing and tell the user what changed.

Edit `astro.config.mjs` (a near-total rewrite of what the adapter left):

```js
// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://<canonical-domain>',
  output: 'static',
  adapter: cloudflare({ imageService: 'compile' }),
});
```

- **`site`** — *required* for absolute URLs (canonical, `og:*`, sitemap). If the domain isn't decided, use `https://<repo-name>.<account-subdomain>.workers.dev` and **update it in Step 11**.
- **`output: 'static'`** — prerender by default; opt a page into SSR with `export const prerender = false`.
- **`imageService: 'compile'`** — build-time image transforms; the adapter default (`'cloudflare-binding'`) emits runtime `/_image` URLs that 404 on a static deploy.

### Step 5 — Finish `wrangler.jsonc`

Make exactly these edits to the adapter-generated file: add `$schema`; confirm `compatibility_date` is **today** (`YYYY-MM-DD`); add `nodejs_compat` to `compatibility_flags`; add `not_found_handling` inside `assets`.

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "<repo-name>",
  "compatibility_date": "<today YYYY-MM-DD>",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "main": "@astrojs/cloudflare/entrypoints/server",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "404-page"
  },
  "observability": { "enabled": true }
}
```

`nodejs_compat` exposes the Node APIs the adapter's runtime uses; `global_fetch_strictly_public` blocks SSRF; `not_found_handling: "404-page"` serves `dist/client/404.html` (built from `src/pages/404.astro`, Step 13) with a real HTTP 404. You edit only this file — at build time the adapter writes `dist/server/wrangler.json` and `.wrangler/deploy/config.json`; never hand-edit those.

### Step 6 — Generate types

```bash
npm run generate-types
npm install --save-dev @types/node
```

`worker-configuration.d.ts` (~500 KB) holds Workers runtime types — **commit it**, and **regenerate after any `compatibility_*` or bindings change** in `wrangler.jsonc`.

### Step 7 — Scripts + `astro check` dependencies

`astro check` (type-checking) needs two devDependencies the minimal scaffold omits. **Install them now** so it never drops into an interactive prompt:

```bash
npm install --save-dev @astrojs/check typescript
```

Then set `package.json` scripts:

```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "astro": "astro",
  "check": "astro check",
  "deploy": "astro build && wrangler deploy",
  "generate-types": "wrangler types"
}
```

Don't add a `wrangler dev` script for a static site — `astro dev` is the dev server. Always run `astro build` before `wrangler deploy` (the `deploy` script chains them).

### Step 8 — Project hygiene

- **`.gitignore`** — create it if absent, else append: `.wrangler/`, `.env`, `.env.production`, `.claude/settings.local.json`. Do **not** ignore `worker-configuration.d.ts`.
- **`.nvmrc`** — `22`. **`package.json` `engines`** — ensure Node 22+ (the scaffold may already set `">=22.x"`; keep it).
- **`.editorconfig`** — `root = true`; 2-space indent, LF, UTF-8, trim trailing whitespace, final newline.
- **Prettier** — `npm install --save-dev prettier prettier-plugin-astro`, then `.prettierrc`: `{ "plugins": ["prettier-plugin-astro"] }`.
- **`.vscode/`** — `extensions.json` = `{ "recommendations": ["astro-build.astro-vscode"] }`; `launch.json` with a `node-terminal` "Dev server" config running `./node_modules/.bin/astro dev`.
- **Commit `package-lock.json`** — Workers Builds and reproducible installs need it.

> Everything worth backing up *is* committed. The ignored entries are only build artifacts, restorable `node_modules`, secrets, and per-machine settings. Keep secrets out of git even in a private repo (it can be shared, forked, or made public; history is permanent) — their home is Cloudflare's secret store and a password manager. If env vars are ever used, commit a `.env.example` (keys only).

### Step 9 — Verify the foundation

```bash
npm run check                           # expect "0 errors"
rm -rf dist .wrangler && npm run build  # expect "[build] Complete!"
npx wrangler deploy --dry-run           # no auth needed
```

`--dry-run` should report reading from `dist/client` with bindings `env.SESSION` + `env.ASSETS`. Offer the user a first look — `npm run dev` serves the site at `http://localhost:4321` (Ctrl-C to stop), their first sight of it running. Then tell them: "Phase A done — the site builds and runs locally, ready to deploy." See `references/pitfalls.md` for any error.

---

# Phase B — First Deploy

Tell the user: "Phase B — first deploy. I need you to log in to Cloudflare in your browser."

### Step 10 — `wrangler login`, SESSION KV, first deploy

**👤 USER ACTION — Cloudflare account, then browser login.** First ask whether the user has a Cloudflare account; if not, they create one now (free) at dash.cloudflare.com — wait for them. Then Claude runs `npx wrangler login`; it opens the browser; the user clicks **Allow** and replies when the terminal shows `Successfully logged in`.

Pre-provision the session KV namespace and add its ID to `wrangler.jsonc`:

```bash
npx wrangler kv namespace create SESSION
```

Claude adds the returned ID manually:

```jsonc
"kv_namespaces": [{ "binding": "SESSION", "id": "<32-hex-id from the output>" }]
```

Then deploy and verify:

```bash
npm run generate-types
npm run deploy
```

Wrangler prints the live `<repo-name>.<account-subdomain>.workers.dev` URL. Run the verifier against it:

```bash
python3 ~/.claude/skills/astro-cloudflare-workers-setup/scripts/verify_site.py https://<workers.dev URL>
```

Headers, CSP, and the 404 already apply on `*.workers.dev`; SEO/sitemap checks may warn until Phase C — that's expected. Then commit and push:

```bash
git add . && git commit -m "Initial Astro + Cloudflare Workers setup" && git push -u origin main
```

**This is the milestone — make it land.** Tell the user, with genuine enthusiasm: "🎉 Your website is live on the internet — open it now: <URL>. That's a real, public, HTTPS site, served worldwide from Cloudflare's edge." Invite them to click it, refresh it, share it. If they're stopping here, it's a clean pause point.

---

# Phase C — Productionization

Tell the user: "Phase C — making it production-grade: domain, auto-deploy, content, SEO, accessibility." **Step 11 must be done before Step 12.**

### Step 11 — Custom domain

A custom domain is optional — the site already works on `*.workers.dev`. If the user wants one, the domain must become an **active zone in their Cloudflare account**. Three cases:

**Case 1 — no domain yet → buy one on Cloudflare Registrar.** 👤 USER ACTION. First Claude **confirms the exact domain name in writing** (a typo is bought and paid for) and states plainly: it costs ≈ $10/yr, **auto-renews**, and needs a card. Then: `dash.cloudflare.com → Domain Registration → Register Domains` → search → purchase. It becomes an active zone immediately with Cloudflare-managed DNS — the cleanest path (no nameserver changes, no 100117 conflict below).

**Case 2 — domain owned elsewhere → bring it to Cloudflare.** 👤 USER ACTION: transfer it in (`Transfer Domains`, EPP/auth code, up to 5 days) or add it as a zone and point the registrar's nameservers at Cloudflare's.

**Case 3 — already a Cloudflare zone → proceed.**

Once the domain is an active zone: **update `site` in `astro.config.mjs`** to `https://<domain>`, attach the domain in `wrangler.jsonc`, and rebuild:

```jsonc
"workers_dev": true,
"routes": [
  { "pattern": "<domain>.com", "custom_domain": true },
  { "pattern": "www.<domain>.com", "custom_domain": true }
]
```

`workers_dev: true` keeps the `*.workers.dev` fallback alive. Then `npm run generate-types` and `npm run deploy`.

**Pitfall — error 100117 "externally managed DNS records":** if the hostname already has user-created A/AAAA/CNAME records the deploy fails. **👤 USER ACTION:** in `dash.cloudflare.com → Websites → <zone> → DNS → Records`, delete the conflicting `A`/`AAAA` on the apex and any `CNAME` on `www` — leave `MX`/`TXT` alone — then Claude redeploys. (`override_existing_dns_record` does not fix the generic case — workers-sdk#9878.)

Verify (pass `@1.1.1.1` — a bare `dig` caches a stale empty answer): `dig @1.1.1.1 +short <domain>.com A` and `curl -sI https://<domain>.com`. If `dig` is absent, `verify_site.py` (pure-Python) covers reachability.

**Credentials:** every part of this stack authenticates by OAuth (`wrangler login`, the Workers Builds GitHub App, Cloudflare MCP) — there is **no long-lived API token** to store. Email setup (MX records) is out of scope — point the user to their registrar if they ask.

### Step 12 — GitHub-connected auto-deploy (Cloudflare Workers Builds)

This connects the repo to Cloudflare so every push to `main` auto-deploys and other branches get preview URLs. Workers Builds, not GitHub Actions — first-party previews, no token to rotate.

**👤 USER ACTION — connect the repo in the dashboard.** Relay these as a step-by-step checklist and have the user confirm each:

1. `dash.cloudflare.com → Workers & Pages → <worker-name> → Settings → Build → Connect`.
2. Authorize the **Cloudflare Workers and Pages** GitHub App. When it asks repository access, choose **Only select repositories** and pick this repo.
3. Set these build fields (each on its own line — a run-on list gets mis-entered):
   - **Production branch:** `main`
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Non-production deploy command:** `npx wrangler versions upload`
   - **Builds for non-production branches:** enabled
   - **Node version:** `22`
4. Save, and enable **Build cache**.
5. **Success looks like:** the Build tab now shows the connected repo and branch. Ask the user to confirm they see that.

**Trigger and verify the first build.** Claude pushes an empty commit (`git commit --allow-empty -m "ci: trigger first build" && git push`). Then **confirm the build actually succeeded** before moving on — 👤 ask the user to check `Workers & Pages → <worker> → Deployments` shows a successful build, or use the Workers Builds MCP. If it failed, open the build log (Step 18.E). Auto-deploy is the headline feature — don't leave Step 12 until it's confirmed working.

### Step 13 — Content, styling & SEO

**👤 USER ACTION — ask what the landing page should say.** Get the actual copy from the user — headline, intro, any sections or links. **Don't invent the site's text.** If they want a placeholder, ask what it should say.

**Content architecture — so "adding content" stays a one-file edit:**
- **Reusable UI → `src/components/`** — Astro's standard; build pages from small components.
- **Content model — by site shape:** *a one-pager or a few unique pages* (this skill's default) → keep copy/links in **typed `.ts` modules under `src/data/`** (`as const`, with types); Astro's own guidance says *don't* use Content Collections for just a few pages. *A blog, docs, or any collection of like content* → **Astro Content Collections** (`src/content.config.ts`, `defineCollection`, a `glob()` loader, Zod schemas; query with `getCollection()`; render via `src/pages/blog/[...slug].astro`; add RSS with `npx astro add rss`).

**`src/styles/global.css`** — create it with only the universal, non-opinionated reset, and import it in `Layout.astro`. This is the canonical scaffold: a wired-up home for site-wide styles that future work extends, with **no visual decisions baked in** — no colors, fonts, type scale, or layout for the user to discover and undo.

```css
/* src/styles/global.css — site styles. Add your design here. */

*, *::before, *::after {
  box-sizing: border-box;
}

img, picture, svg {
  max-width: 100%;
  height: auto;
}
```

`box-sizing` and responsive images are baseline conventions every site wants and no one reverses; everything beyond that — color, typography, spacing, layout — is the user's to choose. The delivered page is structurally complete, semantic, and accessible on browser defaults.

**Hand off the design — don't leave it as a silent loose end.** The page is intentionally plain, and a user who sees their live site unstyled may think something broke. Tell them clearly that this is *by design, not broken* — nothing visual was baked in, so there's nothing to fight later — and give them the on-ramp: *"When you want it styled, just ask me — describe the look you want, or say 'design my site' — and I'll build the design on this structure."* (Claude can use the `frontend-design` skill for that.) The user should never look at their plain site and wonder what went wrong.

**`src/layouts/Layout.astro`** — `import '../styles/global.css';`, set `<html lang="<language>">`, and include the head metadata:

```astro
---
import '../styles/global.css';
import { jsonLd } from '../data/site';
interface Props { title: string; description?: string; }
const { title, description } = Astro.props;
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
    <link rel="canonical" href={canonical} />
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="<site-name>" />
    <meta property="og:locale" content="<locale>" />
    <meta property="og:url" content={canonical} />
    <meta property="og:title" content={title} />
    {description && <meta property="og:description" content={description} />}
    <meta property="og:image" content={ogImage} />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
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

**`src/pages/index.astro`** — the landing page: the user's copy, wrapped in `Layout`, semantic HTML (`<main>`, a single `<h1>`, headings, paragraphs, links). Structurally clean; no CSS.

**`src/pages/404.astro`** — uses `Layout`, an `<h1>` and a home link; builds to `dist/client/404.html`.

**JSON-LD** — `src/data/site.ts` exports `jsonLd`; pick the schema.org `@type` for the site (`Person`, `Organization`, `LocalBusiness`, `WebSite`, `Physician`, …).

**Sitemap** — `npx astro add sitemap --yes` (auto-emits `sitemap-index.xml`). **`public/robots.txt`** — one line: `Sitemap: https://<canonical-domain>/sitemap-index.xml`.

**OG image** — `public/og.webp`, 1200×630, stable URL. Generate one even with no photo — a text card always works (`sharp` from Step 2):

```js
// scripts/gen-og.mjs — run once, then delete
import sharp from 'sharp';
const name = '<site-name>', tagline = '<one-line description>';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#1a1a1a"/>
  <text x="80" y="320" font-family="sans-serif" font-size="76" fill="#fff" font-weight="700">${name}</text>
  <text x="80" y="400" font-family="sans-serif" font-size="36" fill="#999">${tagline}</text>
</svg>`;
await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile('public/og.webp');
```

If the project has a logo or portrait, composite it onto the card instead. **`public/apple-touch-icon.png`** — 180×180 from the brand mark. **`public/.well-known/security.txt`** (optional) — `Contact:` + `Expires:`.

**Step 13 completion check** — confirm `public/og.webp`, `public/apple-touch-icon.png`, `public/favicon.svg`, `public/favicon.ico`, `src/pages/404.astro`, `src/styles/global.css`, `src/data/site.ts` all exist, then `npm run build` clean.

For a **stealth** site, this step changes — `references/anonymity-variant.md`.

### Step 14 — Performance: fonts, CSP, headers

**Fonts** — a typeface is a styling decision, so the skill doesn't pick one; the site ships with browser-default fonts. When the user adds a font (as part of styling), the canonical way is **Astro's built-in Fonts API** (v6+), *not* `@fontsource`: declare it in `astro.config.mjs` under `fonts: [{ provider: fontProviders.google(), name: '<font>', cssVariable: '--font-x', weights: [...], subsets: ['latin'] }]` (import `fontProviders` from `astro/config`), render `<Font cssVariable="--font-x" preload />` from `astro:assets` in `Layout.astro`'s head, and use `var(--font-x)` in their CSS. It self-hosts at build time with automatic fallback metrics. Note this pattern in the project `CLAUDE.md` so it's there when wanted.

**CSP — Astro's built-in API:** add `security: { csp: true }` to `defineConfig`. Astro hashes bundled scripts and scoped styles — a real CSP, no `'unsafe-inline'`. On the Cloudflare adapter it's delivered as a `<meta>` tag (so `X-Frame-Options` stays in `_headers`). CSP is inactive in `astro dev`.

**`public/_headers`:**

```
/*
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/_astro/*
  Cache-Control: public, max-age=31536000, immutable
```

**Verify locally** before deploying: `npm run build && npm run preview`, then check the CSP `<meta>` tag is present in the previewed HTML. Confirm `_headers` landed at `dist/client/_headers`.

**Images** — with `imageService: 'compile'` use `<Image>` from `astro:assets` freely; `loading="eager" fetchpriority="high"` for the LCP image, `lazy` below the fold.

### Step 15 — Accessibility (WCAG 2.1 AA)

Structural accessibility is done at setup; visual accessibility is guidance for when the user adds styles. (An unstyled page already passes contrast and focus checks — browser defaults are accessible; the risk appears only once styling begins.)

- **Structure — do now:** `<footer>` is a **sibling** of `<main>`, never nested inside it; `<nav aria-label="…">` around any icon nav; `aria-label` on every icon-only `<a>`; semantic HTML over `<div>`; never `loading="lazy"` the LCP image.
- **Visual — guidance for when the user styles:** keep text contrast ≥ 4.5:1; if a custom focus style replaces the browser default, ensure `:focus-visible` rings stay clearly visible.

### Step 16 — Cloudflare Web Analytics

**👤 USER ACTION:** in `dash.cloudflare.com → Web Analytics`, add the site and choose **"Enable with JS Snippet installation"** (plain auto-inject is Pages-only). Cloudflare shows a `<script>` snippet — tell the user to **paste the whole snippet to Claude**; Claude extracts the token. Claude adds the beacon to `Layout.astro` `<head>`, PROD-gated:

```astro
{import.meta.env.PROD && (
  <script defer src="https://static.cloudflareinsights.com/beacon.min.js"
    data-cf-beacon={`{"token": "<token>"}`} />
)}
```

The token is public-by-design — committing it is fine.

---

# Phase D — Project setup for Claude Code

### Step 17 — `README.md`, `CLAUDE.md`, `.claude/`, `.mcp.json`, `CHANGELOG.md`, `ROADMAP.md`

Set the repo up so future Claude sessions are productive immediately and project knowledge stays *in the repo*. Tell the user in one line: "these files let me — or any future Claude session — pick this project up instantly; you don't need to read them."

- **`README.md`** — replace the scaffold's placeholder: project name, one-line description, stack, local-dev commands, the deploy model, project layout, a pointer to `CLAUDE.md`. README is for humans; `CLAUDE.md` is for Claude.
- **`CLAUDE.md`** — from `assets/CLAUDE.md.template` in this skill directory, with the project's real values. No placeholders.
- **`.claude/settings.json`** — permissive, so the owner isn't prompted during normal work (it's their project, set up in a trusted session):
  ```json
  { "permissions": { "allow": ["Bash", "Edit", "Write", "Read", "Glob", "Grep", "WebFetch", "WebSearch"] } }
  ```
- **`.mcp.json`** (repo root) — `{ "mcpServers": { "cloudflare-docs": { "type": "http", "url": "https://docs.mcp.cloudflare.com/mcp" } } }`.
- **`CHANGELOG.md`** — Keep-a-Changelog format; start with `[0.1.0]` dated today (also set `package.json` `"version": "0.1.0"`).
- **`ROADMAP.md`** — `Now` / `Next` / `Later` sections; 👤 ask the user what belongs there.
- **`.github/dependabot.yml`** — automated dependency updates, set-and-forget, so the finished site stays current without the user thinking about it: `version: 2` with `updates: [{ package-ecosystem: "npm", directory: "/", schedule: { interval: "weekly" } }]`.
- **Memory & knowledge policy** — the `CLAUDE.md` (from the template) instructs future sessions to record decisions in `CLAUDE.md`/`CHANGELOG.md`/`ROADMAP.md`, **not** in personal Claude memory. Project knowledge belongs in the repo.
- **Public repos:** 👤 ask whether they want a `LICENSE` (no license = all-rights-reserved by default).

Commit: `git add . && git commit -m "docs: add README, project guide, Claude Code setup, changelog, roadmap"`.

---

# Completion — the skill ends here

The skill is **finished** when every Phase A–D step is done and the live site verifies clean.

1. **Verify** — `python3 ~/.claude/skills/astro-cloudflare-workers-setup/scripts/verify_site.py https://<canonical-domain>` (or the `*.workers.dev` URL if there's no custom domain). Resolve every `[FAIL]`.
2. **Confirm the checklist** is fully done.
3. **Deliver the Completion Summary** — fill in real values:

> ✅ **Setup is complete — your site is live.**
>
> - **Live site:** https://<canonical-domain> — open it; that's a real, public website. (`*.workers.dev` is a backup URL.)
> - **Repository:** <github-repo-URL>
> - **Auto-deploy:** every `git push` to `main` rebuilds and publishes in ~30s; other branches get their own preview URLs. You never run a deploy command again.
> - **Edit your content:** open a file in `src/data/` — e.g. to change the headline, edit the text between the quotes in `src/data/site.ts` and save. Preview locally with `npm run dev` (→ localhost:4321), then `git add -A && git commit -m "update" && git push` — live in ~30s. (A blog post: add a file under `src/content/`.)
> - **Design it:** your site is intentionally plain — no styling was baked in, so nothing fights you. Ask me "design my site" or describe the look you want, and I'll style it on this structure. Nothing is broken.
> - **The repo documents itself:** `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `ROADMAP.md`.
> - **Handled — you don't think about these again:** hosting is free on Cloudflare's edge; HTTPS is automatic and renews itself; security headers and a real 404 are set; Dependabot keeps dependencies current via automatic PRs; your whole site is backed up in GitHub (laptop dies → nothing lost); if a deploy ever fails, Cloudflare emails you and the previous version stays live.
> - **Verified:** `verify_site.py` confirmed HTTPS + Cloudflare, security headers, CSP, SEO/OG/JSON-LD, sitemap, the custom 404, and analytics.

Then **stop** — the skill's job is done. Tell the user the Maintenance section is reference for later and needs nothing now.

---

# Phase E — Maintenance (ongoing — after the skill is complete)

*Not part of setup. Reference for keeping the site healthy; run only when the user asks.*

### Step 18 — Ongoing maintenance

- **A. `compatibility_date` bumps** — update `wrangler.jsonc`, then always `npm run generate-types`.
- **B. Dependency updates** — Dependabot (set up in Step 17) opens weekly PRs; review and merge them. Bump `astro`, `@astrojs/cloudflare`, `wrangler`, `@astrojs/sitemap` together; keep dependency bumps in their own commits.
- **C. New content** — a page: `src/pages/<name>.astro`. A blog post / collection entry: a file under `src/content/…` (the schema validates it, the dynamic route renders it). Both prerender and join the sitemap. Log it in `CHANGELOG.md`.
- **D. New dynamic page** — `export const prerender = false` in its frontmatter; add a `"cf-preview": "astro build && wrangler dev"` script to test the Cloudflare runtime locally.
- **E. Workers Builds debugging** — `dash.cloudflare.com → Workers & Pages → <worker> → Deployments` → the failed build's log. Common causes: Node version, missing `package-lock.json`, `wrangler.jsonc` syntax. The Workers Builds / Observability MCP servers let Claude inspect builds and logs directly.
- **F. Monitoring** — Web Analytics for traffic; `wrangler tail` for runtime errors.
- **G. Keep docs live** — update `CHANGELOG.md` each release, `ROADMAP.md` as priorities shift.

---

## Verification

`scripts/verify_site.py <url>` checks HTTPS + Cloudflare, security headers, immutable asset caching, OG/Twitter/canonical/JSON-LD, the CSP meta tag, the `og:image` resolves, sitemap, `robots.txt`, a real 404 status, the analytics beacon, and favicons. Add `--stealth` for the anonymity variant. Fix every `[FAIL]`; `[WARN]` is advisory.

## Troubleshooting

For any error or unexpected symptom, consult **`references/pitfalls.md`** — a symptom → root-cause → fix table.

## Anonymity-first variant

For a site that must not be discovered yet, follow **`references/anonymity-variant.md`** — defense-in-depth `noindex`, no sitemap/JSON-LD/OG, and a launch checklist. Announce to the user when this variant is active.

## Versions & sources

Verified May 2026: Astro 6.3, `@astrojs/cloudflare` 13.5 (peer `wrangler ^4.83`), `wrangler` 4.93, `@astrojs/sitemap` 3.7, Node 22. On conflict prefer, in order: Astro adapter docs → Cloudflare Workers Static Assets docs → Cloudflare Workers Builds docs — query them live via the Cloudflare Documentation MCP and Context7.
