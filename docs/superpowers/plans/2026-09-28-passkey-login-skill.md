# `astro-cloudflare-passkey-login` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second skill to this plugin that makes a site built by `astro-cloudflare-workers-setup` private with passkey-only sign-in, by shipping the tested twofabianos auth code as copyable assets plus a guided procedure.

**Architecture:** A new skill directory `skills/astro-cloudflare-passkey-login/` with `SKILL.md` (the procedure), `references/` (technical design, pitfalls, resume map) and `assets/` (`site/` byte-identical code copied with `cp -R`; `templates/` files Claude fills per site). The setup skill's `verify_site.py` gains a `--gated` flag so one verifier serves both skills. The setup skill, README, manifests and dev `CLAUDE.md` get pointers. Version bumps to 2.1.0.

**Tech Stack:** Markdown skill files; Python 3.9 standard library (`verify_site.py`); the shipped site code is TypeScript for Astro 7.3 / `@astrojs/cloudflare` 14.3 / wrangler 4.141 with `@simplewebauthn/server` and `/browser` ^14, tested with `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-28-passkey-login-skill-design.md`. Source of the ported code: `/Users/tonyfabiano/Documents/Cursor/twofabianos`, branch `feat/private-sign-in`, and its specs under `docs/superpowers/specs/2026-09-28-private-sign-in-*.md`.

## Two phases

- **Phase 1 (Tasks 1–3) can run now.** Nothing in them depends on the twofabianos build finishing.
- **Phase 2 (Tasks 4–7) waits for the `add-login` session's final report** (its build finished and reviewed, a commit hash to copy from). Do not start Task 4 from a mid-build snapshot.

## Global Constraints

- The skill directory is the only anchor: SKILL.md says `${CLAUDE_SKILL_DIR}`; reference and asset files say `<skill-dir>`. Never hard-code `~/.claude/skills/...`.
- Frontmatter uses Agent Skills spec fields only: `name` (≤64 chars, lowercase/digits/hyphens) and `description` (≤1024 chars, third person, what and when).
- The setup skill keeps exactly three scripts. The new skill has no `scripts/` directory; it calls `${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/scripts/verify_site.py`.
- `verify_site.py` stays Python 3.9+, standard library only. Exit codes: 0 no FAIL, 1 FAIL present, 2 bad or unreachable URL.
- `assets/site/` holds only files byte-identical for every site. Anything per-site is a template under `assets/templates/`.
- De-branding renames (spec §3.3), and nothing else: `__Host-tf-session|challenge|arrival` → `__Host-auth-session|challenge|arrival`; event `tf:auth-state` → `auth:state`; `src/data/auth.ts` becomes a template; allowlist drops `/sw.js`, `/og-v1.png`, `/brand/**` and adds `/og.webp`.
- Sites stay unstyled. The lock and invite pages carry only the contract hooks: `data-screen`, `data-part`, `data-auth-action`, `data-auth-state` on `<html>`.
- Private means noindex: `X-Robots-Tag: noindex, nofollow` on every Worker response; `robots.txt` stays open; never `Disallow: /`; never HSTS `preload`.
- Setup-skill invariants kept: `output: 'static'`, `session: false`, `imageService: 'compile'`, hashed meta CSP (no inline scripts, no `define:vars`), `not_found_handling: "404-page"`.
- Credentials: `$CLOUDFLARE_API_TOKEN` or an existing `wrangler` login. Never `wrangler login` when a token is present. Never print a secret.
- Node floor for the shipped unit tests: 22.18 (native `.ts` stripping); `.nvmrc` says 24.
- Version: `.claude-plugin/plugin.json` → `2.1.0`. Release only from `main` with a clean tree.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **A live site whose Worker entry was silently dropped** (an all-prerendered build): the homepage serves real content to an anonymous visitor. `verify_site.py --gated` must FAIL loudly with a hint naming the cause. Pinned in Task 1 (the ungated fixture run expects exit 1 and a "not gated" line) and Task 6 (the negative build-guard run).
2. **`--gated` against an ordinary public site** (for example `cloudflare.com`): must report FAILs, never a traceback. Pinned in Task 1 step 9.
3. **A plugin-built site with no custom domain** (workers.dev only): passkeys bind to the RP ID, so the skill must stop before Step 1 and say why. Pinned in Task 2 (precondition text and the resume map) and Task 6 (the scratch site has no domain, so the agent must stop at the precondition, then continue only with the `--allow-local-only` note the test gives it).
4. **A user name with uppercase, spaces or punctuation** in `USERS`: the invite script must refuse it rather than mint a link for a name the KV keys can't round-trip. Pinned in Task 4 (unit test `auth-data.test.ts` keeps its lowercase check) and Task 6 (`npm run invite -- "Tony F" --local` must exit non-zero).
5. **A Worker Preview URL** where `previews` has no KV id yet: the Worker must fail closed (503 on `/auth/*`, lock page everywhere), never serve gated content. Pinned in Task 1 (`check_gate_auth_session` maps 503 to a FAIL that names the previews block) and the pitfalls table in Task 2.

---

## Phase 1

### Task 1: `verify_site.py --gated`

**Files:**
- Modify: `skills/astro-cloudflare-workers-setup/scripts/verify_site.py` (docstring lines 1–35; constants after line 67; new checks before `# Check runner` at line 1255; `build_context` at 1305; `main` at 1337–1424)
- Test fixture (not committed): `/private/tmp/claude-501/-Users-tonyfabiano-Documents-Cursor-astro-cloudflare-workers-setup/53502f66-36e3-4e6e-9dbd-331c820f91d9/scratchpad/gate_fixture.py`

**Interfaces:**
- Consumes: `fetch()`, `Response.header()`, `has_noindex()`, `parse_head()` results (`head.links`, `head.metas`), `find_meta()`, `PASS/FAIL/WARN`, `random`, `urllib.parse`.
- Produces: CLI flag `--gated`; `ctx["gated"]` (bool); checks `check_gate_homepage_lock`, `check_gate_unknown_path`, `check_gate_subresource_401`, `check_gate_auth_session`, `check_gate_no_canonical`; constant `LOCK_MARKER = 'data-screen="lock"'`. Task 2's SKILL.md and Task 6 call `verify_site.py --local --gated <url>` and `verify_site.py --gated https://<apex>`.

- [ ] **Step 1: Write the fixture that plays a gated site and an open site**

Save as `<scratchpad>/gate_fixture.py`:

```python
#!/usr/bin/env python3
"""Fake site for testing verify_site.py --gated. Usage: gate_fixture.py gated|open PORT"""
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

MODE = sys.argv[1]
PORT = int(sys.argv[2])

SEC = {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}
NOINDEX = {"X-Robots-Tag": "noindex, nofollow"}
CSP = ("default-src 'self'; script-src 'self' 'sha256-AAAA'; style-src 'self' "
       "'sha256-BBBB'; object-src 'none'; base-uri 'self'")

LOCK = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="{csp}">
<meta name="robots" content="noindex, nofollow"><title>Example</title>
<meta property="og:type" content="website"><meta property="og:title" content="Example">
<meta property="og:description" content="d"><meta property="og:image" content="http://127.0.0.1:{port}/og.webp">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Example"><meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Example"><meta name="twitter:image" content="http://127.0.0.1:{port}/og.webp">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="stylesheet" href="/_astro/lock.a1b2c3d4.css">
<script type="application/ld+json">{{"@context":"https://schema.org","@type":"WebSite","name":"Example"}}</script>
</head><body><main data-screen="lock"><h1 data-part="heading">Sign in</h1>
<button type="button" data-auth-action="unlock"><span data-part="label">Unlock</span></button>
<p data-part="failure" aria-live="polite" hidden>That didn't work. Try again?</p></main></body></html>"""

HOME = LOCK.replace('<main data-screen="lock">', '<main>').replace(
    '<meta name="robots" content="noindex, nofollow">',
    '<link rel="canonical" href="https://example.com/">')

PUBLIC = {"/favicon.svg", "/favicon.ico", "/apple-touch-icon.png", "/robots.txt", "/og.webp"}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, status, body=b"", ctype="text/html; charset=utf-8", extra=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in SEC.items():
            self.send_header(k, v)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/robots.txt":
            return self._send(200, b"User-agent: *\nAllow: /\n", "text/plain", NOINDEX)
        if path.startswith("/_astro/") and path.endswith(".css"):
            return self._send(200, b"body{}", "text/css",
                              {"Cache-Control": "public, max-age=31536000, immutable", **NOINDEX})
        if path in PUBLIC:
            return self._send(200, b"x", "application/octet-stream", NOINDEX)
        if MODE == "open":
            if path == "/":
                return self._send(200, HOME.format(csp=CSP, port=PORT).encode(), extra={})
            return self._send(404, b"<!doctype html><html><body>404</body></html>")
        # gated
        if path == "/auth/session":
            return self._send(401, b"", "application/json", {"Cache-Control": "no-store", **NOINDEX})
        dest = self.headers.get("Sec-Fetch-Dest", "document")
        if dest != "document":
            return self._send(401, b"", "text/plain", {"Cache-Control": "no-store", **NOINDEX})
        return self._send(200, LOCK.format(csp=CSP, port=PORT).encode(),
                          extra={"Cache-Control": "no-store", **NOINDEX})


HTTPServer(("127.0.0.1", PORT), H).serve_forever()
```

