# Astro → Cloudflare Workers — a Claude Code skill

A [Claude Code](https://claude.com/claude-code) skill that takes you from an empty folder to a **live, auto-deploying Astro static site on Cloudflare Workers** — built to work whether you're a non-technical novice or an experienced developer.

You tell Claude Code *"set up an Astro site on Cloudflare,"* and it runs the whole thing: scaffolds the project, deploys it, wires up a custom domain and GitHub-connected auto-deploy, and sets up SEO, accessibility, security headers, analytics, and a self-documenting repo — pausing only for the few steps that genuinely need a human (a browser login, a dashboard screen). When it finishes, you have a live website and nothing left to do but add your content.

## What it sets up

- A GitHub repo and an Astro project that builds cleanly and deploys to Cloudflare Workers.
- Live on a `*.workers.dev` URL, then optionally your own custom domain.
- **Push-to-`main` auto-deploy** via Cloudflare Workers Builds — every commit publishes itself in ~30s; branches get preview URLs.
- Full SEO — Open Graph, Twitter cards, JSON-LD, sitemap, `robots.txt` — a real custom **404 page**, security headers, a hashed Content-Security-Policy, and Cloudflare Web Analytics.
- WCAG 2.1 AA accessibility structure.
- A **self-documenting repo** — `README`, `CLAUDE.md`, `CHANGELOG.md`, `ROADMAP.md` — and automated dependency updates via Dependabot.
- The site ships **unstyled by design** — no colors, fonts, or layout baked in — so styling stays your decision. Ask Claude to design it whenever you're ready.

## Requirements

- [Claude Code](https://claude.com/claude-code)
- A GitHub account and a Cloudflare account (both free)
- Node.js 22+, `git`, and the GitHub CLI (`gh`) — the skill checks for these up front and guides you through installing anything missing.
- macOS or Linux (on Windows, run inside WSL2).

## Install

### As a plugin (recommended)

```sh
claude plugin marketplace add kanjidoc/astro-cloudflare-workers-setup
claude plugin install astro-cloudflare-workers-setup@kanjidoc
```

Restart Claude Code. Pull future updates with `claude plugin update`.

### Manually

```sh
git clone https://github.com/kanjidoc/astro-cloudflare-workers-setup
cp -R astro-cloudflare-workers-setup/skills/astro-cloudflare-workers-setup ~/.claude/skills/
```

Restart Claude Code.

## Using it

In Claude Code, just say what you want — for example, *"set up a new Astro website on Cloudflare."* The skill triggers automatically and guides the whole process, phase by phase, asking you only for what it genuinely needs.

## What's in the box

| Path | Purpose |
|---|---|
| `skills/astro-cloudflare-workers-setup/SKILL.md` | The skill — a five-phase, by-the-book setup guide. |
| `.../scripts/preflight.py` | Checks your machine has the right tools before you start. |
| `.../scripts/verify_site.py` | Verifies a deployed site — headers, SEO, CSP, a real 404, and more. |
| `.../references/` | A symptom→fix troubleshooting table, and a stealth / coming-soon variant. |
| `.../assets/CLAUDE.md.template` | The project guide the skill writes into each new site. |

Both Python scripts are standard-library-only — no dependencies to install.

## Notes

- Verified against Astro 6.3, `@astrojs/cloudflare` 13.5, and `wrangler` 4.9x. The skill actively checks for version drift and adapts.
- It targets *static* sites on Cloudflare *Workers* (not Pages); individual pages can opt into server rendering later.

## License

MIT — see [LICENSE](LICENSE).
