# Resuming a half-finished design

Read this when `DESIGN.md` already has values, or a previous session stopped partway. Gather the evidence in one call, map it to the incomplete step, and resume there. Tell the user what you detected and where you're picking up, and get a one-word confirm.

```bash
ls -d DESIGN.md scripts/design-tokens.mjs src/pages/design src/assets/fonts src/assets/brand design 2>&1; echo "colors:$(grep -cE '^colors: *[^{ ]*$' DESIGN.md 2>/dev/null) tokens-bytes:$(wc -c < src/styles/tokens.css 2>/dev/null | tr -d " ") import:$(head -1 src/styles/global.css | grep -c tokens.css) yaml:$(grep -c '"yaml"' package.json) fonts:$(grep -c 'fonts:' astro.config.mjs) font-tag:$(if [ -f src/layouts/Layout.astro ]; then grep -c '<Font ' src/layouts/Layout.astro; else echo none; fi) section:$(if [ -f CLAUDE.md ]; then grep -c '^## Design system' CLAUDE.md; else echo none; fi)"; npm run design:check 2>&1 | tail -2; git status --porcelain | head; git log --oneline -5
```

`colors:` above 0 means a non-empty `colors:` map exists, in the front matter or a fenced block (the stub's `colors: {}` counts 0). `tokens-bytes` is 127 for the stub output; more means values were generated. `font-tag:none` means no `Layout.astro` yet (setup before its Step 13); `section:none` means no `CLAUDE.md` yet.

Take the **first** rule that matches:

1. no `scripts/design-tokens.mjs`, no `src/pages/design`, `yaml:0`, `import:0` or `section:0` → *Scaffold* (each piece is skipped when present). `section:none` → not a Scaffold trigger (setup before Step 17)
2. `DESIGN.md` is still the stub and no interpretation was agreed → Step 1 (ask again; files already in `design/` or `src/assets/` count as input)
3. `DESIGN.md` has values but `design:check` fails → Step 3
4. `DESIGN.md` names a family that isn't the system stack and `fonts:0` or `font-tag:0` → Step 4
5. the user hasn't approved the preview (ask) → Step 5
6. no layout, page or component uses a token yet: `grep -rl 'var(--' src/pages src/layouts src/components 2>/dev/null | grep -v 'src/pages/design/' | wc -l` prints 0 (the scaffolded `/design/` preview is excluded; a missing folder is skipped) → Step 6
7. `public/og.webp` older than `src/styles/tokens.css` (`ls -t public/og.webp src/styles/tokens.css | head -1`) → Step 7
8. uncommitted changes, or `origin/main` behind `main` → Step 8; otherwise → *Completion*