- [ ] **Step 2: Run the verifier against the gated fixture and confirm it FAILs today**

```bash
S=/private/tmp/claude-501/-Users-tonyfabiano-Documents-Cursor-astro-cloudflare-workers-setup/53502f66-36e3-4e6e-9dbd-331c820f91d9/scratchpad
python3 $S/gate_fixture.py gated 4399 & FX=$!
sleep 1
python3 skills/astro-cloudflare-workers-setup/scripts/verify_site.py --local --gated http://127.0.0.1:4399; echo "exit=$?"
kill $FX
```

Expected: argparse error `unrecognized arguments: --gated`, exit 2.

- [ ] **Step 3: Add the flag, the context field and the constant**

In the docstring after the `--stealth` paragraph (line 30), add:

```
The --gated flag targets a private site made with astro-cloudflare-passkey-login.
It implies --stealth (noindex everywhere) and replaces the canonical and 404
checks: with no session, every document request must serve the lock page in
place (200, no-store, noindex) with no canonical, a non-document request must
get 401 with the security headers, and /auth/session must answer 401.
```

Add to the usage block: `python3 verify_site.py https://example.com --gated`.

After `BEACON_MARKER` (line 68) add:

```python
LOCK_MARKER = 'data-screen="lock"'  # the passkey-login lock page's hook
GATE_HEADERS = ("strict-transport-security", "x-content-type-options",
                "x-frame-options", "referrer-policy", "permissions-policy")
```

Change `build_context(base_url, stealth, local=False)` to `build_context(base_url, stealth, local=False, gated=False)` and add `"gated": gated,` to the `ctx` dict.

In `main`, after the `--local` argument:

```python
    parser.add_argument(
        "--gated",
        action="store_true",
        help="Verify a private site (astro-cloudflare-passkey-login): implies "
             "--stealth; expects the lock page in place of every document "
             "without a session, 401 for other requests, and /auth/session "
             "to answer 401.",
    )
```

After `args = parser.parse_args(argv)`: `stealth = args.stealth or args.gated`. Replace every later `args.stealth` in `main` with `stealth`. Change the mode line to:

```python
    mode = "stealth / coming-soon" if stealth else "standard / public"
    if args.gated:
        mode = "private / passkey-gated (implies stealth)"
```

Change the context call to `build_context(base_url, stealth, args.local, args.gated)`.

- [ ] **Step 4: Add the five gate checks before `# Check runner`**

```python
# ---------------------------------------------------------------------------
# Gated-site checks (--gated; astro-cloudflare-passkey-login)
# ---------------------------------------------------------------------------

def _gate_nav_headers():
    return {"Accept": "text/html", "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Dest": "document"}


def check_gate_homepage_lock(ctx):
    """Gated only: with no session cookie the homepage is the lock page."""
    name = "Gated: homepage is the lock page"
    resp = ctx["home"]
    if resp is None:
        return (FAIL, name, "homepage unreachable",
                "homepage must be reachable")
    if LOCK_MARKER in resp.body:
        return (PASS, name, "lock page served at /")
    return (FAIL, name,
            "the homepage is NOT the lock page — the site is not gated",
            "the Worker entry may have been dropped (an all-prerendered build "
            "removes `main`): run `npm run build` and confirm the config that "
            ".wrangler/deploy/config.json points at still has a `main`; "
            "check `npm run verify` lists AUTH_KV")


def check_gate_unknown_path(ctx):
    """
    Gated only: an unknown URL serves the lock page in place — 200, no-store,
    noindex — never a 404 and never a redirect (nothing may leak about which
    paths exist).
    """
    name = "Gated: unknown path serves the lock page in place"
    token = "{:08x}".format(random.getrandbits(32))
    url = urllib.parse.urljoin(ctx["base"], "/__verify_gate_" + token)
    try:
        resp = fetch(url, follow_redirects=False,
                     extra_headers=_gate_nav_headers())
    except Exception as err:
        return (FAIL, name, "could not fetch {}: {}".format(url, err),
                "the site must answer unknown routes")
    problems = []
    if resp.status != 200:
        problems.append("HTTP {} (expected 200)".format(resp.status))
    if LOCK_MARKER not in resp.body:
        problems.append("body is not the lock page")
    if "no-store" not in resp.header("cache-control").lower():
        problems.append("Cache-Control lacks no-store: {!r}".format(
            resp.header("cache-control")))
    if not has_noindex(resp.header("x-robots-tag")):
        problems.append("X-Robots-Tag lacks noindex")
    if problems:
        return (FAIL, name, "; ".join(problems),
                "src/worker.ts must answer every document request without a "
                "session with /lock/ at the requested URL, Cache-Control: "
                "no-store and X-Robots-Tag: noindex, nofollow")
    return (PASS, name, "200 lock page, no-store, noindex")


def check_gate_subresource_401(ctx):
    """
    Gated only: a non-document request (Sec-Fetch-Dest: image) for an unknown
    path gets 401, and the Worker sets the security headers itself, since
    _headers never applies to Worker-generated responses.
    """
    name = "Gated: non-document request gets 401 with security headers"
    token = "{:08x}".format(random.getrandbits(32))
    url = urllib.parse.urljoin(ctx["base"], "/__verify_gate_" + token + ".png")
    try:
        resp = fetch(url, follow_redirects=False, extra_headers={
            "Accept": "image/*", "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Dest": "image"})
    except Exception as err:
        return (FAIL, name, "could not fetch {}: {}".format(url, err),
                "the site must answer unknown routes")
    if resp.status != 401:
        return (FAIL, name, "HTTP {} (expected 401)".format(resp.status),
                "src/lib/gate/classify.ts: only Sec-Fetch-Dest document (or "
                "absent) may get the lock page; everything else is 401")
    missing = [h for h in GATE_HEADERS if not resp.header(h)]
    if not has_noindex(resp.header("x-robots-tag")):
        missing.append("x-robots-tag (noindex)")
    if missing:
        return (FAIL, name, "401 but missing: " + ", ".join(missing),
                "the Worker must set the security headers on every response "
                "it creates (src/lib/gate/headers.ts) — public/_headers does "
                "not apply to Worker-generated responses")
    return (PASS, name, "401 with all security headers and noindex")


def check_gate_auth_session(ctx):
    """Gated only: GET /auth/session without a cookie answers 401."""
    name = "Gated: /auth/session answers 401 without a session"
    url = urllib.parse.urljoin(ctx["base"], "/auth/session")
    try:
        resp = fetch(url, follow_redirects=False,
                     extra_headers={"Accept": "application/json"})
    except Exception as err:
        return (FAIL, name, "could not fetch /auth/session: {}".format(err),
                "the auth endpoints must be reachable")
    if resp.status == 401:
        return (PASS, name, "401 as expected")
    if resp.status == 200 and LOCK_MARKER in resp.body:
        return (FAIL, name, "/auth/session served the lock page",
                "src/worker.ts must pass /auth/* and /invite/* through to the "
                "Astro handler before the session check")
    if resp.status == 503:
        return (FAIL, name,
                "503 — the Worker is failing closed: AUTH_COOKIE_SECRET or "
                "AUTH_KV is missing",
                "`npx wrangler secret put AUTH_COOKIE_SECRET`; check "
                "kv_namespaces in wrangler.jsonc — on a Worker Preview URL the "
                "`previews` block needs its own KV id and `wrangler preview "
                "base-config secret put AUTH_COOKIE_SECRET`")
    if resp.status == 404:
        return (FAIL, name, "404 — the /auth/session route is missing",
                "src/pages/auth/session.ts must exist and stay on-demand "
                "(prerender = false)")
    return (FAIL, name, "HTTP {} (expected 401)".format(resp.status),
            "GET /auth/session without a session must answer 401")


