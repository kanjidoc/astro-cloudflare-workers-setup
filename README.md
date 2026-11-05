# Astro → Cloudflare Workers, a Claude Code plugin

A plugin (an add-on) for [Claude Code](https://claude.com/claude-code), Anthropic's coding assistant, that builds you a real website, starting from an empty folder. It can be any kind of site made of pages: a portfolio, a blog, a business page, documentation, a launch or coming-soon page. Claude puts it live on Cloudflare (the company that hosts it, for free), then helps you design it from whatever you bring, and can make it private with passkey sign-in if you want.

You talk to Claude, and Claude does the work. Before it starts, it explains the plan in plain language. Then it keeps a visible checklist of what's done and what's left, and takes you through one phase at a time. It runs every command and edits every file itself. It asks you only for what it genuinely needs, and when a step needs you in person, like logging in to a website or clicking a button in a dashboard, it tells you exactly what to click, waits for you, and checks that it worked before moving on. It's built to work whether you've never made a website before or you're an experienced developer.

## How it works

There are three phases. Only the first is required, and you can stop between them and pick up later, even in a new session.

1. **Build.** Claude creates the project, puts it online at a free `*.workers.dev` address, connects your own domain name if you have one, and sets things up so every change you publish goes live on its own within a couple of minutes. It also handles search-engine basics, accessibility, security, optional visitor analytics, and notes in the repo explaining how it all fits together. When it finishes you have a live website with your home page on it, ready for whatever content you add next.
   To start, say: *"Set up a new Astro website on Cloudflare."*
   You'll be asked to: confirm where the project folder goes, answer a few questions about the site (name, public or private, one-line description, kind of site), approve a simple logo, log in to GitHub (where your site's files are kept) and Cloudflare (which hosts it) in your browser if you aren't already, click through one Cloudflare page that Claude describes step by step, tell Claude what the home page should say, say yes when it asks before the site goes live the first time, and, if you want visitor stats, add the site in Cloudflare Web Analytics and paste its snippet. Buying or connecting a domain is optional (about $10 a year).

2. **Design.** Your site starts out deliberately plain: no colors, fonts or layout. Whenever you're ready, during setup or months later, bring whatever you have. A sentence about the mood, screenshots, links to sites you like, a poem, a brand kit, a logo, or nothing at all. Claude reads it, tells you in a few lines how it understood it, and styles the site once you agree.
   To start, say: *"Design my site."*
   You'll be asked to: share your material (or none), say yes to Claude's short summary or ask for changes, and look at a preview page on your own computer before anything goes live.

3. **Private.** If the site is just for you and a few people, Claude can lock it so only the people you name can see it. They sign in with a passkey, the Face ID, Touch ID or PIN already on their device. No passwords, nothing to pay for.
   To start, say: *"Make my site private."*
   You'll be asked to: name who may sign in, give a one-word OK before Claude creates a small (free) storage space in your Cloudflare account, approve the change that switches the lock on, and save a passkey on each device.

## What you get

The short version is above. This is the detailed list, for people who want the specifics.

