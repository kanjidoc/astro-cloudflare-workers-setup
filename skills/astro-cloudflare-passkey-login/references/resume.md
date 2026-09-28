# Resuming a half-finished passkey setup

Read this when `src/worker.ts` already exists, or the branch `feat/passkey-login` exists. Gather the evidence in one call, map it to the incomplete step, and resume there. Tell the user what you detected and where you're picking up, and get a one-word confirm.

```bash
git branch --show-current; ls -d src/worker.ts src/data/auth.ts src/pages/lock.astro .dev.vars worker-configuration.d.ts 2>&1; echo "deps:$(grep -c '@simplewebauthn/server' package.json) main:$(grep -c '"main": "./src/worker.ts"' wrangler.jsonc) kv-ids:$(grep -c '"id": "' wrangler.jsonc) types:$(grep -c AUTH_KV worker-configuration.d.ts 2>/dev/null) invite-script:$(npm pkg get scripts.invite)"; npx wrangler secret list 2>/dev/null | grep -c AUTH_COOKIE_SECRET; git log --oneline origin/main -1 2>/dev/null; echo "live-lock:$(curl -s "https://$(grep -o '"pattern": "[^"]*"' wrangler.jsonc | head -1 | cut -d'"' -f4)/" | grep -c 'data-screen="lock"')"
```

Take the **first** rule that matches:

1. `deps:0` → Step 2
2. no `src/worker.ts` → Step 3
3. no `src/data/auth.ts` or no `src/pages/lock.astro` or `main:0` or `invite-script:{}` → Step 4 (finish the templates and edits; each is idempotent)
4. `types:0` → Step 5
5. `npm test` fails or `npm run verify` prints `No bindings found.` → Step 6
6. `kv-ids:` below 2 or the secret count is `0` → Step 8 (re-run Step 7's local gate check first if the tree changed)
7. the branch isn't on `origin` → Step 9
8. `live-lock:0` → Step 10 (not deployed yet, or the gate is missing on the live Worker; a stealth site's `X-Robots-Tag` alone proves nothing)
9. `npm run auth:list` shows no credential → Step 11
10. the site's `CLAUDE.md` has no "Private site: passkey sign-in" section → Step 12; otherwise → *Completion*