def check_gate_no_canonical(ctx):
    """
    Gated only: the lock page is served under every URL, so it must claim no
    canonical URL and no og:url.
    """
    name = "Gated: lock page claims no canonical URL"
    head = ctx["head"]
    if head is None:
        return (FAIL, name, "no homepage HTML to parse",
                "homepage must be reachable")
    claims = []
    for link in head.links:
        if "canonical" in link.get("rel", "").lower().split():
            claims.append("<link rel=\"canonical\">")
    if find_meta(head.metas, prop="og:url") is not None:
        claims.append("og:url")
    if claims:
        return (FAIL, name, "lock page carries " + " and ".join(claims),
                "render src/pages/lock.astro with Layout's `noindex` prop, "
                "which drops canonical and og:url")
    return (PASS, name, "no canonical or og:url on the lock page")
```

- [ ] **Step 5: Make the sitemap check accept a gated sitemap**

In `check_sitemap`, inside `if ctx["stealth"]:` before the `resp.status == 404` test, add:

```python
        if ctx.get("gated") and LOCK_MARKER in resp.body:
            return (PASS, "Sitemap absent (gated)",
                    "sitemap-index.xml is behind the gate")
```

- [ ] **Step 6: Swap the check list in `main`**

Replace the block from `checks = [` through `checks.append(check_indexable)` with:

```python
    checks = [
        check_homepage,
        check_https_redirect,
        check_cloudflare,
        check_security_headers,
        check_hashed_asset,
        check_open_graph,
        check_twitter_card,
        check_gate_no_canonical if args.gated else check_canonical,
        check_site_host,
        check_json_ld,
        check_csp,
        check_sitemap,
        check_robots,
        check_gate_unknown_path if args.gated else check_custom_404,
        check_analytics_beacon,
        check_favicons,
    ]
    if args.gated:
        checks.extend([check_gate_homepage_lock, check_gate_subresource_401,
                       check_gate_auth_session])
    if stealth:
        checks.append(check_robots_meta)
        checks.append(check_xrobots_header)
    else:
        checks.append(check_indexable)
```

- [ ] **Step 7: Run against the gated fixture, expect exit 0**

```bash
python3 -m py_compile skills/astro-cloudflare-workers-setup/scripts/verify_site.py
python3 $S/gate_fixture.py gated 4399 & FX=$!; sleep 1
python3 skills/astro-cloudflare-workers-setup/scripts/verify_site.py --local --gated http://127.0.0.1:4399; echo "exit=$?"
kill $FX
```

Expected: `exit=0`; the five `Gated:` lines PASS; `Sitemap absent (gated)` PASS; WARNs allowed for the analytics beacon and the hashed asset; SKIPs for HTTPS, Cloudflare and served host.

- [ ] **Step 8: Run against the open fixture, expect exit 1 with the "not gated" message**

```bash
python3 $S/gate_fixture.py open 4398 & FX=$!; sleep 1
python3 skills/astro-cloudflare-workers-setup/scripts/verify_site.py --local --gated http://127.0.0.1:4398 | tee /tmp/open.txt; echo "exit=${PIPESTATUS[0]}"
kill $FX
grep -c "is NOT the lock page" /tmp/open.txt
```

Expected: exit 1; the grep prints `1`; `Gated: unknown path`, `Gated: non-document request` and `Gated: /auth/session` all FAIL; `Gated: lock page claims no canonical URL` FAILs on the canonical link.

- [ ] **Step 9: Run against a public site, expect FAILs and no traceback**

```bash
python3 skills/astro-cloudflare-workers-setup/scripts/verify_site.py --gated https://www.cloudflare.com 2>&1 | grep -c Traceback; echo "exit=${PIPESTATUS[0]}"
python3 skills/astro-cloudflare-workers-setup/scripts/verify_site.py https://www.cloudflare.com >/dev/null; echo "standard exit=$?"
```

Expected: `0` tracebacks, exit 1 for the gated run; the standard run still behaves as before (exit 0 or 1, never 2).

- [ ] **Step 10: Update the SKILL.md verifier line and commit**

In `skills/astro-cloudflare-workers-setup/SKILL.md` line 576, change `<url> [--stealth] [--local]` to `<url> [--stealth] [--gated] [--local]` and append to that paragraph: `` `--gated` for a private site made with the `astro-cloudflare-passkey-login` skill (implies `--stealth`). ``

```bash
git add skills/astro-cloudflare-workers-setup/scripts/verify_site.py skills/astro-cloudflare-workers-setup/SKILL.md
git commit -m "verify_site: add --gated for passkey-private sites" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The skill skeleton: SKILL.md, references, stable templates

**Files:**
- Create: `skills/astro-cloudflare-passkey-login/SKILL.md`
- Create: `skills/astro-cloudflare-passkey-login/references/resume.md`
- Create: `skills/astro-cloudflare-passkey-login/references/pitfalls.md`
- Create: `skills/astro-cloudflare-passkey-login/assets/templates/auth.ts.template`
- Create: `skills/astro-cloudflare-passkey-login/assets/templates/allowlist.ts.template`
- Create: `skills/astro-cloudflare-passkey-login/assets/templates/wrangler.additions.jsonc`
- Create: `skills/astro-cloudflare-passkey-login/assets/templates/claude-md-section.md`

**Interfaces:**
- Consumes: `verify_site.py --gated` (Task 1).
- Produces: the step numbers (1–12) and evidence signals that Task 4's lock/invite templates, Task 5's technical design and Task 6's cold test refer to. Template placeholders use the setup skill's `<angle-bracket>` style so its placeholder-leak grep (Step 13 of the setup skill) also catches these: `<apex>`, `<backup-host>`, `<kv-id>`, `<preview-kv-id>`, `<user-1>`, `<user-2>`, `<extra-public-path>`.

- [ ] **Step 1: Write `assets/templates/auth.ts.template`** (becomes `src/data/auth.ts`)

```ts
// Who can sign in, and the sign-in copy. Edit words here, not in page markup.
// Names are lowercase [a-z0-9-], 1–32 chars: they are KV keys and cookie values.

export const USERS = ['<user-1>', '<user-2>'] as const;
export type User = (typeof USERS)[number];

export function isUser(value: unknown): value is User {
  return (
    typeof value === 'string' && (USERS as readonly string[]).includes(value)
  );
}

export const authCopy = {
  lockHeading: 'Sign in',
  unlockLabel: 'Unlock with passkey',
  inviteHeading: 'Hi {name}',
  registerLabel: 'Save my passkey',
  failure: "That didn't work. Try again?",
  inviteUnavailable: 'This invite has already been used or has expired.',
  menu: 'Menu',
  signOut: 'Sign out',
  greeting: 'Hi {name}',
} as const;

/** Fills a `{name}` template from `authCopy`, e.g. `withName(authCopy.greeting, 'ana')` → "Hi ana". */
export function withName(template: string, name: User): string {
  return template.replace('{name}', name);
}
```

- [ ] **Step 2: Write `assets/templates/allowlist.ts.template`** (becomes `src/lib/gate/allowlist.ts`)

```ts
// The public allowlist (technical design §7.2). GET/HEAD only; the Worker checks the method.
// Exact paths only, plus the lock/invite pages' styles, scripts and fonts by extension.
// Images under /_astro/ are never public: private images processed by Astro land there.
// Consequence: private content must never be baked into JS or CSS.

const PUBLIC_FILES = new Set([
  '/favicon.svg',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/robots.txt',
  '/og.webp',
  // Exact paths the lock page needs (a logo, say). Never a directory, never a wildcard.
  // '<extra-public-path>',
]);

const SEGMENT = '[A-Za-z0-9_-][A-Za-z0-9_.-]*';
/** `/_astro/<file>.css|js` (top level) and `/_astro/**\/<file>.woff2`. */
const ASTRO_CODE = new RegExp(`^/_astro/${SEGMENT}\\.(?:css|js)$`);
const ASTRO_FONT = new RegExp(`^/_astro/(?:${SEGMENT}/)*${SEGMENT}\\.woff2$`);

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_FILES.has(pathname)) return true;
  if (
    pathname.includes('..') ||
    pathname.includes('%') ||
    pathname.includes('//')
  )
    return false;
  return ASTRO_CODE.test(pathname) || ASTRO_FONT.test(pathname);
}
```

- [ ] **Step 3: Write `assets/templates/wrangler.additions.jsonc`**

```jsonc
// Merge these keys into the site's wrangler.jsonc with targeted edits (never rewrite the file).
// <apex> = the custom domain from routes[].pattern; <backup-host> = <name>.<subdomain>.workers.dev.
// <kv-id> / <preview-kv-id> come from Step 8 (`wrangler kv namespace create`); leave them out
// until then — build, preview and the dry run work without ids, only a real deploy needs them.
{
  // Custom entry: the gate runs before every request (run_worker_first). See src/worker.ts.
  "main": "./src/worker.ts",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "404-page",
    "run_worker_first": true,
  },
  "kv_namespaces": [{ "binding": "AUTH_KV", "id": "<kv-id>" }],
  "ratelimits": [
    {
      "name": "AUTH_RATE_LIMIT",
      "namespace_id": "1001",
      "simple": { "limit": 10, "period": 60 },
    },
  ],
  "vars": {
    "RP_ID": "<apex>",
    "ORIGIN": "https://<apex>",
    "BACKUP_HOST": "<backup-host>",
  },
  // Worker Previews inherit no vars or bindings. Previews get their own KV namespace and can
  // only ever show the lock page (the RP ID can't match a preview host).
  "previews": {
    "vars": {
      "RP_ID": "<apex>",
      "ORIGIN": "https://<apex>",
      "BACKUP_HOST": "<backup-host>",
    },
    "kv_namespaces": [{ "binding": "AUTH_KV", "id": "<preview-kv-id>" }],
    "ratelimits": [
      {
        "name": "AUTH_RATE_LIMIT",
        "namespace_id": "1002",
        "simple": { "limit": 10, "period": 60 },
      },
    ],
  },
}
```

- [ ] **Step 4: Write `assets/templates/claude-md-section.md`** (appended to the site's `CLAUDE.md`)

```markdown
## Private site: passkey sign-in

