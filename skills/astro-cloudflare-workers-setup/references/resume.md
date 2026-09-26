# Resuming a half-finished setup

Read this when the project folder isn't empty — a previous session stopped partway.

Gather the evidence in one call, map it to the incomplete step, and resume there; don't redo prior steps. Tell the user what you detected and where you're picking up, and get a one-word confirm.

```bash
cat .claude/setup-inputs.json 2>/dev/null; ls -d package.json node_modules worker-configuration.d.ts .nvmrc src/pages/404.astro public/apple-touch-icon.png CHANGELOG.md CLAUDE.md 2>&1; git remote -v; git rev-parse --verify -q origin/main; echo "adapter:$(grep -c '"@astrojs/cloudflare"' package.json 2>/dev/null) check:$(grep -c '"@astrojs/check"' package.json 2>/dev/null) config:$(grep -c 'session: false' astro.config.mjs 2>/dev/null) 404-handling:$(grep -c not_found_handling wrangler.jsonc 2>/dev/null) routes:$(grep -c '"routes"' wrangler.jsonc 2>/dev/null) verify-script:$(npm pkg get scripts.verify 2>/dev/null)"
```

`.claude/setup-inputs.json` holds the Confirm-Inputs answers — if it's absent, re-ask them. Dependency signals come from `package.json`, not `node_modules`; if `package.json` exists but `node_modules` doesn't (a fresh clone, or it was deleted), run `npm install` before resuming. Take the **first** rule that matches:

1. no `package.json` → Step 2 if `git remote -v` shows `origin`, otherwise Step 0/1
2. no `public/apple-touch-icon.png` → finish Step 2 (brand mark, then `gen-images.mjs`)
3. `adapter:0` → Step 3
4. `check:0` or `config:0` → Step 4
5. `404-handling:0` → Step 5
6. no `worker-configuration.d.ts` → Step 6
7. `verify-script:{}` → Step 7
8. no `.nvmrc` → Step 8 — the only case where the Step 8 copy runs on resume (it overwrites)
9. no `origin/main` → Step 9 (`npm run verify`), then Step 10
10. `domain` is non-null but `routes:0` → Step 11
11. no `src/pages/404.astro` → Step 12 if the Step 12 `gh api` line (with `origin/main` in place of `HEAD`) prints nothing; otherwise Step 13
12. `analytics` is `"pending"` → Step 16 (first confirm Step 13's completion check, Step 14's `dist/client/_headers` and Step 15's structure)
13. no `CHANGELOG.md` → Step 17; otherwise → *Completion*

Before any push, re-run the Step 8 ignore loop (idempotent), so a setup that stopped mid-Step 8 can't commit `.claude/setup-inputs.json`.
