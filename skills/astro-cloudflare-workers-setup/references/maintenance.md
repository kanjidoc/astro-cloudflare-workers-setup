# Phase E — Maintenance (ongoing — after the skill is complete)

*Not part of setup. Reference for keeping the site healthy; run only when the user asks.*

### Step 18 — Ongoing maintenance

- **A. `compatibility_date` bumps** — update `wrangler.jsonc`, then always `npm run generate-types` and `npm run verify`.
- **B. Dependency updates** — Dependabot (Step 8) opens weekly grouped PRs; review and merge them. For a manual bump, run `npx @astrojs/upgrade --dry-run` first (▲ = major). No majors → `npx @astrojs/upgrade`. Majors → never run it for real (it blocks on a prompt); tell the user, check the upgrade guide, then `npm install astro@latest @astrojs/cloudflare@latest @astrojs/sitemap@latest`. Either way `npm i -D wrangler@latest && npm run verify`, and commit the bump on its own.
- **C. New content** — a page: `src/pages/<name>.astro`. A blog post / collection entry: a file under `src/content/…` (the schema validates it, the dynamic route renders it). Both prerender and join the sitemap. Log it in `CHANGELOG.md`.
- **D. New dynamic page** — `export const prerender = false` in its frontmatter (and remove `session: false` if it uses `Astro.session`). Test the real runtime with `npm run build && npm run preview` (workerd; stop with `npx astro preview stop`) — no `wrangler dev` script needed.
- **E. Workers Builds debugging** — the Step 12 `gh api` line (or `gh pr checks <n>`; a PR's Preview URL is in `gh pr view <n> --comments`) gives the status and `details_url`. The log: `Workers & Pages → <worker> → Deployments → View build history` → the failed build. Common causes: Node version (`NODE_VERSION` build variable or `.nvmrc`), missing `package-lock.json`, Worker name ≠ `wrangler.jsonc` `name`, `wrangler.jsonc` syntax.
- **F. Monitoring** — Web Analytics for traffic; re-run `<skill-dir>/scripts/verify_site.py` after big changes. Workers Logs / `wrangler tail` apply only after a page sets `prerender = false` — an assets-only Worker has nothing to log.
- **G. Keep docs live** — update `CHANGELOG.md` each release, `ROADMAP.md` as priorities shift.

`<skill-dir>` is the skill directory named at the top of SKILL.md.