Added with the `astro-cloudflare-passkey-login` skill. Every page needs a passkey session; there are no passwords and no identity provider.

**Architecture.** `wrangler.jsonc` `main` is the custom entry `src/worker.ts`, and `assets.run_worker_first: true` runs it before every request. Order: redirect `BACKUP_HOST` to the apex → public allowlist (`src/lib/gate/allowlist.ts`) → `/auth/*` and `/invite/*` to Astro → session check (KV `AUTH_KV`, cookie holds a token, KV holds its SHA-256) → lock page in place (200, `no-store`) for documents, 401 for everything else. The Worker sets every security header itself, including `X-Robots-Tag: noindex, nofollow`; `public/_headers` still applies to asset responses but the Worker is authoritative (`src/lib/gate/headers.ts`).

**Rules that keep the gate working.**
- **At least one route must stay on-demand** (`src/pages/auth/session.ts` is one). An all-prerendered build silently drops `main`. `npm run build` runs `tests/build-guard.test.ts`, which fails the build if that happens.
- **Never put private content in JS or CSS.** `/_astro/*.css|js|woff2` are public by extension because the lock page needs them. Private content goes in HTML, images, KV or on-demand responses.
- **New pages are private by default.** To make one file public, add its exact path to `PUBLIC_FILES` in the allowlist. Never a directory or wildcard.
- **Reserved routes:** `/lock/`, `/auth/*`, `/invite/*`. A catch-all page must reject those slugs.
- **`npm run verify` now lists bindings** (`AUTH_KV`, `AUTH_RATE_LIMIT`, `ASSETS`, vars) and `Configuration being used: "dist/server/wrangler.json"`. `No bindings found.` would mean the gate is gone.
- **The `previews` block is required.** Worker Previews inherit no bindings or vars; they have their own KV namespace and only ever show the lock page.
- `astro.config.mjs` is unchanged: `output: 'static'`, `session: false`, `imageService: 'compile'` and the hashed meta CSP all stay. All client code is Astro-processed `<script>` modules; no inline scripts or `define:vars`.

**Commands.**
| Command | What |
| :-- | :-- |
| `npm test` | Unit tests for the pure auth and gate helpers (`node --test tests/unit/`) |
| `npm run invite -- <name> [--hours <n>]` | Prints a single-use invite URL (default 7 days). Send it over a private channel. |
| `npm run auth:list` | Passkeys, sessions and pending invites |
| `npm run auth:revoke -- --session <id8>` / `--credential <id8>` / `--user <name>` / `--invite <name>` | Revoke one device, one passkey (and its sessions), all of a person's sessions, or their invites |
| `python3 <setup-skill-dir>/scripts/verify_site.py --gated https://<apex>` | Live gate check |

The scripts call `npx wrangler kv key … --binding AUTH_KV --remote` with `$CLOUDFLARE_API_TOKEN` (or the existing wrangler login). `--local` targets the preview's local KV.

**Credentials, by name only.** Worker secret `AUTH_COOKIE_SECRET` on production and in the Previews base config (`npx wrangler preview base-config secret put AUTH_COOKIE_SECRET`). Rotate with `openssl rand -base64 32 | npx wrangler secret put AUTH_COOKIE_SECRET`; in-flight sign-ins (≤5 min) fail once. Local: `.dev.vars` (gitignored) from `.dev.vars.example`. Never `secrets.required` (it blocks the local `RP_ID`/`ORIGIN` overrides); the Worker fails closed instead (503 on `/auth/*`, lock page everywhere).

**Settings** live in `src/lib/auth/config.ts` (session 24 h fixed, invite 7 days, challenge 5 min) and `wrangler.jsonc` (rate limit 10 / 60 s per IP per bucket). Users and copy: `src/data/auth.ts`.

**Rollback.** `npx wrangler rollback` or a revert makes the site public again. Safe only while no private content exists. Once private content ships, roll back only to a gated version.

**Styling the lock page.** `src/pages/lock.astro` and `src/pages/invite/[token].astro` are unstyled on purpose. Keep every `data-*` hook (`data-screen`, `data-part`, `data-auth-action`); style with CSS and use `<html data-auth-state>` (idle, prompting, verifying, success, failure, signing-out), the `auth:state` event, `<html data-arrival="unlock">` (once, on the first page after sign-in) and `<html data-user="<name>">` for your own effects.
```

- [ ] **Step 5: Write `references/resume.md`**

```markdown
# Resuming a half-finished passkey setup

Read this when `src/worker.ts` already exists, or the branch `feat/passkey-login` exists. Gather the evidence in one call, map it to the incomplete step, and resume there. Tell the user what you detected and where you're picking up, and get a one-word confirm.

```bash
git branch --show-current; ls -d src/worker.ts src/data/auth.ts src/pages/lock.astro .dev.vars worker-configuration.d.ts 2>&1; echo "deps:$(grep -c '@simplewebauthn/server' package.json) main:$(grep -c '"main": "./src/worker.ts"' wrangler.jsonc) kv-ids:$(grep -c '"id": "' wrangler.jsonc) types:$(grep -c AUTH_KV worker-configuration.d.ts 2>/dev/null) invite-script:$(npm pkg get scripts.invite)"; npx wrangler secret list 2>/dev/null | grep -c AUTH_COOKIE_SECRET; git log --oneline origin/main -1 2>/dev/null; curl -sI "https://$(grep -o '"pattern": "[^"]*"' wrangler.jsonc | head -1 | cut -d'"' -f4)/" | grep -i '^x-robots-tag'
```

Take the **first** rule that matches:

