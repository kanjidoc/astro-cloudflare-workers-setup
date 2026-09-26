# Astro → Cloudflare Workers — a Claude Code skill

A [Claude Code](https://claude.com/claude-code) skill that takes you from an empty folder to a **live, auto-deploying Astro static site on Cloudflare Workers**. It's built to work whether you're a non-technical novice or an experienced developer.

Tell Claude Code *"set up an Astro site on Cloudflare"* and it runs the whole thing. It scaffolds the project, deploys it, and wires up a custom domain and GitHub-connected auto-deploy. It also sets up SEO, accessibility, security headers, analytics and a self-documenting repo. It pauses only for the few steps that genuinely need a person, such as a browser login or a dashboard screen. When it finishes, you have a live website and nothing left to do but add your content.

## What it sets up

- A GitHub repo and an Astro project that builds cleanly and deploys to Cloudflare Workers.
- The site goes live on a `*.workers.dev` URL, then optionally on your own custom domain.
- **Push-to-`main` auto-deploy** via Cloudflare Workers Builds. Every commit goes live within a couple of minutes. Pull requests and other branches get a **Worker Preview**, and the preview URL is posted as a PR comment.
- Full SEO: Open Graph, Twitter cards, JSON-LD, a sitemap and `robots.txt`.
- A real custom **404 page**.
- Security headers, including HSTS (without `preload`, which stays opt-in) and a hashed Content-Security-Policy that also allows Cloudflare Web Analytics.
- WCAG 2.2 AA accessibility structure.
- A **self-documenting repo** (`README`, `CLAUDE.md`, `CHANGELOG.md`, `ROADMAP.md`), plus grouped Dependabot updates.
- The site ships **unstyled by design**, with no colors, fonts or layout baked in, so styling stays your decision. Ask Claude to design it whenever you're ready.

## Requirements

- [Claude Code](https://claude.com/claude-code)
- A GitHub account and a Cloudflare account (both free)
- Node.js 24 LTS (22.12 minimum), `git`, the GitHub CLI (`gh`), and Python 3.9+ (macOS ships it). The skill checks for these up front and guides you through installing anything missing.
- macOS or Linux (on Windows, run inside WSL2).

## Install

### As a plugin (recommended)

```sh
claude plugin marketplace add kanjidoc/astro-cloudflare-workers-setup
claude plugin install astro-cloudflare-workers-setup@kanjidoc
```

Then run `/reload-plugins` in an open session, or start a new one.

### Updating

Third-party marketplaces don't auto-update by default. You can turn auto-update on once: in `/plugin`, go to **Marketplaces → kanjidoc → Enable auto-update**. Or update by hand:

```sh
claude plugin marketplace update kanjidoc
claude plugin update astro-cloudflare-workers-setup@kanjidoc
```

Then restart Claude Code or run `/reload-plugins`.

### Manually

```sh
git clone https://github.com/kanjidoc/astro-cloudflare-workers-setup
cp -R astro-cloudflare-workers-setup/skills/astro-cloudflare-workers-setup ~/.claude/skills/
```

Restart Claude Code. A manual copy never updates itself, so re-copy it to update. **Don't install it both ways**: the plugin and a manual copy would load the same skill twice.

## Using it

In Claude Code, just say what you want, for example *"set up a new Astro website on Cloudflare."* The skill triggers automatically. You can also invoke it directly with `/astro-cloudflare-workers-setup` (or the full plugin form `/astro-cloudflare-workers-setup:astro-cloudflare-workers-setup` if another command already uses the short name). It guides the whole process phase by phase and asks you only for what it genuinely needs.

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

## What's in the box

| Path | Purpose |
|---|---|
| `skills/astro-cloudflare-workers-setup/SKILL.md` | The skill: a five-phase, by-the-book setup guide. |
| `.../scripts/preflight.py` | Checks that your machine has the right tools before you start. |
| `.../scripts/verify_site.py` | Verifies a site's headers, SEO, CSP, 404 page and more. It checks a live URL, or a local preview with `--local`. |
| `.../scripts/gen-images.mjs` | Builds `favicon.ico`, `apple-touch-icon.png` and `og.webp` from your site's SVG mark. |
| `.../references/` | A symptom → fix troubleshooting table and the stealth / coming-soon variant. |
| `.../assets/site/` | Config files that are identical for every site (editor, Prettier, Node version, headers, Dependabot, MCP, permissions). |
| `.../assets/CLAUDE.md.template` | The project guide the skill writes into each new site. |

The Python scripts use only the standard library, so there's nothing to install. `gen-images.mjs` uses the image library (`sharp`) that your Astro project already has.

## Notes

- Verified against Astro 7.3, `@astrojs/cloudflare` 14.3, `wrangler` 4.141 and Node 24 LTS (September 2026). The skill checks for version drift and adapts.
- It targets *static* sites on Cloudflare *Workers* (not Pages). Individual pages can opt into server rendering later.
- No secrets are stored in your repo or on GitHub.
  - Local deploys use `wrangler login`, or `CLOUDFLARE_API_TOKEN` if you have it set.
  - Workers Builds creates its own scoped API token in your Cloudflare dashboard. Leave that token in place.

## License

MIT — see [LICENSE](LICENSE).