- A live site on a `*.workers.dev` URL, built with Astro (a website-building framework) on Cloudflare Workers (their hosting platform), in a GitHub repo (the project's home on GitHub).
- Your own custom domain, optionally.
- **Push-to-`main` auto-deploy** via Cloudflare Workers Builds: every commit goes live within a couple of minutes. Pull requests and other branches get a **Worker Preview**, with the preview URL posted as a PR comment.
- Full SEO: Open Graph, Twitter cards, JSON-LD, a sitemap and `robots.txt`.
- A real custom **404 page**.
- Security headers, including HSTS (without `preload`, which stays opt-in) and a hashed Content-Security-Policy that also allows Cloudflare Web Analytics.
- WCAG 2.2 AA accessibility structure.
- A **self-documenting repo** (`README`, `CLAUDE.md`, `CHANGELOG.md`, `ROADMAP.md`) that every later Claude session reads before it changes anything.
- Grouped Dependabot updates, so dependency upgrades arrive as tidy pull requests.
- A site that ships **unstyled by design**, so styling stays your decision.
- The design files, ready and empty: `DESIGN.md`, the generated `src/styles/tokens.css`, and the `design/` reference folder.
- A **`/design/` preview page** that exists only under `npm run dev`, never on the live site.
- A favicon, Apple touch icon and social card, the card drawn in your brand colors once the site has a design.
- Dark mode, offered every time you design, following each visitor's system setting.
- Optional passkey-only sign-in to make the whole site private.

## Requirements

- [Claude Code](https://claude.com/claude-code)
- A GitHub account and a Cloudflare account (both free)
- Node.js 26 LTS (22.23.4 minimum), `git`, the GitHub CLI (`gh`), and Python 3.9+ (macOS ships it). The skill checks for these up front and walks you through installing anything missing.
- macOS or Linux (on Windows, run inside WSL2).

## Install

First, install [Claude Code](https://claude.com/claude-code) if you haven't (it needs a Claude account). Then open it and paste this:

```
Install the Claude Code plugin astro-cloudflare-workers-setup from the GitHub marketplace kanjidoc/astro-cloudflare-workers-setup.
```

Claude runs the install for you. Then type `/reload-plugins` (or start a new session) and say *"Set up a new Astro website on Cloudflare."*

If you'd rather type it yourself, this is the one command (Claude Code 2.1.292 or later):

```sh
claude plugin install astro-cloudflare-workers-setup --marketplace kanjidoc/astro-cloudflare-workers-setup
```

On an older Claude Code, it's two commands:

```sh
claude plugin marketplace add kanjidoc/astro-cloudflare-workers-setup
claude plugin install astro-cloudflare-workers-setup@kanjidoc
```

If you typed the commands yourself, run `/reload-plugins` in an open session, or start a new one. Then say *"Set up a new Astro website on Cloudflare."*

### Keeping it up to date

Paste this into Claude Code whenever you want the latest version:

```
Update the astro-cloudflare-workers-setup plugin from the kanjidoc marketplace.
```

Claude runs the update for you. Then type `/reload-plugins` (or start a new session).

Or turn on auto-update once: in `/plugin`, go to **Marketplaces → kanjidoc → Enable auto-update**. The manual commands, if you want them:

```sh
claude plugin marketplace update kanjidoc
claude plugin update astro-cloudflare-workers-setup@kanjidoc
```

Then restart Claude Code or run `/reload-plugins`.

<details>
<summary>Installing without the plugin system (manual copy)</summary>

```sh
git clone https://github.com/kanjidoc/astro-cloudflare-workers-setup
cp -R astro-cloudflare-workers-setup ~/.claude/skills/
```

Restart Claude Code. It loads that folder as a plugin, with all three skills.

Copy the whole folder, not just `skills/astro-cloudflare-workers-setup`. Since 3.1 the setup skill takes the design scaffold from the design skill next to it, and the passkey skill uses the setup skill's verifier. Remove an earlier single-skill copy first. A manual copy never updates itself, so re-copy it to update.

**Pick one way.** A single-skill copy next to the installed plugin loads that skill twice; a whole-repo copy is ignored while the plugin is installed.

</details>

## Using it

In Claude Code, just say what you want, for example *"set up a new Astro website on Cloudflare."* The skill starts on its own. You can also call it directly with `/astro-cloudflare-workers-setup`, or the full plugin form `/astro-cloudflare-workers-setup:astro-cloudflare-workers-setup` if another command already uses the short name.

Claude works the way the introduction describes: a plan first, a visible checklist, one phase at a time, and a clear hand-off whenever a step needs you.

## Designing the site

Say *"design my site"* in a site this plugin built. Or be specific: *"make it look like …"*, *"here's my brand kit"*, *"change the fonts"*, *"add dark mode"*. You can also call it directly with `/astro-cloudflare-design`.

It works any time: during setup, straight after, or months later in a new session. Come back and change the design as often as you like.

**Bring anything, or nothing.** A sentence about the mood, screenshots, links, a brand PDF, a logo, font files, a poem, a `DESIGN.md` from elsewhere, or nothing at all, in which case Claude proposes a look. Claude reads what you give it and sums up in a few lines how it understood it: the colors, the fonts, the feel, the layout idea, and anything it guessed. Every time, it offers a dark scheme too. Once you agree, it writes `DESIGN.md`.

**`DESIGN.md` is a plain text file** at the root of your repo, in Google's [design.md](https://github.com/google-labs-code/design.md) format. It holds a short block of colors, type styles, spacing and corner sizes, followed by notes on the feel and the rules. You never need to learn the format, but you can read and edit it like any document.

From there Claude:

1. generates the site's CSS from `DESIGN.md`;
2. shows you the result at `/design/` while `npm run dev` is running, so you can judge it by looking;
3. styles the pages, refreshes the social card, and pushes, which puts it live.

Logos, fonts and reference material each go to a fixed folder. The reference folder, `design/`, is never deployed.

**To change the design later,** ask Claude and it does the rest. (If you like doing things by hand: edit `DESIGN.md`, run `npm run design`, and commit.)

## Making a site private

Say *"make my site private"* or *"add passkey login"* in a site this plugin built. The `astro-cloudflare-passkey-login` skill adds a Worker (a small program on Cloudflare) that runs before every request, shows a plain lock page to anyone who isn't signed in, and lets exactly the people you name sign in with passkeys. No passwords, no Google-style sign-in service, nothing to pay for.

You invite each person with a single-use link from `npm run invite -- <name>`, and revoke a device with `npm run auth:revoke`. The site's `verify` script keeps checking that the gate is in place, and `verify_site.py --gated` checks it live.

## What's in the box

| Path | Purpose |
|---|---|
| `skills/astro-cloudflare-workers-setup/SKILL.md` | The skill: a five-phase, by-the-book setup guide. |
| `.../scripts/preflight.py` | Checks that your machine has the right tools before you start. |
| `.../scripts/verify_site.py` | Verifies a site's headers, SEO, CSP, 404 page and more. It checks a live URL, or a local preview with `--local`; `--gated` checks a passkey-private site. |
| `.../scripts/gen-images.mjs` | Builds `favicon.ico`, `apple-touch-icon.png` and `og.webp` from your site's SVG mark; the social card uses your brand colors once the site is designed. |
| `.../references/` | A symptom → fix troubleshooting table and the stealth / coming-soon variant. |
| `.../assets/site/` | Config files that are identical for every site (editor, Prettier, Node version, headers, Dependabot, MCP, permissions). |
| `.../assets/CLAUDE.md.template` | The project guide the skill writes into each new site. |
| `skills/astro-cloudflare-design/SKILL.md` | The design skill: turns any design input into a `DESIGN.md`, generates the site's CSS from it, previews it and styles the site. Runs any time on a site this plugin built. |
| `skills/astro-cloudflare-design/references/` | The `DESIGN.md` format condensed for Claude, a troubleshooting table, and the rules for picking up a half-done design. |
| `skills/astro-cloudflare-design/assets/site/` | The design files every site gets: a blank `DESIGN.md`, the `design/` reference folder, the `scripts/design-tokens.mjs` generator, an empty `src/styles/tokens.css`, and the dev-only `/design/` preview page, and a `.prettierignore` that keeps Prettier off the generated files. |
| `skills/astro-cloudflare-passkey-login/` | The passkey skill: makes a finished site private with passkey-only sign-in (WebAuthn, Workers KV sessions, invite links, a Worker gate). Unstyled lock page; free plan only. |

The Python scripts use only the standard library, so there's nothing to install. `gen-images.mjs` uses the image library (`sharp`) that your Astro project already has. The design generator is copied into each site and needs one small package, `yaml`, which the skills install there.

## What's new in 3.1

- **A third skill, `astro-cloudflare-design`, styles your site.** Bring anything: a few words about the feel, screenshots, links to sites you like, a brand PDF, a logo, font files, or nothing at all and Claude proposes a look. Claude tells you in a few lines how it read your material, and once you agree it writes the design down and styles the site from it.
- **Two ways in, one result.** Drop in a `DESIGN.md` you already have (Google's [design.md](https://github.com/google-labs-code/design.md) format), or just talk it through with Claude. Either way the same files end up in the same places.
- **Dark mode is offered every time.** If you say yes, the site follows each visitor's light or dark system setting.
- **A preview page at `/design/`** while `npm run dev` is running: your colors, type styles and spacing, plus a sample page with headings, text, a list, links, a button and a form field. It exists only on your computer and is never part of the live site.
- **A social card in your brand colors.** Once the site has a design, `gen-images.mjs` draws the link-preview card in its primary color; `--no-design` keeps the plain black-on-white card.
- **`npm run design`** turns `DESIGN.md` into the site's CSS, and `npm run verify` now checks that the two still match.
- New sites come with the empty design files in place. Sites built with 2.0 or later get them the first time you run the design skill.
- **Sites still ship unstyled until you design them.** Nothing changes on a site until you ask.

## What's new in 3.0

- **Re-checked against today's tools** (November 2026): Astro 7.4, `@astrojs/cloudflare` 14.4, `wrangler` 4.157, Node 26 LTS and Claude Code 2.1.318.
- **Node 26 LTS** is now the version new sites use. The minimum is 22.23.4, because Astro refuses to start on anything older.
- **TypeScript stays on version 6.** TypeScript 7 breaks the type check that runs before every build, so the skill installs 6 and Dependabot skips the 7 upgrade.
- **Pull-request previews build reliably**: new sites get the `previews` block that Cloudflare's preview command needs.
- A new troubleshooting entry for a page you later switch to server rendering that shows the 404 page when you open it in a browser.
- The caching rule for Astro's files is now described correctly (the shipped `_headers` rule is the one in effect).
- Dashboard labels, domain registration and domain transfer steps refreshed.
- Passkey skill: `npm test` works on every supported Node version, the invite, list and revoke scripts no longer need TypeScript, and its design document now matches the shipped code.
- `verify_site.py` stops with a clear message when nothing is deployed at the URL, and no longer mistakes Cloudflare's own error page for your custom 404.
- The move to adapter 15 and Cloudflare's new `cf` tool is documented for later. Both are still in beta, so the skill stays on adapter 14 and `wrangler`.

**This is a breaking release.** It needs Astro ≥ 7.4 and `@astrojs/cloudflare` ≥ 14.4, and new sites pin Node 26.

## What's new in 2.1

- **A second skill, `astro-cloudflare-passkey-login`.** Makes a finished site private with passkey-only sign-in: a Worker gate that runs before every request, sessions in Workers KV, single-use invite links, and laptop scripts to invite, list and revoke. No passwords, no identity provider, free plan only. The lock page ships unstyled, like everything else here. See *Making a site private*.
- **`verify_site.py --gated`** checks a private site: the lock page in place of every document, 401 for other requests, security headers on Worker responses, `/auth/session` answering 401.

## What's new in 2.0

- Rebuilt for **Astro 7** and `@astrojs/cloudflare` 14.
- The static site deploys as a binding-free, assets-only Worker, so there's no KV namespace step.
- The helper scripts now run from plugin installs. In v1 they pointed at `~/.claude/skills/` and failed.
- Workers Builds setup now matches today's dashboard, including Worker Previews. The build status is read from GitHub check runs, so you don't have to report it back.
- A new `gen-images.mjs` makes a multi-size favicon, the Apple touch icon and the social card in one step.
- `verify_site.py --local` checks the built site *before* anything is pushed.
- The verifier now catches:
  - an analytics beacon that the CSP would block;
  - a leftover `noindex`;
  - a 404 page with an empty body.
- The stealth / coming-soon variant now keeps pages out of search results correctly.

**This is a breaking release.** It needs Astro ≥ 7.2. Finished v1 sites keep working. A setup left half-done under 1.x may not resume cleanly under 2.0.

## Notes

- Verified against Astro 7.4, `@astrojs/cloudflare` 14.4, `wrangler` 4.157 and Node 26 LTS (November 2026). The skill checks for version drift and adapts.
- It targets *static* sites on Cloudflare *Workers* (not Pages). Individual pages can opt into server rendering later.
- No secrets are stored in your repo or on GitHub.
  - Local deploys use `wrangler login`, or `CLOUDFLARE_API_TOKEN` if you have it set.
  - Workers Builds creates its own scoped API token in your Cloudflare dashboard. Leave that token in place.

## License

MIT. See [LICENSE](LICENSE).