1. `deps:0` → Step 2
2. no `src/worker.ts` → Step 3
3. no `src/data/auth.ts` or no `src/pages/lock.astro` or `main:0` or `invite-script:{}` → Step 4 (finish the templates and edits; each is idempotent)
4. `types:0` → Step 5
5. `npm test` fails or `npm run verify` prints `No bindings found.` → Step 6
6. `kv-ids:` below 2 or the secret count is `0` → Step 8 (re-run Step 7's local gate check first if the tree changed)
7. the branch isn't on `origin` → Step 9
8. the live `curl` prints no `X-Robots-Tag` → Step 10 (not deployed yet, or the gate is missing on the live Worker)
9. `npm run auth:list` shows no credential → Step 11
10. the site's `CLAUDE.md` has no "Private site: passkey sign-in" section → Step 12; otherwise → *Completion*
```

- [ ] **Step 6: Write `references/pitfalls.md`**

```markdown
# Pitfalls — symptom → root cause → fix

`<skill-dir>` is this skill's directory; `<setup-skill-dir>` is `<skill-dir>/../astro-cloudflare-workers-setup`.

## Build and config

| Symptom | Root cause | Fix |
|---|---|---|
| `npm run verify` prints `No bindings found.` and `dist/client/wrangler.json`; live site is NOT gated | Every route is prerendered, so the adapter wrote an assets-only config and **silently dropped `main`** | Keep at least one `prerender = false` route (`src/pages/auth/session.ts`); `tests/build-guard.test.ts` in `npm run build` catches this — never remove it |
| Build guard: "wrangler.jsonc main has drifted from the custom entry" | `main` was reset to `@astrojs/cloudflare/entrypoints/server` (a re-run of `astro add cloudflare`, or a merge) | set `"main": "./src/worker.ts"` again |
| Preview URL: `/auth/*` returns 503, or the Worker throws about `AUTH_KV` | Worker Previews inherit **no** bindings or vars | the `previews` block in `wrangler.jsonc` needs `vars`, its own `kv_namespaces` id and `ratelimits`; `npx wrangler preview base-config secret put AUTH_COOKIE_SECRET` |
| Wrangler rejects `ratelimits` inside `previews` | schema drift | drop `ratelimits` from `previews` only; the code treats a missing limiter as "no limit" and logs once |
| `wrangler deploy` fails: KV namespace id missing | `kv_namespaces[].id` is optional for build/preview/dry-run but required for a real deploy | Step 8: `wrangler kv namespace create` and paste both ids |
| `wrangler kv namespace create` rewrote `wrangler.jsonc` | newer wrangler offers to add the binding to the config it finds | run it from a directory without a `wrangler.jsonc` (`cd "$(mktemp -d)"`), copy the id by hand |
| `Astro.locals.runtime.env` throws | removed in adapter 14 | `import { env } from 'cloudflare:workers'` (the shipped code already does) |
| TypeScript: `AUTH_KV` / `RateLimit` unknown | types not regenerated after the `wrangler.jsonc` edit | `npm run generate-types` |
| `node --test` fails with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` | Node's strip-only TS rejects enums, namespaces, parameter properties | keep helpers to erasable TypeScript; on Node < 22.18 upgrade (`.nvmrc` says 24) |
| `.dev.vars` ignored / `RP_ID` not overridden locally | `secrets.required` set in `wrangler.jsonc` | remove it; the Worker fails closed on its own |
| Wrangler warns `No environment found in configuration with name "e2e"` | leftover `CLOUDFLARE_ENV` from another project's scripts | harmless; unset it |

## Sign-in behaviour

| Symptom | Root cause | Fix |
|---|---|---|
| Registration prompts for an ML-DSA / post-quantum key, or verification fails on algorithm | SimpleWebAuthn v14 prefers ML-DSA when it detects runtime support | `supportedAlgorithmIDs: [-8, -7, -257]` on both generate and verify (shipped default) |
| Sign-in on `*.workers.dev` fails every time | passkeys are bound to the RP ID (the apex) | expected: the backup host 301s to the apex; previews only ever show the lock page |
| Sign-in fails with the counter error | authenticator reported a counter ≤ the stored one while either is non-zero | a cloned or reset authenticator; revoke the credential (`npm run auth:revoke -- --credential <id8>`) and re-invite |
| Invite link says "already used" before the person opened it | someone (or a preview bot on a **POST**-capable client) consumed it, or it expired | `npm run auth:list`; revoke unexpected credentials; mint a new invite. GET never consumes an invite, so chat unfurls are harmless |
| `_headers` rules don't show on 401s, redirects or JSON | `_headers` never applies to Worker-generated responses | the Worker sets them (`src/lib/gate/headers.ts`); `verify_site.py --gated` checks the 401 |
| A private image loads for a signed-out user from the browser cache | old cache entry | sign-out sends `Clear-Site-Data: "cache"`; gated responses are `private, no-store` / `private, max-age…`; hard refresh once |
| Open redirect on the backup host | building the redirect with `new URL(pathname + search, ORIGIN)` treats `//evil` as a host | set `pathname`/`search` on `new URL(ORIGIN)` (`src/lib/gate/redirect.ts`, shipped) |
| Invite URLs appear in logs | the token is in the path | never log full URLs; the shipped code logs outcome codes and names only |

## Ops scripts

| Symptom | Root cause | Fix |
|---|---|---|
| `npm run invite` writes to local KV, `auth:list` shows nothing on the live site | wrangler `kv` commands default to **local** | the scripts pass `--remote`; use `--local` only against `npm run preview` |
| `npm run invite -- "Tony F"` | names must be lowercase `[a-z0-9-]` (they are KV keys) | use a lowercase name listed in `src/data/auth.ts` |
| `wrangler` opens a browser login | no `$CLOUDFLARE_API_TOKEN` and no saved login | set the token or log in once outside this skill; never `wrangler login` when the token is set |
```

- [ ] **Step 7: Write `SKILL.md`**

```markdown
---
name: astro-cloudflare-passkey-login
description: Makes a live Astro static site on Cloudflare Workers private with passkey-only sign-in — WebAuthn via SimpleWebAuthn, sessions in Workers KV, single-use invite links, a Worker gate that runs before every request, an unstyled lock page, and laptop scripts to invite, list and revoke. No passwords, no identity provider, free plan only. Use on a site built by astro-cloudflare-workers-setup when the user says "make my site private", "add login", "add passkey sign-in", "lock the site", "only I should be able to see it", or asks for authentication on an Astro + Cloudflare Workers site.
---

# Passkey sign-in for an Astro site on Cloudflare Workers

Skill directory: `${CLAUDE_SKILL_DIR}`. Every `references/` and `assets/` path is relative to it. The verifier lives in the sibling skill: `${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/scripts/verify_site.py`.

Turns a **live site built by `astro-cloudflare-workers-setup`** into a private one. After this, every page needs a passkey session; anyone else sees a lock page at every URL. Passkeys only: no passwords, no email, no Google or Cloudflare Access. Two or three people, a handful at most.

**Two roles.** 🤖 Claude runs commands. 👤 The user does browser steps (marked `👤 USER ACTION`): saving a passkey, merging a PR. Each hand-off: state it, wait, verify. Creating account resources (KV namespaces, a secret) is Claude's job but needs the user's one-word OK first.

**Design in one paragraph.** `wrangler.jsonc` `main` becomes a custom Worker entry `src/worker.ts`, run before every request. It redirects the `*.workers.dev` host to the apex, serves a small exact public allowlist, routes `/auth/*` and `/invite/*` to on-demand Astro endpoints, and requires a KV-backed session for everything else. Without one, a document request gets the prerendered lock page **at the requested URL** (200, `no-store`); anything else gets 401. Sessions: random token in a `__Host-` cookie, SHA-256 in KV, fixed 24 h. First passkey per person via a single-use invite link from `npm run invite`. The Worker sets every security header itself, including `X-Robots-Tag: noindex, nofollow`: a private site is never indexed, but link previews still work because the lock page carries the OG tags. Full detail: `references/technical-design.md` (read it only for a deviation or a bug).

**What ships unstyled.** The lock and invite pages carry only data hooks. Tell the user this is by design: "when you want the lock screen designed, ask me". The hooks (`data-auth-state` on `<html>`, the `auth:state` event, `data-arrival="unlock"`, `data-user`) are theirs to build on.

## Preconditions — check, and stop with the reason if any fails

```bash
node -v; grep -c '"assets"' wrangler.jsonc; grep -o '"pattern": "[^"]*"' wrangler.jsonc; grep -c "@astrojs/cloudflare" astro.config.mjs; grep -c "output: 'static'" astro.config.mjs; npm pkg get scripts.build scripts.verify scripts.deploy scripts.generate-types; cat .nvmrc; git status --porcelain | wc -l; npx wrangler whoami --json 2>/dev/null | head -c 300; ls src/worker.ts 2>/dev/null
```

- **Built by the setup skill:** `assets` in `wrangler.jsonc`, the adapter and `output: 'static'` in `astro.config.mjs`, the four npm scripts, `.nvmrc`. Missing → this skill doesn't apply; say so.
- **A custom domain is live:** a `routes[].pattern` exists and `curl -sI https://<apex>/` returns 200. Passkeys bind to that host; a site on `*.workers.dev` alone would strand every passkey the day it gets a domain. No domain → run the setup skill's Step 11 first.
- **Authenticated:** `wrangler whoami --json` shows an account. Token present → never `wrangler login`. Nothing → 👤 ask the user to set `CLOUDFLARE_API_TOKEN` or log in once.
- **Node ≥ 22.18** (`.nvmrc` says 24; the unit tests run `.ts` natively). Clean git tree. `src/worker.ts` already present → `references/resume.md`.

## Confirm inputs (one message)

Read `<apex>` from `routes[].pattern` and `<name>` from `wrangler.jsonc`; `<backup-host>` is `<name>.<subdomain>.workers.dev` (subdomain from `npx wrangler whoami` or the site's `CLAUDE.md`). Confirm them, don't ask. Ask:

1. **Who signs in?** One to ten lowercase names (`[a-z0-9-]`, used as KV keys and in the greeting). Default: the user's first name.
2. **Any extra public files the lock page will show?** Exact paths only (a logo). Default: none.
3. Defaults to state, not ask: sessions 24 h fixed (the lock shows about once a day per device), invites 7 days single-use, 10 attempts / 60 s per IP, Face ID / Touch ID / PIN required at every sign-in, Worker Previews only ever show the lock page, `*.workers.dev` redirects to the apex.

## Steps

### Step 1 — Branch

`git switch -c feat/passkey-login`. Pushing to `main` deploys, so everything lands on the branch until Step 10.

### Step 2 — Dependencies

```bash
npm i @simplewebauthn/server@^14 @simplewebauthn/browser@^14 && npm ls @simplewebauthn/server @simplewebauthn/browser astro @astrojs/cloudflare wrangler --depth=0
```

Expect `@simplewebauthn/*` 14.x, `astro` 7.x, `@astrojs/cloudflare` 14.x, `wrangler` ≥ 4.135. A different major → check the changelog before continuing and tell the user what moved (see *Versions*).

### Step 3 — Copy the code

Only if `src/worker.ts` is absent (the copy overwrites):

```bash
cp -R "${CLAUDE_SKILL_DIR}/assets/site/." . && ls src/worker.ts src/lib/auth src/lib/gate src/pages/auth scripts/auth tests/unit tests/build-guard.test.ts .dev.vars.example
```

### Step 4 — Fill the per-site files

All from `${CLAUDE_SKILL_DIR}/assets/templates/`. Replace every `<placeholder>`; the setup skill's placeholder grep must print nothing afterwards.

- `auth.ts.template` → `src/data/auth.ts`: the names from Q1. Copy strings may be reworded, never removed.
- `allowlist.ts.template` → `src/lib/gate/allowlist.ts`: add Q2's exact paths to `PUBLIC_FILES`. Never a directory or wildcard, never an image under `/_astro/`.
- `lock.astro.template` → `src/pages/lock.astro` and `invite.astro.template` → `src/pages/invite/[token].astro`: set the `Layout` import path and the `title`. Keep every `data-*` hook and the closing `<script>` unchanged.
- `wrangler.additions.jsonc` → **targeted Edits** to `wrangler.jsonc`: set `main`, add `run_worker_first` inside the existing `assets`, add `kv_namespaces` (without `id` for now), `ratelimits`, `vars`, `previews`. Never rewrite the file; keep `compatibility_date`, `routes`, `observability` as they are.
- `package.json`: `"build": "astro check && astro build && node --test tests/build-guard.test.ts"`, `"test": "node --test tests/unit/"`, `"invite": "node scripts/auth/invite.mjs"`, `"auth:list": "node scripts/auth/list.mjs"`, `"auth:revoke": "node scripts/auth/revoke.mjs"`. `verify` and `deploy` are unchanged.
- `.gitignore`: append `.dev.vars*` and `!.dev.vars.example`.
- `src/layouts/Layout.astro`: add `chrome?: 'page' | 'none'` to `Props` (default `'page'`), and inside `<body>` render `<script src="../scripts/arrival.ts"></script>` and `<script src="../scripts/signout.ts"></script>` only when `chrome === 'page'`, before `<slot />`. If the site has a header component, add a `<button type="button" data-auth-action="signout">` to it (unstyled). The lock and invite pages pass `chrome="none"`.
- `public/_headers`: add the comment `# src/worker.ts runs first and sets these same headers on every response it returns; these rules still reach asset responses, but the Worker is authoritative.`
- `.dev.vars` (gitignored) from `.dev.vars.example` with `AUTH_COOKIE_SECRET=$(openssl rand -base64 32)`.

Then `npx prettier --write src wrangler.jsonc --log-level warn`.

### Step 5 — Types

`npm run generate-types`. `worker-configuration.d.ts` must now mention `AUTH_KV`, `AUTH_RATE_LIMIT`, `RP_ID`, `ORIGIN`, `BACKUP_HOST`.

### Step 6 — Unit tests and the dry run

```bash
npm test && npm run verify
```

Expect every test to pass, `astro check` 0 errors, the build guard to pass, and the dry run to print `Configuration being used: "dist/server/wrangler.json"` and a bindings table with `AUTH_KV`, `AUTH_RATE_LIMIT`, `ASSETS` and the three vars. **`No bindings found.` means the gate was dropped**: see `references/pitfalls.md`, first row.

### Step 7 — Local gate check

```bash
npm run preview &
python3 "${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/scripts/verify_site.py" --local --gated http://localhost:4321
curl -sI -H 'Sec-Fetch-Dest: image' http://localhost:4321/x.png | head -1
npx astro preview stop
```

Expect 0 FAIL (SKIPs for HTTPS/Cloudflare are normal) and `HTTP/1.1 401`. Optional 👤 look: open `http://localhost:4321/` and see the unstyled lock page. A local passkey round-trip needs Chrome's virtual authenticator; skip it here, Step 11 does the real one. Commit the step's work.

### Step 8 — Cloudflare resources (🤖, after the user's OK)

Tell the user: two free KV namespaces and one secret will be created on the account. Then:

```bash
cd "$(mktemp -d)" && npx wrangler kv namespace create <name>-auth && npx wrangler kv namespace create <name>-auth-preview; cd -
```

Run from an empty directory so wrangler can't rewrite `wrangler.jsonc`. Paste the two ids into `kv_namespaces[0].id` and `previews.kv_namespaces[0].id`. Then:

```bash
openssl rand -base64 32 | npx wrangler secret put AUTH_COOKIE_SECRET
openssl rand -base64 32 | npx wrangler preview base-config secret put AUTH_COOKIE_SECRET
npx wrangler secret list
```

The secret is never printed or stored anywhere else. `npm run verify` again; the ids don't change its output.

### Step 9 — Push the branch

Commit and `git push -u origin feat/passkey-login`. With Workers Builds connected (setup Step 12), the branch gets a Worker Preview that shows the lock page (👤 optional look; sign-in there is impossible by design). Check the run with the setup skill's `gh api` line for the branch.

### Step 10 — Deploy

👤 **USER ACTION** — merge the branch into `main` (or, without Workers Builds, 🤖 `npm run deploy`). Wait for the **`main`** check run to finish, as in setup Step 12. Then:

```bash
python3 "${CLAUDE_SKILL_DIR}/../astro-cloudflare-workers-setup/scripts/verify_site.py" --gated https://<apex>
curl -sI https://<backup-host>/x | head -3
```

Expect 0 FAIL and a `301` with `location: https://<apex>/x`. **From this moment everyone without a session sees the lock page.**

### Step 11 — Enrol

```bash
npm run invite -- <first-name>
```

👤 **USER ACTION** — open the printed URL on the device that will hold the passkey, tap the button, save the passkey (Face ID / Touch ID / PIN). They land on `/` signed in. Repeat for each name, sending the link over a private channel. Verify with `npm run auth:list`: one credential per person. A second device with a synced passkey (iCloud Keychain, Proton Pass, 1Password…) just signs in; a device without one needs its own invite.

### Step 12 — Docs

Append `assets/templates/claude-md-section.md` (placeholders filled) to the site's `CLAUDE.md`. Add a `CHANGELOG.md` entry ("Private passkey sign-in") and a README line. Commit and push. Tell the user: the site is private, the lock page is unstyled on purpose, and how to invite, list and revoke.

## Completion

- `verify_site.py --gated https://<apex>` → 0 FAIL, and `curl -sI https://<backup-host>/x` → 301.
- `npm run auth:list` shows every person.
- `git status` clean on `main`; `.dev.vars` present locally and ignored.
- The user knows: how to invite someone new, how to revoke a lost device, that rollback past the gate makes the site public, and that `npm run verify` must keep listing bindings.

## Troubleshooting

`references/pitfalls.md`. The three that matter most: an all-prerendered build **silently drops the Worker** (build guard); Worker Previews **inherit nothing** (`previews` block); `_headers` **doesn't apply** to Worker-generated responses (the Worker sets headers).

## Versions (verified 2026-09-28)

| Package | Verified | Floor |
| :-- | :-- | :-- |
| `@simplewebauthn/server` / `browser` | 14.0.3 / 14.0.0 | ^14 (pins `supportedAlgorithmIDs`; v14 otherwise prefers ML-DSA) |
| astro / `@astrojs/cloudflare` / wrangler | 7.3.5 / 14.3.3 / 4.141.0 | the setup skill's floors |
| Node | 24 | 22.18 for `node --test` on `.ts` |
```

- [ ] **Step 8: Validate and commit**

```bash
claude plugin validate . --strict && claude plugin validate .claude-plugin/plugin.json --strict
python3 - <<'EOF'
import re,sys
s=open('skills/astro-cloudflare-passkey-login/SKILL.md').read()
fm=s.split('---')[1]
d=re.search(r'description:\s*(.*)',fm).group(1)
print('description chars:',len(d)); sys.exit(0 if len(d)<=1024 else 1)
EOF
git add skills/astro-cloudflare-passkey-login
git commit -m "Add astro-cloudflare-passkey-login skill: procedure, references, templates" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Expected: both validations pass (a skill with an `assets/` but not yet an `assets/site/` is fine); description ≤ 1024.

---

### Task 3: Pointers in the setup skill, README, manifests and dev CLAUDE.md

**Files:**
- Modify: `skills/astro-cloudflare-workers-setup/SKILL.md` (after line 584, the *Anonymity-first variant* paragraph)
- Modify: `skills/astro-cloudflare-workers-setup/assets/CLAUDE.md.template` (under `## Workflow`)
- Modify: `README.md` (`## What's in the box`, new `## Making a site private`)
- Modify: `.claude-plugin/marketplace.json` (description)
- Modify: `.claude/CLAUDE.md` (layout, principles, rejected list, testing)

**Interfaces:**
- Consumes: the skill name and step numbers from Task 2.
- Produces: nothing code-level; documentation only.

- [ ] **Step 1: Setup SKILL.md pointer**

After the *Anonymity-first variant* paragraph add:

```markdown
## Making a site private

Not part of setup. Once the site is live on its custom domain, the sibling skill **`astro-cloudflare-passkey-login`** adds passkey-only sign-in (a Worker gate, KV sessions, invite links). Don't improvise auth inside this skill; hand off to it.
```

- [ ] **Step 2: CLAUDE.md.template line**

Under `## Workflow` append: `- **Make the site private** (passkey sign-in, no passwords): run the \`astro-cloudflare-passkey-login\` skill from the plugin. It needs the custom domain live first.`

- [ ] **Step 3: README**

In `## What's in the box`, add a bullet: `**astro-cloudflare-passkey-login** — a second skill: makes a finished site private with passkey-only sign-in (WebAuthn, Workers KV sessions, invite links, a Worker gate). Unstyled lock page; free plan only.`

Add before `## Notes`:

```markdown
## Making a site private

Say "make my site private" or "add passkey login" in a site this plugin built. The `astro-cloudflare-passkey-login` skill adds a Worker that runs before every request, serves an unstyled lock page to anyone without a session, and lets exactly the people you name sign in with passkeys. No passwords, no identity provider, nothing to pay for. You invite each person with a single-use link from `npm run invite -- <name>`, and revoke a device with `npm run auth:revoke`. The site's `verify` script keeps checking that the gate is in place, and `verify_site.py --gated` checks it live.
```

- [ ] **Step 4: marketplace.json**

Change the plugin description to: `Take an Astro static site from an empty folder to a live, auto-deploying site on Cloudflare Workers — GitHub repo, first deploy, custom domain, Workers Builds CI/CD, SEO, security headers, accessibility, maintenance — and, optionally, make it private with passkey-only sign-in.`

- [ ] **Step 5: dev `.claude/CLAUDE.md`**

Update *What this repo is*: "A Claude Code **plugin** with two skills: `astro-cloudflare-workers-setup` (empty folder → live site) and `astro-cloudflare-passkey-login` (live site → private site)." In *Repo layout* add the new tree (SKILL.md, references/{technical-design,pitfalls,resume}.md, assets/site/, assets/templates/). Add a section:

```markdown
## The passkey-login skill

- **Provenance.** `assets/site/` is a de-branded copy of the private sign-in built on twofabianos (`feat/private-sign-in`, commit `<hash recorded at Task 4>`). Allowed differences: cookie names `__Host-auth-*`, event `auth:state`, `src/data/auth.ts` as a template, allowlist without `/sw.js`, `/og-v1.png`, `/brand/**`, with `/og.webp`. Any other difference is a porting bug. To update, re-copy from twofabianos and re-apply the renames (Task 4 of `docs/superpowers/plans/2026-09-28-passkey-login-skill.md`).
- **No `scripts/` of its own.** It calls the setup skill's `verify_site.py --gated` by sibling path.
- **Principles:** private = noindex on every response, OG kept for previews; the gate lives in the Worker entry, not middleware; ≥1 on-demand route always (build guard); `previews` block required; the Worker sets headers; fail closed; public by extension never by directory; unstyled lock page; all setup invariants kept.
- **Rejected:** Cloudflare Access, a password gate, Better Auth / Auth.js, Lucia, Playwright in generated sites, path-prefix gating, `secrets.required`, challenges in KV, a `returnTo` parameter.
- **Testing:** the verifier fixture is in the plan (Task 1); the cold test is Task 6: a scratch site from the setup skill's Phase A, then this skill's Steps 1–7, then the negative build-guard run.
```

Update *Releasing* step 1: "Bump the minor when a skill is added."

- [ ] **Step 6: Validate and commit**

```bash
claude plugin validate . --strict && claude plugin validate .claude-plugin/plugin.json --strict
git add -A && git commit -m "Point the setup skill, README and manifests at the passkey-login skill" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Phase 2 — after the `add-login` session reports its build finished and reviewed

### Task 4: Copy and de-brand the assets

**Files:**
- Create: `skills/astro-cloudflare-passkey-login/assets/site/**` (list in spec §3.2)
- Create: `skills/astro-cloudflare-passkey-login/assets/templates/lock.astro.template`, `invite.astro.template`
- Source: `/Users/tonyfabiano/Documents/Cursor/twofabianos` at commit `<final>` (from the report)

**Interfaces:**
- Consumes: twofabianos file layout as in its plan's File map.
- Produces: the byte-identical asset tree that Task 6 copies into a scratch site.

- [ ] **Step 1: Record the source commit and check the branch is at its final state**

```bash
TF=/Users/tonyfabiano/Documents/Cursor/twofabianos
git -C $TF status --porcelain | wc -l      # expect 0
git -C $TF rev-parse HEAD                    # record as <final> in .claude/CLAUDE.md
git -C $TF log --oneline -3
```

- [ ] **Step 2: Copy the site-agnostic files**

```bash
A=skills/astro-cloudflare-passkey-login/assets/site
mkdir -p $A/src/lib $A/src/pages $A/src/scripts $A/scripts $A/tests/unit
cp -R $TF/src/worker.ts $A/src/
cp -R $TF/src/lib/auth $TF/src/lib/gate $A/src/lib/
cp -R $TF/src/pages/auth $A/src/pages/
cp $TF/src/scripts/{hooks,auth-flow,signout,arrival}.ts $A/src/scripts/
cp -R $TF/scripts/auth $A/scripts/
cp $TF/tests/build-guard.test.ts $A/tests/
cp -R $TF/tests/unit/. $A/tests/unit/
cp $TF/.dev.vars.example $A/
rm -f $A/src/lib/gate/allowlist.ts                     # it's a template (Task 2)
rm -rf $A/tests/unit/visual* $A/tests/unit/*constellation* 2>/dev/null
find $A -type f | sort
```

Do **not** copy: `src/data/auth.ts` (template), `src/lib/gate/allowlist.ts` (template), `src/scripts/unlock-visual.ts`, `src/styles/*`, `src/components/*`, `tests/e2e/**`, `playwright.config.ts`, `.dev.vars.e2e`, any `visual` test.

- [ ] **Step 3: Apply the de-branding renames**

```bash
grep -rl "__Host-tf-\|tf:auth-state" $A | xargs sed -i '' -e 's/__Host-tf-/__Host-auth-/g' -e 's/tf:auth-state/auth:state/g'
grep -rn "tf-\|tf:\|tony\|emily\|twofabianos\|Constellation\|brand/\|sw\.js\|og-v1" $A || echo "clean"
```

Expected: the second grep prints `clean`. Anything it prints is a leftover to fix by hand (a comment naming twofabianos → generic wording; a test asserting `'tony'` → use a name from a local `USERS` fixture).

- [ ] **Step 4: Fix imports that reached `src/data/auth.ts` or `src/data/site.ts`**

```bash
grep -rn "data/auth\|data/site" $A
```

Every hit must resolve in a generated site: `src/data/auth.ts` (template, Step 4 of the skill) and `src/data/site.ts` (the setup skill's copy module, which exports `name`). If `config.ts` reads `site.name` for `rpName`, keep it; the setup skill guarantees `site.name` exists. Note this contract in the skill's Step 4 if any other export is used.

- [ ] **Step 5: Write the lock and invite templates from the twofabianos pages**

Copy `$TF/src/pages/lock.astro` and `$TF/src/pages/invite/[token].astro`. Remove the `Constellation` import and element and every visual import; keep the frontmatter logic, the `<main data-screen=…>` block with `h1[data-part=heading]`, `button[data-auth-action]`, `span[data-part=label]`, `p[data-part=failure]`, and the closing `<script>` that mounts the flow. Replace `<Layout noindex chrome="none">` with `<Layout title="<site-name>" noindex chrome="none">` (the setup skill's `Layout` requires `title`). Save as `assets/templates/lock.astro.template` and `assets/templates/invite.astro.template`.

- [ ] **Step 6: Provenance diff**

```bash
for f in $(cd $A && find . -type f ! -path './tests/*' | sed 's|^\./||'); do
  src=$TF/$f; [ -f "$src" ] || { echo "NO SOURCE: $f"; continue; }
  diff <(sed -e 's/__Host-tf-/__Host-auth-/g' -e 's/tf:auth-state/auth:state/g' "$src") "$A/$f" >/dev/null || echo "DIFFERS: $f"
done
```

Expected: no output. A `DIFFERS` line must be explained by a hand fix from Step 3 and recorded in the commit message.

- [ ] **Step 7: Commit**

```bash
git add skills/astro-cloudflare-passkey-login/assets
git commit -m "passkey-login: ship the auth and gate code as assets (from twofabianos <final>)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `references/technical-design.md` and the pitfalls follow-up

**Files:**
- Create: `skills/astro-cloudflare-passkey-login/references/technical-design.md`
- Modify: `skills/astro-cloudflare-passkey-login/references/pitfalls.md`

- [ ] **Step 1: Copy and de-brand the technical spec**

```bash
cp $TF/docs/superpowers/specs/2026-09-28-private-sign-in-technical-design.md skills/astro-cloudflare-passkey-login/references/technical-design.md
```

Edit: title → `# Passkey sign-in: technical design`; remove the status line and the link to the overview and visual spec; replace `twofabianos.com` → `<apex>`, `twofabianos.tony-935.workers.dev` → `<backup-host>`, `tony`/`emily` → `<user>`, `__Host-tf-` → `__Host-auth-`, `tf:auth-state` → `auth:state`, `og-v1.png` → `og.webp`; delete §7.2's brand rows and the `/sw.js` row; delete §6.3's visual sentences that describe the bloom (keep the arrival-cookie mechanism); delete §12 (docs to update) and §14 (Tony's decisions) after folding their values into §5.5 and §8.2 as the defaults; keep §13 *Verified facts* whole, with the date. Add at the top: `Read this only for a deviation from the shipped code or when debugging. The procedure is SKILL.md.`

```bash
grep -n "twofabianos\|tony\|emily\|tf-\|tf:\|bloom\|Constellation\|Proton" skills/astro-cloudflare-passkey-login/references/technical-design.md || echo clean
```

Expected: `clean` (a "Proton Pass" mention as an example of a synced passkey manager is allowed; rewrite it as "a synced passkey manager (iCloud Keychain, Proton Pass, 1Password)").

- [ ] **Step 2: Fold the follow-up pitfalls in**

Add every new symptom from the `add-login` follow-up report to `references/pitfalls.md` in the same three-column form. Record whether `ratelimits` inside `previews` deployed cleanly; if it did, delete that pitfall row and the "if Wrangler rejects" sentence in `technical-design.md` §8.2.

- [ ] **Step 3: Commit**

```bash
git add skills/astro-cloudflare-passkey-login/references
git commit -m "passkey-login: technical design reference and pitfalls" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Cold test in a scratch site

**Files:** none in the repo (a temp directory; findings become fixes in Tasks 2, 4 or 5).

- [ ] **Step 1: Build a scratch site with the setup skill's Phase A**

```bash
T=$(mktemp -d /tmp/pk-scratch-XXXX) && echo $T
```

Run a fresh agent: `claude --plugin-dir /Users/tonyfabiano/Documents/Cursor/astro-cloudflare-workers-setup` in `$T`, prompt: "Run astro-cloudflare-workers-setup Phase A only (Steps 1–9), no GitHub repo (skip `gh repo create`, just `git init -b main`), site name 'Scratch Passkey', type portfolio, indexable, Node as installed. Stop after `npm run verify` passes." Expect `Complete!` and `No bindings found.`

- [ ] **Step 2: Run the passkey skill's Steps 1–7**

Same agent or a fresh one in `$T`: "Run astro-cloudflare-passkey-login Steps 1–7 only. The precondition 'custom domain live' will fail because this is a scratch site: for this test only, treat `<apex>` as `scratch.example` and `<backup-host>` as `scratch-passkey.example.workers.dev`, and continue. Users: ana, ben." Expect: the agent **stops at the precondition and says why** before the override is given (Review Focus 3); then `npm test` passes; `npm run verify` prints `dist/server/wrangler.json` and the bindings table with `AUTH_KV`; `verify_site.py --local --gated http://localhost:4321` → 0 FAIL; the placeholder grep prints nothing.

- [ ] **Step 3: Negative checks**

```bash
cd $T
npm run invite -- "Ana B" --local; echo "exit=$?"            # expect non-zero, a lowercase-name message
mv src/pages/auth /tmp/auth-bak && mv src/pages/invite /tmp/invite-bak
npm run build; echo "exit=$?"                                 # expect the build guard to FAIL (main dropped)
mv /tmp/auth-bak src/pages/auth && mv /tmp/invite-bak src/pages/invite
npm run build; echo "exit=$?"                                 # expect 0
```

- [ ] **Step 4: Token cost and validation**

```bash
cd /Users/tonyfabiano/Documents/Cursor/astro-cloudflare-workers-setup
claude --plugin-dir . plugin details astro-cloudflare-passkey-login
claude plugin validate . --strict && claude plugin validate .claude-plugin/plugin.json --strict
```

Record the on-invoke token count in `.claude/CLAUDE.md` *Testing a change* (target: under 8k). If higher, trim SKILL.md's design paragraph and move detail to `references/technical-design.md`.

- [ ] **Step 5: Fix what the cold test found, re-run the failing step, commit**

Each fix goes in the file that owns it (SKILL.md wording, a template, a pitfall). Commit: `passkey-login: fixes from the cold run`.

---

### Task 7: Release 2.1.0

**Files:**
- Modify: `.claude-plugin/plugin.json` (`version`)
- Modify: `README.md` (`## What's new in 2.1`)
- Modify: `.claude/CLAUDE.md` (provenance hash, token cost)

- [ ] **Step 1: Bump and document**

Set `"version": "2.1.0"`. Add to README a `## What's new in 2.1` section above `## What's new in 2.0`: the new skill, `verify_site.py --gated`. Fill the `<hash recorded at Task 4>` in `.claude/CLAUDE.md`.

- [ ] **Step 2: Validate, commit, tag, update the owner's install**

```bash
claude plugin validate . --strict && claude plugin validate .claude-plugin/plugin.json --strict
git add -A && git commit -m "astro-cloudflare-workers-setup v2.1.0: add astro-cloudflare-passkey-login" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
claude plugin tag --dry-run && claude plugin tag --push
claude plugin marketplace update kanjidoc && claude plugin update astro-cloudflare-workers-setup@kanjidoc
```

Expected: tag `astro-cloudflare-workers-setup--v2.1.0` on origin; `/reload-plugins` or a restart shows both skills.
