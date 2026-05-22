# CLAUDE.md

Guidance for Claude Code when working in **this repository** — the repo that *develops* the skill.

## What this repo is

A **Claude Code skill**, packaged as an installable **plugin**. The skill — `astro-cloudflare-workers-setup` — guides Claude Code through taking a user from an empty folder to a live, auto-deploying Astro static site on Cloudflare Workers.

Published (public, MIT) at **https://github.com/kanjidoc/astro-cloudflare-workers-setup**. This repo is the skill's source of truth — the skill is edited here.

**Three different `CLAUDE.md`-shaped files exist — don't confuse them:**
- **This file** — guidance for working on the *skill repo*.
- `skills/astro-cloudflare-workers-setup/SKILL.md` — the skill itself (the instructions Claude follows to build an Astro site).
- `skills/astro-cloudflare-workers-setup/assets/CLAUDE.md.template` — a template the skill writes into each *new Astro site* it creates. Nothing to do with this repo.

## Repo layout

```
.claude-plugin/
  marketplace.json   — declares the "kanjidoc" marketplace + this plugin
  plugin.json        — plugin manifest (name, version, license)
skills/
  astro-cloudflare-workers-setup/      ← THE SKILL — this is what you edit
    SKILL.md         — the skill: a 5-phase (A–E), ~18-step setup guide
    scripts/
      preflight.py   — checks the user's machine for required tools
      verify_site.py — verifies a deployed site (headers, SEO, CSP, 404…)
    references/
      pitfalls.md            — symptom → fix troubleshooting table
      anonymity-variant.md   — the stealth / coming-soon variant
    assets/
      CLAUDE.md.template     — project guide the skill writes into new sites
README.md  LICENSE
```

## ⚠️ The three copies — and the sync rule

The skill content lives in three places, and **they do not auto-sync**:

1. **This repo** (`~/Documents/Cursor/astro-cloudflare-workers-setup/`) — the source you edit.
2. **GitHub** (`kanjidoc/astro-cloudflare-workers-setup`) — `git push` updates it; others install from it.
3. **The owner's live skill** (`~/.claude/skills/astro-cloudflare-workers-setup/`) — a *bare copy* (the skill folder only, no `skills/` wrapper) that the owner's own Claude Code actually runs.

**After changing the skill here, do both:**
```sh
git add -A && git commit -m "…" && git push          # updates GitHub
rsync -a --exclude='.git' skills/astro-cloudflare-workers-setup/ \
  ~/.claude/skills/astro-cloudflare-workers-setup/    # updates the owner's live skill
```
Skip the `rsync` and the owner's own Claude Code keeps running the old version. Plugin users (other people) get updates via `claude plugin update` once you push + release.

## Editing the skill

- The skill is `skills/astro-cloudflare-workers-setup/SKILL.md` plus its `scripts/`, `references/`, `assets/`.
- **Keep the frontmatter spec-compliant** — the `description` is triggering conditions only ("Use when…"), no workflow summary; the whole frontmatter block stays under 1024 characters.
- The two Python scripts are **standard-library only** — no third-party imports, no `pip install`, Python 3.8+. They must run on a clean machine. Keep them that way.

## Design principles — hard-won; don't quietly undo them

This skill was built through several rounds of multi-agent review and four cold end-to-end re-tests. These choices are deliberate:

- **The skill ships new sites UNSTYLED.** `global.css` carries only a universal reset (`box-sizing`, responsive images) — no baked-in colors, fonts, or layout. Styling is explicitly handed off to the user. Do not add opinionated styling.
- **Two-role model** — 🤖 Claude runs commands; 👤 the user does browser/dashboard steps (marked `👤 USER ACTION`), each with a hand-off (state it → wait → verify).
- **Verified version baseline** — Astro 6.3, `@astrojs/cloudflare` 13.5, `wrangler` 4.9x, Node 22 (May 2026). The skill's Step 4 has a version-drift check; if you revise version claims, keep that check honest.
- **The adapter generates a full `wrangler.jsonc`** — the skill keeps and edits it; it does *not* hand-write a minimal one (that was an older, now-incorrect approach).
- **`imageService: 'compile'`** (not `passthrough`/`cloudflare-binding`) — required for `<Image>` to work on a static deploy.
- The skill targets **macOS/Linux** (WSL2 on Windows).

## Testing a change

- **Scripts:** `python3 -m py_compile skills/astro-cloudflare-workers-setup/scripts/*.py`; run `preflight.py` (exit 0 on a ready machine) and `verify_site.py <https-url>` (shouldn't crash) to smoke-test.
- **The skill's steps:** if you change the setup procedure, verify by having a fresh agent execute **Phase A (Steps 1–9)** in a throwaway temp directory — that phase is fully testable with no accounts (it ends at `wrangler deploy --dry-run`). Phases B–E need real GitHub/Cloudflare accounts and a browser, so review those rather than running them.

## Releasing

1. Bump `version` in `.claude-plugin/plugin.json`.
2. Commit and push.
3. `git tag vX.Y && git push origin vX.Y`; optionally `gh release create vX.Y`.
4. Sync the owner's live skill (see the sync rule above).

## Knowledge policy

Record decisions and context **in the repo** — this `CLAUDE.md` and clear commit messages — not in personal Claude memory. The repo is the durable, shared record.
