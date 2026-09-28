#!/usr/bin/env python3
"""
verify_site.py — verifier for Astro static sites on Cloudflare Workers.

Fetches a live site (or a local preview) and asserts it is correctly and
canonically configured: HTTPS + the http->https redirect + Cloudflare edge,
security headers from public/_headers, immutable hashed assets, OG/Twitter
metadata, canonical link, URLs on the served host (Astro `site`), JSON-LD, a
Content-Security-Policy (meta tag or header), sitemap, robots.txt, a real
custom 404 page, the Web Analytics beacon (and that the CSP allows it),
favicons, and that a public site carries no stray noindex.

Usage:
    python3 verify_site.py https://example.com
    python3 verify_site.py https://example.com --stealth
    python3 verify_site.py https://example.com --gated
    python3 verify_site.py --local http://localhost:4321

The --local flag checks a local `npm run preview` (workerd) before deploying:
HTTPS, the Cloudflare edge, the served-host check, and fetches of absolute
URLs on another host (the og:image on the production host) are reported as
SKIP, not FAIL. Everything else (headers from _headers, CSP, 404, sitemap,
robots, beacon, favicons) is checked. Only localhost URLs are accepted.

The --stealth flag targets the "coming soon" / anonymity variant: it expects a
noindex robots meta tag AND an `X-Robots-Tag: noindex` header, expects NO
sitemap, and downgrades the OG / JSON-LD checks to warnings. robots.txt must
stay crawlable: a `Disallow: /` for all agents is a WARN, because crawlers
that cannot fetch a page never see its noindex.

The --gated flag targets a private site made with astro-cloudflare-passkey-login.
It implies --stealth (noindex everywhere) and replaces the canonical and 404
checks: with no session, every document request must serve the lock page in
place (200, no-store, noindex) with no canonical, a non-document request must
get 401 with the security headers, and /auth/session must answer 401.

Exit codes:
    0  no check failed (warnings may be present)
    1  at least one check failed
    2  invalid input, or the homepage could not be reached at all

Python 3.9+, standard library only. No third-party dependencies.
"""

import argparse
import http.client
import json
import random
import re
import socket
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TIMEOUT = 15  # seconds, applied to every network call
USER_AGENT = (
    "Mozilla/5.0 (compatible; AstroCloudflareVerifier/2.0; "
    "+https://github.com/kanjidoc/astro-cloudflare-workers-setup) verify_site.py"
)
MAX_REDIRECTS = 5

# Result status constants.
PASS = "PASS"
FAIL = "FAIL"
WARN = "WARN"
SKIP = "SKIP"  # --local only: a check that cannot pass before deploy

LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")
BEACON_MARKER = "cloudflareinsights.com/beacon"
LOCK_MARKER = 'data-screen="lock"'  # the passkey-login lock page's hook
GATE_HEADERS = ("strict-transport-security", "x-content-type-options",
                "x-frame-options", "referrer-policy", "permissions-policy")


# ---------------------------------------------------------------------------
# Terminal output helpers
# ---------------------------------------------------------------------------

class Style:
    """ANSI styling that degrades to plain text on non-TTY output."""

    def __init__(self, enabled):
        self.enabled = enabled

    def _wrap(self, code, text):
        if not self.enabled:
            return text
        return "\033[{}m{}\033[0m".format(code, text)

    def green(self, text):
        return self._wrap("32", text)

    def red(self, text):
        return self._wrap("31", text)

    def yellow(self, text):
        return self._wrap("33", text)

    def bold(self, text):
        return self._wrap("1", text)

    def dim(self, text):
        return self._wrap("2", text)


# ---------------------------------------------------------------------------
# Result accumulation
# ---------------------------------------------------------------------------

class Results:
    """Collects per-check outcomes and renders them as they happen."""

    def __init__(self, style):
        self.style = style
        self.items = []  # list of (status, name)

    def record(self, status, name, detail="", hint=""):
        """Record a single check result and print it immediately."""
        self.items.append((status, name))
        marker = self._marker(status)
        line = "{} {}".format(marker, name)
        if detail:
            line += " — {}".format(detail)
        print(line)
        # Show a fix hint for failures and warnings, indented under the line.
        if status in (FAIL, WARN) and hint:
            print("       {} {}".format(self.style.dim("hint:"), hint))

    def _marker(self, status):
        if status == PASS:
            return self.style.green("[PASS]")
        if status == FAIL:
            return self.style.red("[FAIL]")
        if status == SKIP:
            return self.style.dim("[SKIP]")
        return self.style.yellow("[WARN]")

    @property
    def passed(self):
        return sum(1 for s, _ in self.items if s == PASS)

    @property
    def failed(self):
        return sum(1 for s, _ in self.items if s == FAIL)

    @property
    def warnings(self):
        return sum(1 for s, _ in self.items if s == WARN)

    @property
    def skipped(self):
        return sum(1 for s, _ in self.items if s == SKIP)


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

class Response:
    """A lightweight, normalized view of an HTTP response."""

    def __init__(self, status, headers, body, final_url):
        self.status = status
        # Header lookups are case-insensitive.
        self.headers = {k.lower(): v for k, v in headers}
        self.body = body  # str (decoded) or "" on error/empty
        self.final_url = final_url

    def header(self, name):
        return self.headers.get(name.lower(), "")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """
    A redirect handler that refuses to auto-follow 3xx responses.

    The default ``urllib.request.urlopen`` transparently follows redirects,
    which would hide the true status of a route from a check. Returning
    ``None`` from ``redirect_request`` tells urllib not to follow the redirect;
    the 3xx is then raised as an ``HTTPError``, which ``fetch()`` turns into a
    normal Response.
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


# A single opener, reused for every request, that never auto-follows redirects.
# fetch() decides whether to follow them based on its follow_redirects argument.
_OPENER = urllib.request.build_opener(_NoRedirect)


def fetch(url, method="GET", follow_redirects=True, extra_headers=None):
    """
    Fetch a URL and return a normalized Response, or raise on a network-level
    failure (DNS, TLS, timeout, connection reset, malformed URL).

    Redirects are never auto-followed by urllib here (see ``_NoRedirect``).
    Instead this function decides what to do with a 3xx:

      * ``follow_redirects=True`` (default) -- follow redirects manually, capped
        by ``MAX_REDIRECTS``, and return the final response.
      * ``follow_redirects=False`` -- return the 3xx response as-is, so a caller
        can observe that a route redirected (the 404 and http->https checks).

    HTTP error statuses (404, 500, ...) are always returned as a Response, not
    raised. TLS uses urllib's default verified context.
    """
    current = url
    seen_redirects = 0

    while True:
        request = urllib.request.Request(current, method=method)
        request.add_header("User-Agent", USER_AGENT)
        request.add_header("Accept", "*/*")
        for key, value in (extra_headers or {}).items():
            request.add_header(key, value)

        try:
            with _OPENER.open(request, timeout=TIMEOUT) as resp:
                raw = resp.read()
                return Response(
                    resp.status, list(resp.getheaders()), _decode(raw),
                    resp.geturl()
                )
        except urllib.error.HTTPError as err:
            # Every 3xx arrives here (see _NoRedirect). When following is
            # requested, chase the Location header manually; otherwise return
            # the 3xx unchanged so the caller can see it.
            is_redirect = err.code in (301, 302, 303, 307, 308)
            if (
                follow_redirects
                and is_redirect
                and seen_redirects < MAX_REDIRECTS
            ):
                location = err.headers.get("Location")
                if location:
                    current = urllib.parse.urljoin(current, location)
                    seen_redirects += 1
                    continue
            raw = err.read() if err.fp is not None else b""
            return Response(
                err.code, list(err.headers.items()), _decode(raw), current
            )


def _decode(raw):
    """Decode response bytes to text, tolerating unknown/odd encodings."""
    if not raw:
        return ""
    for encoding in ("utf-8", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def get_path(ctx, path):
    """
    Fetch a same-site path once per run and cache it (robots.txt and the
    sitemap are read by more than one check). Re-raises a cached fetch error.
    """
    cache = ctx.setdefault("_cache", {})
    if path not in cache:
        url = urllib.parse.urljoin(ctx["base"], path)
        try:
            cache[path] = (fetch(url), None)
        except Exception as err:  # network-dependent
            cache[path] = (None, err)
    resp, err = cache[path]
    if err is not None:
        raise err
    return resp


# ---------------------------------------------------------------------------
# HTML parsing
# ---------------------------------------------------------------------------

class HeadParser(HTMLParser):
    """
    Extracts the elements we care about from a document's <head>:
      - <meta> tags        -> list of attribute dicts
      - <link> tags        -> list of attribute dicts
      - <script> blocks    -> list of (attribute dict, text content)
      - <title> text

    Parsing stops being recorded once </head> is seen, so a stray <meta> in the
    body cannot satisfy a head-only check.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.metas = []
        self.links = []
        self.scripts = []
        self.title = ""
        self._in_head = True
        self._in_title = False
        self._in_script = False
        self._script_attrs = {}
        self._script_buf = []

    def handle_starttag(self, tag, attrs):
        attr_dict = {k.lower(): (v or "") for k, v in attrs}
        if tag == "meta" and self._in_head:
            self.metas.append(attr_dict)
        elif tag == "link" and self._in_head:
            self.links.append(attr_dict)
        elif tag == "title" and self._in_head:
            self._in_title = True
        elif tag == "script" and self._in_head:
            self._in_script = True
            self._script_attrs = attr_dict
            self._script_buf = []

    def handle_endtag(self, tag):
        if tag == "head":
            self._in_head = False
        elif tag == "title":
            self._in_title = False
        elif tag == "script" and self._in_script:
            self.scripts.append((self._script_attrs, "".join(self._script_buf)))
            self._in_script = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif self._in_script:
            self._script_buf.append(data)


def parse_head(html):
    """Parse an HTML document and return a populated HeadParser."""
    parser = HeadParser()
    try:
        parser.feed(html)
    except Exception:
        # html.parser is forgiving, but never let a parse error abort a run.
        pass
    return parser


def find_meta(metas, *, name=None, prop=None, http_equiv=None):
    """Return the first <meta> dict matching the given attribute, or None."""
    for meta in metas:
        if name is not None and meta.get("name", "").lower() == name.lower():
            return meta
        if prop is not None and meta.get("property", "").lower() == prop.lower():
            return meta
        if (
            http_equiv is not None
            and meta.get("http-equiv", "").lower() == http_equiv.lower()
        ):
            return meta
    return None


# ---------------------------------------------------------------------------
# Small predicate helpers
# ---------------------------------------------------------------------------

def is_absolute_https(value):
    """True if value is an absolute https:// URL."""
    if not value:
        return False
    parsed = urllib.parse.urlparse(value.strip())
    return parsed.scheme == "https" and bool(parsed.netloc)


def host_of(url):
    """Lower-cased hostname of a URL, or '' if it has none."""
    return urllib.parse.urlparse((url or "").strip()).hostname or ""


def served_host(ctx):
    """The host the homepage was actually served from (after redirects)."""
    return host_of(ctx["home"].final_url if ctx["home"] else ctx["base"])


def off_host(ctx, url):
    """--local only: the host of an absolute URL that is not the served host."""
    if not ctx["local"]:
        return None
    host = host_of(url)
    return host if host and host != host_of(ctx["base"]) else None


def max_age_seconds(cache_control):
    """Extract the max-age value (seconds) from a Cache-Control header."""
    match = re.search(r"max-age\s*=\s*(\d+)", cache_control, re.IGNORECASE)
    return int(match.group(1)) if match else None


def has_noindex(value):
    """True if a robots meta / X-Robots-Tag value contains noindex (or none)."""
    tokens = re.split(r"[\s,:]+", (value or "").lower())
    return "noindex" in tokens or "none" in tokens


def robots_meta_values(head):
    """Content of every robots / googlebot meta tag in the <head>."""
    if head is None:
        return []
    return [
        m.get("content", "") for m in head.metas
        if m.get("name", "").lower() in ("robots", "googlebot")
    ]


def csp_policies(ctx):
    """
    Every enforced CSP on the homepage as (source, policy) pairs: the
    `Content-Security-Policy` response header and/or the meta tag. Browsers
    enforce all of them, so a resource must be allowed by each one.
    """
    policies = []
    resp, head = ctx["home"], ctx["head"]
    if resp is not None and resp.header("content-security-policy"):
        policies.append(("header", resp.header("content-security-policy")))
    if head is not None:
        for meta in head.metas:
            if (meta.get("http-equiv", "").lower() == "content-security-policy"
                    and meta.get("content")):
                policies.append(("meta", meta["content"]))
    return policies


def csp_directive(policy, name):
    """Lower-cased source list of one CSP directive, or None if absent."""
    for part in policy.split(";"):
        tokens = part.strip().split()
        if tokens and tokens[0].lower() == name:
            return [t.lower() for t in tokens[1:]]
    return None


def csp_allows_host(sources, host):
    """True if a CSP source list admits an https URL on `host`."""
    return any(host in t or t in ("https:", "*") for t in sources)


def robots_groups(text):
    """
    Parse robots.txt into {agent: [(rule, path), ...]}, MERGING the rules of
    every group that names the same agent (RFC 9309). Agent names compare
    case-insensitively. Cloudflare's managed robots.txt prepends its own
    `User-Agent: *` group, so a first-group-only parser would miss the site's.
    """
    groups, agents, last = {}, [], None
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if ":" not in line:
            continue
        key, value = [s.strip() for s in line.split(":", 1)]
        key = key.lower()
        if key == "user-agent":
            if last != "ua":
                agents = []
            agents.append(value.lower())
            last = "ua"
            for agent in agents:
                groups.setdefault(agent, [])
        elif key in ("allow", "disallow") and agents:
            for agent in agents:
                groups[agent].append((key, value))
            last = "rule"
    return groups


def robots_blocks_all(text):
    """True if the merged `*` group disallows the whole site."""
    star = robots_groups(text).get("*", [])
    whole = ("/", "/*")
    return (any(k == "disallow" and v in whole for k, v in star)
            and not any(k == "allow" and v in whole for k, v in star))


def looks_like_html(body):
    head = (body or "").lstrip().lower()
    return head.startswith("<!doctype html") or head.startswith("<html")


# ---------------------------------------------------------------------------
# Individual checks
#
# Each check returns (status, name[, detail[, hint]]) and is wrapped by
# run_check() so a thrown exception becomes a FAIL instead of aborting the run.
# ---------------------------------------------------------------------------

def check_homepage(ctx):
    """Homepage returns HTTP 200 over HTTPS."""
    resp = ctx["home"]
    if resp is None:
        return (FAIL, "Homepage reachable over HTTPS",
                "could not fetch homepage",
                "confirm the site is deployed and the domain resolves")
    if ctx["local"]:
        if resp.status != 200:
            return (FAIL, "Homepage returns 200 (local)",
                    "got HTTP {}".format(resp.status),
                    "the homepage route should return 200")
        return (PASS, "Homepage returns 200 (local; HTTPS checked after "
                "deploy)", resp.final_url)
    if not resp.final_url.startswith("https://"):
        return (FAIL, "Homepage reachable over HTTPS",
                "final URL is not https: " + resp.final_url,
                "ensure HTTPS is enabled and HTTP redirects to HTTPS")
    if resp.status != 200:
        return (FAIL, "Homepage reachable over HTTPS",
                "got HTTP {}".format(resp.status),
                "the homepage route should return 200")
    return (PASS, "Homepage returns 200 over HTTPS", resp.final_url)


def check_https_redirect(ctx):
    """Plain http:// on the served host redirects to https:// (advisory)."""
    name = "HTTP redirects to HTTPS"
    if ctx["local"]:
        return (SKIP, name, "not checkable before deploy")
    host = served_host(ctx)
    try:
        resp = fetch("http://{}/".format(host), follow_redirects=False)
    except Exception as err:  # network-dependent
        return (WARN, name, "could not fetch http://{}/: {}".format(host, err))
    location = resp.header("location")
    if 300 <= resp.status < 400 and location.lower().startswith("https://"):
        if resp.status in (301, 308):
            return (PASS, name, "HTTP {} -> {}".format(resp.status, location))
        return (WARN, name,
                "HTTP {} (temporary) -> {}".format(resp.status, location),
                "prefer a permanent 301/308 redirect to HTTPS")
    detail = "http://{}/ returned HTTP {} without an https redirect".format(
        host, resp.status)
    if host.endswith(".workers.dev"):
        # workers.dev has no zone settings; nothing for the user to turn on.
        return (WARN, name, detail,
                "expected on *.workers.dev (not configurable); HSTS covers "
                "repeat visits. A custom domain can redirect via Always Use "
                "HTTPS")
    return (WARN, name, detail,
            "turn on Always Use HTTPS for the zone (SSL/TLS -> Edge "
            "Certificates); HSTS only protects repeat visits")


def check_cloudflare(ctx):
    """The `server` header identifies Cloudflare."""
    if ctx["local"]:
        return (SKIP, "Served by Cloudflare", "not checkable before deploy")
    resp = ctx["home"]
    if resp is None:
        return (FAIL, "Served by Cloudflare", "homepage is unreachable",
                "confirm the site is deployed and the domain resolves")
    server = resp.header("server")
    if "cloudflare" in server.lower():
        return (PASS, "Served by Cloudflare", "server: " + server)
    return (FAIL, "Served by Cloudflare",
            "server header is {!r}".format(server or "(missing)"),
            "the domain may not be proxied through Cloudflare (orange-cloud)")


def check_security_headers(ctx):
    """
    Required security headers are present on the homepage. A CSP *header*
    with frame-ancestors stands in for X-Frame-Options (a meta CSP can't carry
    frame-ancestors). Legacy X-XSS-Protection and HSTS preload are WARNs.
    """
    name = "Security headers present"
    resp = ctx["home"]
    if resp is None:
        return (FAIL, name, "no homepage response",
                "homepage must be reachable")

    required = {
        "strict-transport-security": None,
        "x-content-type-options": "nosniff",
        "x-frame-options": None,
        "referrer-policy": None,
        "permissions-policy": None,
    }
    missing = []
    wrong = []
    for header, expected_substr in required.items():
        value = resp.header(header)
        if not value:
            missing.append(header)
        elif expected_substr and expected_substr not in value.lower():
            wrong.append("{} should contain {!r}".format(header, expected_substr))

    xfo_note = ""
    if ("x-frame-options" in missing and csp_directive(
            resp.header("content-security-policy"), "frame-ancestors")
            is not None):
        missing.remove("x-frame-options")
        xfo_note = " (frame-ancestors in the CSP header replaces X-Frame-Options)"

    advisories = []
    xxss = resp.header("x-xss-protection").strip()
    if xxss and not xxss.startswith("0"):
        advisories.append("X-XSS-Protection is {!r}: remove it or set '0' "
                          "(the legacy filter can introduce XSS)".format(xxss))
    if "preload" in resp.header("strict-transport-security").lower():
        advisories.append("HSTS has 'preload': opt-in only — remove it unless "
                          "you mean to submit to hstspreload.org (removal "
                          "takes months)")

    if missing or wrong:
        problems = []
        if missing:
            problems.append("missing: " + ", ".join(missing))
        problems.extend(wrong)
        problems.extend(advisories)
        return (FAIL, name, " / ".join(problems),
                "add them to the `/*` block of public/_headers (the adapter "
                "and middleware can't set headers on prerendered pages)")
    if advisories:
        return (WARN, name, " / ".join(advisories),
                "edit the `/*` block of public/_headers")
    return (PASS, name, "all 5 headers found" + xfo_note)


def check_hashed_asset(ctx):
    """
    A content-hashed /_astro/ asset (css, js, image or font, including srcset
    entries) is served with an immutable, long-lived Cache-Control header.
    """
    name = "Hashed asset is immutable & long-cached"
    resp = ctx["home"]
    if resp is None or not resp.body:
        return (FAIL, name, "no homepage HTML to scan",
                "homepage must be reachable")

    # Targeted regex: locate one hashed asset URL referenced by the homepage.
    match = re.search(
        r'(?:["\'(,]|\s)((?:https?://[^/"\'\s]+)?/_astro/[^"\'()\s,?#]+'
        r'\.[a-z0-9]{2,5})(?=[\s"\'?#),]|$)',
        resp.body, re.IGNORECASE,
    )
    if not match:
        return (WARN, name,
                "no hashed /_astro/ asset referenced on the homepage — nothing "
                "to verify (normal for a JS-free page without <Image>/fonts)")

    asset_url = urllib.parse.urljoin(resp.final_url, match.group(1))
    try:
        asset = fetch(asset_url)
    except Exception as err:  # network-dependent
        return (FAIL, name, "could not fetch {}: {}".format(asset_url, err),
                "ensure /_astro/ assets are deployed")

    if asset.status != 200:
        return (FAIL, name,
                "{} returned HTTP {}".format(asset_url, asset.status),
                "the hashed asset should return 200")

    cache_control = asset.header("cache-control")
    age = max_age_seconds(cache_control)
    if "immutable" not in cache_control.lower():
        return (FAIL, name,
                "Cache-Control lacks 'immutable': {!r}".format(cache_control),
                "serve /_astro/* with 'Cache-Control: public, max-age=31536000, "
                "immutable' (add it to public/_headers)")
    if age is None or age < 86400:
        return (FAIL, name,
                "max-age is too short: {!r}".format(cache_control),
                "use a long max-age (e.g. 31536000) for content-hashed assets")
    return (PASS, name, "max-age={}, immutable".format(age))


def check_open_graph(ctx):
    """
    Open Graph tags present; og:url and og:image must be absolute https URLs,
    and og:image must actually resolve (HTTP 200 with an image Content-Type).
    Downgraded to WARN-only in stealth mode.
    """
    fail_status = WARN if ctx["stealth"] else FAIL
    name = "Open Graph tags"
    head = ctx["head"]
    if head is None:
        return (fail_status, name, "no homepage HTML to parse",
                "homepage must be reachable")

    required = ["og:title", "og:type", "og:url", "og:image"]
    if ctx.get("gated"):
        # The lock page is served under every URL, so it carries no og:url.
        required.remove("og:url")
    found = {}
    for prop in required:
        meta = find_meta(head.metas, prop=prop)
        found[prop] = meta.get("content", "") if meta else None

    missing = [p for p in required if not found[p]]
    if missing:
        return (fail_status, name, "missing: " + ", ".join(missing),
                "add Open Graph <meta property=\"og:*\"> tags to the <head>")

    not_absolute = [
        p for p in ("og:url", "og:image")
        if p in found and not is_absolute_https(found[p])
    ]
    if not_absolute:
        return (fail_status, name,
                "not absolute https URLs: " + ", ".join(not_absolute),
                "og:url and og:image must be absolute https:// URLs, not "
                "relative paths")

    # A social card pointing at a missing image renders blank when shared.
    og_image = found["og:image"].strip()
    if off_host(ctx, og_image):
        return (SKIP, name, "all 4 tags present and absolute; og:image is on "
                "{}, not checkable before deploy".format(off_host(ctx, og_image)))
    try:
        image = fetch(og_image)
    except Exception as err:
        return (fail_status, name,
                "og:image does not load: {} ({})".format(og_image, err),
                "the og:image URL must resolve to a real, reachable image")
    if image.status != 200:
        return (fail_status, name,
                "og:image returned HTTP {}: {}".format(image.status, og_image),
                "the og:image URL must return HTTP 200 — it is currently "
                "broken")
    content_type = image.header("content-type").lower().strip()
    if not content_type.startswith("image/"):
        return (fail_status, name,
                "og:image Content-Type is {!r}, expected an image/* type"
                .format(content_type or "(missing)"),
                "og:image must be served with an image/* Content-Type")
    return (PASS, name,
            "all {} tags present, og:image absolute and resolves".format(
                len(required)))


def check_twitter_card(ctx):
    """twitter:card meta tag present. WARN-only in stealth mode."""
    fail_status = WARN if ctx["stealth"] else FAIL
    head = ctx["head"]
    if head is None:
        return (fail_status, "Twitter card tag", "no homepage HTML to parse",
                "homepage must be reachable")
    meta = find_meta(head.metas, name="twitter:card")
    if meta and meta.get("content"):
        return (PASS, "Twitter card tag",
                "twitter:card = " + meta["content"])
    return (fail_status, "Twitter card tag", "twitter:card not found",
            "add <meta name=\"twitter:card\" content=\"summary_large_image\">")


def check_canonical(ctx):
    """<link rel="canonical"> present and absolute."""
    head = ctx["head"]
    if head is None:
        return (FAIL, "Canonical link", "no homepage HTML to parse",
                "homepage must be reachable")
    for link in head.links:
        rels = link.get("rel", "").lower().split()
        if "canonical" in rels:
            href = link.get("href", "")
            if is_absolute_https(href):
                return (PASS, "Canonical link", href)
            return (FAIL, "Canonical link",
                    "href is not an absolute https URL: {!r}".format(href),
                    "set the Astro `site` config so canonical URLs are absolute")
    return (FAIL, "Canonical link", "no <link rel=\"canonical\"> found",
            "add a canonical link tag to the <head>")


def check_site_host(ctx):
    """
    canonical, og:url, og:image, the robots.txt `Sitemap:` line and the
    sitemap's first <loc> all use the host the site is served from — i.e.
    Astro's `site` was updated after attaching the custom domain. WARN (not
    FAIL) when served from *.workers.dev, where `site` may already name the
    custom domain. SKIP with --local.
    """
    name = "URLs use the served host (Astro `site`)"
    if ctx["local"]:
        return (SKIP, name, "not checkable before deploy")
    head = ctx["head"]
    if head is None or ctx["home"] is None:
        return (FAIL, name, "no homepage HTML to parse",
                "homepage must be reachable")
    served = served_host(ctx)

    urls = []  # (label, url, strict)
    for link in head.links:
        if "canonical" in link.get("rel", "").lower().split():
            urls.append(("canonical", link.get("href", ""), True))
    for prop in ("og:url", "og:image"):
        meta = find_meta(head.metas, prop=prop)
        if meta and meta.get("content"):
            # An og:image on a CDN host is legitimate; one on *.workers.dev is
            # the classic leftover from before the custom domain.
            urls.append((prop, meta["content"], prop == "og:url"))
    if not ctx["stealth"]:
        try:
            robots = get_path(ctx, "/robots.txt")
            if robots.status == 200 and not looks_like_html(robots.body):
                for line in robots.body.splitlines():
                    key, _, value = line.partition(":")
                    if key.strip().lower() == "sitemap" and value.strip():
                        urls.append(("robots.txt Sitemap", value.strip(), True))
        except Exception:
            pass
        try:
            sitemap = get_path(ctx, "/sitemap-index.xml")
            loc = re.search(r"<loc>\s*([^<\s]+)\s*</loc>", sitemap.body or "")
            if sitemap.status == 200 and loc:
                urls.append(("sitemap <loc>", loc.group(1), True))
        except Exception:
            pass

    urls = [(label, url, strict) for label, url, strict in urls if host_of(url)]
    if not urls:
        return (WARN, name, "no canonical, og or sitemap URLs to compare")

    strict_wrong, soft_wrong = [], []
    for label, url, strict in urls:
        host = host_of(url)
        if host == served:
            continue
        entry = "{} -> {}".format(label, host)
        if strict or host.endswith(".workers.dev"):
            strict_wrong.append(entry)
        else:
            soft_wrong.append(entry)

    hint = ("set `site` in astro.config.mjs to https://{} and rebuild/redeploy"
            .format(served))
    if strict_wrong:
        status = WARN if served.endswith(".workers.dev") else FAIL
        detail = "served from {} but {}".format(
            served, "; ".join(strict_wrong + soft_wrong))
        if status == WARN:
            detail += " (expected before the custom domain is live)"
        return (status, name, detail, hint)
    if soft_wrong:
        return (WARN, name,
                "{} (fine if that host is your image CDN)"
                .format("; ".join(soft_wrong)), hint)
    return (PASS, name, "{} URL(s) use {}".format(len(urls), served))


def check_json_ld(ctx):
    """
    A <script type="application/ld+json"> block exists and contains valid
    JSON. WARN-only in stealth mode.
    """
    fail_status = WARN if ctx["stealth"] else FAIL
    head = ctx["head"]
    if head is None:
        return (fail_status, "JSON-LD structured data",
                "no homepage HTML to parse", "homepage must be reachable")

    ld_blocks = [
        text for attrs, text in head.scripts
        if attrs.get("type", "").lower() == "application/ld+json"
    ]
    if not ld_blocks:
        return (fail_status, "JSON-LD structured data",
                "no <script type=\"application/ld+json\"> block found",
                "add a JSON-LD structured-data block to the <head>")

    for block in ld_blocks:
        try:
            json.loads(block)
        except (json.JSONDecodeError, ValueError) as err:
            return (fail_status, "JSON-LD structured data",
                    "JSON-LD block does not parse: {}".format(err),
                    "fix the JSON syntax in the ld+json script block")
    return (PASS, "JSON-LD structured data",
            "{} valid block(s)".format(len(ld_blocks)))


def check_csp(ctx):
    """
    A Content-Security-Policy is delivered, as a response header or a <meta
    http-equiv> tag (Astro emits the meta tag for prerendered pages). When one
    exists, WARN if no policy sets object-src (or a restrictive default-src)
    or base-uri.
    """
    name = "Content-Security-Policy"
    if ctx["home"] is None:
        return (FAIL, name, "no homepage response",
                "homepage must be reachable")
    policies = csp_policies(ctx)
    if not policies:
        return (FAIL, name,
                "no CSP header and no <meta http-equiv=\"content-security-"
                "policy\"> found",
                "set `security: { csp: { directives: [\"object-src 'none'\", "
                "\"base-uri 'self'\"] } }` in astro.config.mjs (CSP appears "
                "after build/preview; it is inactive in dev)")

    sources = sorted({src for src, _ in policies})
    has_object = any(
        csp_directive(p, "object-src") is not None
        or "*" not in (csp_directive(p, "default-src") or ["*"])
        for _, p in policies
    )
    has_base = any(csp_directive(p, "base-uri") is not None
                   for _, p in policies)
    lacking = []
    if not has_object:
        lacking.append("object-src")
    if not has_base:
        lacking.append("base-uri")
    if lacking:
        return (WARN, name,
                "CSP ({}) lacks {}".format(" + ".join(sources),
                                           " and ".join(lacking)),
                "add \"object-src 'none'\" and \"base-uri 'self'\" to "
                "security.csp.directives in astro.config.mjs")
    return (PASS, name, "present ({})".format(" + ".join(sources)))


def check_sitemap(ctx):
    """
    /sitemap-index.xml returns 200 and is real sitemap XML.
    In stealth mode the expectation is inverted: a 404 is expected.
    """
    try:
        resp = get_path(ctx, "/sitemap-index.xml")
    except Exception as err:
        if ctx["stealth"]:
            return (PASS, "Sitemap absent (stealth)",
                    "sitemap-index.xml not reachable, as expected")
        return (FAIL, "Sitemap present",
                "could not fetch /sitemap-index.xml: {}".format(err),
                "generate a sitemap with @astrojs/sitemap")

    if ctx["stealth"]:
        if ctx.get("gated") and LOCK_MARKER in resp.body:
            return (PASS, "Sitemap absent (gated)",
                    "sitemap-index.xml is behind the gate")
        if resp.status == 404:
            return (PASS, "Sitemap absent (stealth)",
                    "sitemap-index.xml returns 404, as expected")
        return (WARN, "Sitemap absent (stealth)",
                "sitemap-index.xml returned HTTP {} — a stealth site should "
                "not expose a sitemap".format(resp.status),
                "remove sitemap() from astro.config.mjs integrations")

    problem = sitemap_problem(resp, "sitemap-index.xml")
    if problem is None:
        return (PASS, "Sitemap present",
                "sitemap-index.xml is a valid sitemap")

    # Not a site this skill generated (@astrojs/sitemap writes
    # sitemap-index.xml)? Honor a same-host `Sitemap:` URL from robots.txt.
    alt = robots_sitemap_url(ctx)
    if alt:
        try:
            alt_resp = get_path(ctx, alt)
        except Exception:
            alt_resp = None
        if alt_resp is not None and sitemap_problem(alt_resp, alt) is None:
            return (PASS, "Sitemap present",
                    "{} (from robots.txt) is a valid sitemap".format(alt))
    return (FAIL, "Sitemap present", problem[0], problem[1])


def sitemap_problem(resp, label):
    """None if `resp` is real sitemap XML, else (detail, hint)."""
    if resp.status != 200:
        return ("{} returned HTTP {}".format(label, resp.status),
                "add @astrojs/sitemap and set the `site` config")
    # A misconfigured server can answer with an HTML page at HTTP 200, so
    # require a real sitemap root element and reject an HTML body.
    if looks_like_html(resp.body):
        return ("{} served an HTML page, not a sitemap".format(label),
                "a 200 HTML page here usually means the route fell through "
                "to index.html — generate the sitemap with @astrojs/sitemap")
    body_lower = (resp.body or "").lower()
    if "<sitemapindex" not in body_lower and "<urlset" not in body_lower:
        return ("{} has no <sitemapindex> or <urlset> root element"
                .format(label),
                "the sitemap should be valid sitemap XML — generate it "
                "with @astrojs/sitemap")
    return None


def robots_sitemap_url(ctx):
    """The path of the first same-host `Sitemap:` URL in robots.txt, or None."""
    try:
        robots = get_path(ctx, "/robots.txt")
    except Exception:
        return None
    if robots.status != 200 or looks_like_html(robots.body):
        return None
    for line in (robots.body or "").splitlines():
        key, _, value = line.partition(":")
        if key.strip().lower() != "sitemap" or not value.strip():
            continue
        parsed = urllib.parse.urlparse(value.strip())
        if parsed.hostname and parsed.hostname.lower() == served_host(ctx):
            path = parsed.path or "/"
            if path == "/sitemap-index.xml":
                return None
            return path + ("?" + parsed.query if parsed.query else "")
    return None


def check_robots(ctx):
    """
    /robots.txt returns 200 and is judged by its merged `*` group (per-bot
    groups such as those Cloudflare's managed robots.txt prepends are ignored).
    Standard: FAIL if `*` is blocked from the whole site; WARN without a
    `Sitemap:` line. Stealth: WARN if `*` is blocked (crawlers then never see
    the noindex layers), PASS if crawlable.
    """
    name = "robots.txt"
    try:
        resp = get_path(ctx, "/robots.txt")
    except Exception as err:
        return (FAIL, name, "could not fetch /robots.txt: {}".format(err),
                "add a public/robots.txt file")

    if resp.status != 200:
        return (FAIL, name, "robots.txt returned HTTP {}".format(resp.status),
                "add a public/robots.txt file")
    if looks_like_html(resp.body):
        return (FAIL, name, "robots.txt served an HTML page",
                "add a plain-text public/robots.txt (the route fell through "
                "to an HTML page)")

    blocks_all = robots_blocks_all(resp.body)
    has_sitemap = re.search(r"^\s*sitemap\s*:", resp.body,
                            re.IGNORECASE | re.MULTILINE) is not None

    if ctx["stealth"]:
        if blocks_all:
            return (WARN, name + " (stealth)",
                    "`User-agent: *` is disallowed from the whole site, so "
                    "crawlers never see the noindex meta/header",
                    "use `User-agent: *` / `Allow: /` and let the noindex "
                    "layers do the work")
        if has_sitemap:
            return (WARN, name + " (stealth)",
                    "crawlable, but it advertises a Sitemap: line",
                    "remove the Sitemap: line from public/robots.txt")
        return (PASS, name + " (stealth)",
                "crawlable; the noindex layers keep it out of search")

    if blocks_all:
        return (FAIL, name,
                "`User-agent: *` is disallowed from the whole site "
                "(Disallow: /) — search engines can't crawl it",
                "remove `Disallow: /` from public/robots.txt (leftover from "
                "the stealth variant?)")
    if not has_sitemap:
        return (WARN, name, "returns 200 but has no Sitemap: line",
                "add `Sitemap: https://<domain>/sitemap-index.xml` to "
                "public/robots.txt")
    return (PASS, name, "returns 200, crawlable, lists a sitemap")


def check_custom_404(ctx):
    """
    A path that cannot exist returns a real 404 carrying the custom HTML page.

    The first request does not follow redirects, so a server that bounces
    every unknown route to "/" can't masquerade as a 200 homepage. One
    same-host redirect (trailing slash, canonical host) is followed; the chain
    must end in 404. An assets-only Worker without `not_found_handling`
    returns a 404 with an empty body, so the body must be HTML.
    """
    name = "Custom 404 page"
    hint_nfh = ("add src/pages/404.astro and set \"not_found_handling\": "
                "\"404-page\" under assets in wrangler.jsonc")
    nav = {"Accept": "text/html", "Sec-Fetch-Mode": "navigate"}
    token = "{:08x}".format(random.getrandbits(32))
    url = urllib.parse.urljoin(ctx["base"], "/__verify_nonexistent_" + token)
    try:
        resp = fetch(url, follow_redirects=False, extra_headers=nav)
    except Exception as err:
        return (FAIL, name, "could not fetch {}: {}".format(url, err),
                "the site must respond to unknown routes")

    via = ""
    if 300 <= resp.status < 400:
        location = urllib.parse.urljoin(url, resp.header("location"))
        if not resp.header("location") or host_of(location) != host_of(url):
            return (FAIL, name,
                    "unknown route redirected (HTTP {}) to {}".format(
                        resp.status, location or "(no Location)"),
                    "an unknown URL should 404, not redirect — " + hint_nfh)
        first_status = resp.status
        try:
            resp = fetch(location, follow_redirects=False, extra_headers=nav)
        except Exception as err:
            return (FAIL, name, "could not fetch {}: {}".format(location, err),
                    "the site must respond to unknown routes")
        via = "redirect (HTTP {}, trailing-slash/canonical) then ".format(
            first_status)

    if resp.status == 404:
        body = resp.body.lower()
        if "<html" in body or "<!doctype html" in body:
            return (PASS, name, via + "404 with the custom HTML page")
        return (FAIL, name, via + "404 but with an empty/non-HTML body",
                hint_nfh)
    if resp.status == 200:
        return (FAIL, name, via + "unknown route returned 200 instead of 404",
                "a 200 here means every unknown URL serves a page (SPA "
                "fallback?) — " + hint_nfh)
    if 300 <= resp.status < 400:
        return (FAIL, name,
                via + "unknown route redirected again (HTTP {})".format(
                    resp.status),
                "an unknown URL should 404, not redirect — " + hint_nfh)
    return (FAIL, name, via + "unknown route returned HTTP {}".format(
        resp.status), "unknown routes should return a 404 status")


def check_analytics_beacon(ctx):
    """
    The Cloudflare Web Analytics beacon is on the homepage exactly once AND
    every CSP on the page lets it load (script-src) and report (connect-src).
    A missing beacon is a WARN (analytics is optional); a beacon the CSP
    blocks is a FAIL (it silently records nothing).
    """
    name = "Cloudflare Web Analytics beacon"
    resp = ctx["home"]
    body = resp.body if resp else ""
    count = body.count(BEACON_MARKER)
    if count == 0:
        return (WARN, name, "no cloudflareinsights.com/beacon script found",
                "for traffic stats, add the manual JS snippet (works on "
                "*.workers.dev and custom domains; if automatic setup is also "
                "enabled for this zone, turn it off for this hostname so the "
                "beacon isn't loaded twice)")

    for source, policy in csp_policies(ctx):
        script = (csp_directive(policy, "script-src-elem")
                  or csp_directive(policy, "script-src")
                  or csp_directive(policy, "default-src"))
        if script is not None:
            if "'strict-dynamic'" in script:
                return (FAIL, name,
                        "beacon present but the CSP ({}) uses 'strict-dynamic'"
                        " — host allowlists are ignored and the parser-"
                        "inserted beacon is blocked".format(source),
                        "remove 'strict-dynamic' from the CSP")
            if not csp_allows_host(script, "cloudflareinsights.com"):
                return (FAIL, name,
                        "beacon present but the CSP ({}) script-src blocks "
                        "static.cloudflareinsights.com".format(source),
                        "add 'https://static.cloudflareinsights.com' to "
                        "security.csp.scriptDirective.resources (keep "
                        "\"'self'\" in the list) in astro.config.mjs")
        connect = (csp_directive(policy, "connect-src")
                   or csp_directive(policy, "default-src"))
        if connect is not None and not csp_allows_host(
                connect, "cloudflareinsights.com"):
            return (FAIL, name,
                    "beacon present but the CSP ({}) connect-src blocks "
                    "cloudflareinsights.com, so it can't report"
                    .format(source),
                    "add 'https://cloudflareinsights.com' to connect-src")

    if count > 1:
        return (WARN, name,
                "beacon appears {} times (manual snippet + automatic "
                "setup?) — only one per page is supported".format(count),
                "turn off automatic setup for this hostname in Web Analytics, "
                "or remove the manual snippet")
    return (PASS, name, "beacon present and allowed by the CSP")


def check_favicons(ctx):
    """
    favicon.svg, favicon.ico and apple-touch-icon.png each return 200. Any
    miss is a WARN, never a FAIL.
    """
    targets = ["/favicon.svg", "/favicon.ico", "/apple-touch-icon.png"]
    missing = []
    for path in targets:
        url = urllib.parse.urljoin(ctx["base"], path)
        try:
            resp = fetch(url)
            if resp.status != 200:
                missing.append("{} (HTTP {})".format(path, resp.status))
        except Exception as err:
            missing.append("{} ({})".format(path, err))

    if missing:
        return (WARN, "Favicons", "missing: " + ", ".join(missing),
                "add the missing icon files to the public/ directory")
    return (PASS, "Favicons", "all 3 icon files return 200")


def check_indexable(ctx):
    """
    Standard mode only: a public site carries no stray noindex (robots meta or
    X-Robots-Tag), e.g. left over from the stealth variant. WARN instead of
    FAIL on *.workers.dev, where a noindex header is deliberate.
    """
    name = "Indexable (no stray noindex)"
    resp, head = ctx["home"], ctx["head"]
    if resp is None:
        return (FAIL, name, "homepage unreachable",
                "homepage must be reachable")
    problems = []
    for content in robots_meta_values(head):
        if has_noindex(content):
            problems.append("robots meta: " + content)
    xrt = resp.header("x-robots-tag")
    if has_noindex(xrt):
        problems.append("X-Robots-Tag: " + xrt)
    if not problems:
        return (PASS, name, "no noindex on the homepage")
    if served_host(ctx).endswith(".workers.dev"):
        return (WARN, name, "; ".join(problems) + " (on *.workers.dev — fine "
                "if deliberate)",
                "the custom domain must not carry this noindex")
    return (FAIL, name, "; ".join(problems),
            "remove the stealth noindex layers before launch (robots meta in "
            "the layout, X-Robots-Tag in public/_headers) — see the "
            "anonymity-variant launch checklist")


def check_robots_meta(ctx):
    """
    Stealth-only: the homepage <head> carries a robots meta tag with
    `noindex` so search engines do not index the coming-soon site.
    """
    name = "Noindex robots meta (stealth)"
    head = ctx["head"]
    if head is None:
        return (FAIL, name, "no homepage HTML to parse",
                "homepage must be reachable")
    values = robots_meta_values(head)
    for content in values:
        if has_noindex(content):
            return (PASS, name, "robots meta = " + content)
    return (FAIL, name,
            "no <meta name=\"robots\" content=\"noindex\"> found"
            + (" (content: {!r})".format(", ".join(values)) if values else ""),
            "add <meta name=\"robots\" content=\"noindex, nofollow\"> so the "
            "stealth site is not indexed")


def check_xrobots_header(ctx):
    """
    Stealth-only: the homepage response carries an `X-Robots-Tag` header
    containing `noindex` — the defense-in-depth companion to the robots meta
    tag, honored even when a crawler doesn't parse the HTML.
    """
    name = "X-Robots-Tag header (stealth)"
    resp = ctx["home"]
    if resp is None:
        return (FAIL, name, "homepage is unreachable",
                "homepage must be reachable")
    value = resp.header("x-robots-tag")
    if has_noindex(value):
        return (PASS, name, "X-Robots-Tag: " + value)
    return (FAIL, name,
            "X-Robots-Tag header {}".format(
                "is {!r}".format(value) if value else "is missing"),
            "add `X-Robots-Tag: noindex` to the `/*` block of public/_headers")


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


# ---------------------------------------------------------------------------
# Check runner
# ---------------------------------------------------------------------------

def run_check(results, func, ctx):
    """
    Execute a single check function, converting any uncaught exception into a
    FAIL so one broken check cannot abort the whole run.
    """
    try:
        status, name, *rest = func(ctx)
        detail = rest[0] if len(rest) > 0 else ""
        hint = rest[1] if len(rest) > 1 else ""
        results.record(status, name, detail, hint)
    except Exception as err:  # defensive catch-all
        results.record(
            FAIL,
            getattr(func, "__name__", "check"),
            "unexpected error: {}".format(err),
            "this is a verifier bug or a severe network failure",
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def normalize_url(raw, default_scheme="https"):
    """
    Add a scheme if missing and validate the URL. Returns None when the input
    is not a usable site URL (a non-http(s) scheme, no hostname, whitespace,
    bad port).
    """
    url = raw.strip()
    if (re.match(r"^[a-z][a-z0-9+.-]*://", url, re.IGNORECASE)
            and not re.match(r"^https?://", url, re.IGNORECASE)):
        return None
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = "{}://{}".format(default_scheme, url)
    if re.search(r"\s", url):
        return None
    try:
        parsed = urllib.parse.urlparse(url)
        parsed.port  # raises ValueError on a malformed port
    except ValueError:
        return None
    if not parsed.hostname:
        return None
    return url


def build_context(base_url, stealth, local=False, gated=False):
    """
    Fetch the homepage once and assemble the context dict shared by all
    checks. `base` is rebased on where the homepage actually landed (scheme +
    host), so sub-requests don't hit a redirecting host. Returns
    (ctx, fetch_error).
    """
    home = None
    error = None
    try:
        home = fetch(base_url)
    except (urllib.error.URLError, socket.timeout, ssl.SSLError, OSError,
            ValueError, http.client.HTTPException) as err:
        error = err

    base = base_url
    if home is not None:
        parsed = urllib.parse.urlparse(home.final_url)
        if parsed.scheme and parsed.netloc:
            base = "{}://{}/".format(parsed.scheme, parsed.netloc)

    head = parse_head(home.body) if (home and home.body) else None
    ctx = {
        "base": base,
        "stealth": stealth,
        "local": local,
        "gated": gated,
        "home": home,
        "head": head,
    }
    return ctx, error


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Verifier for Astro static sites on Cloudflare Workers: "
                    "a live URL, or a local preview with --local.",
        epilog="Exit codes: 0 = no check failed; 1 = a check failed; "
               "2 = invalid URL or the homepage could not be reached.",
    )
    parser.add_argument("url", help="Site URL, e.g. https://example.com")
    parser.add_argument(
        "--stealth",
        action="store_true",
        help="Verify the anonymity / coming-soon variant: expect a noindex "
             "robots meta + X-Robots-Tag header and no sitemap; robots.txt "
             "should stay crawlable (WARN if it disallows everything); OG and "
             "JSON-LD become warnings.",
    )
    parser.add_argument(
        "--local",
        action="store_true",
        help="Check a local `npm run preview` (http://localhost:<port>) "
             "before deploying; HTTPS, Cloudflare-edge, served-host and "
             "other-host checks are reported as SKIP.",
    )
    parser.add_argument(
        "--gated",
        action="store_true",
        help="Verify a private site (astro-cloudflare-passkey-login): implies "
             "--stealth; expects the lock page in place of every document "
             "without a session, 401 for other requests, and /auth/session "
             "to answer 401.",
    )
    args = parser.parse_args(argv)
    stealth = args.stealth or args.gated

    style = Style(sys.stdout.isatty())
    base_url = normalize_url(args.url, "http" if args.local else "https")
    if base_url is None:
        print("error: not a valid site URL: {!r}".format(args.url))
        return 2
    if args.local and host_of(base_url) not in LOCAL_HOSTS:
        print("--local expects a localhost URL (e.g. the one `npm run "
              "preview` prints), got {}".format(args.url))
        return 2

    mode = "stealth / coming-soon" if stealth else "standard / public"
    if args.gated:
        mode = "private / passkey-gated (implies stealth)"
    if args.local:
        mode += ", local preview (pre-deploy)"
    print(style.bold("Verifying {}".format(base_url)))
    print(style.dim("Mode: {}".format(mode)))
    print("")

    ctx, error = build_context(base_url, stealth, args.local, args.gated)
    if ctx["home"] is None:
        if args.local:
            print("Nothing answered at {} — run `npm run build && npm run "
                  "preview` and pass the URL it prints.".format(base_url))
            return 2
        reason = str(getattr(error, "reason", error))
        print(style.red("Cannot reach {} — {}".format(base_url, reason)))
        if "CERTIFICATE_VERIFY_FAILED" in reason:
            print("  If the site's certificate is valid, this Python lacks CA "
                  "certificates: on a python.org macOS install run "
                  "\"/Applications/Python 3.x/Install Certificates.command\", "
                  "or use /usr/bin/python3.")
        else:
            print("  Check the URL, that the site is deployed, and that DNS "
                  "has propagated.")
        return 2
    if host_of(ctx["base"]) != host_of(base_url):
        print(style.dim("Note: {} redirected to {}; checking that host.".format(
            base_url, ctx["base"])))
        print("")
    results = Results(style)

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

    for check in checks:
        run_check(results, check, ctx)

    # Summary.
    print("")
    summary = "{} passed, {} failed, {} warning{}".format(
        results.passed, results.failed, results.warnings,
        "" if results.warnings == 1 else "s",
    )
    if results.skipped:
        summary += ", {} skipped until deploy".format(results.skipped)
    print(style.bold(summary))

    if results.failed == 0:
        verdict = "VERDICT: site looks correctly configured."
        if args.local:
            verdict = ("VERDICT: local build looks correct; re-run against "
                       "the live URL after deploy.")
        if results.warnings:
            verdict += " (review the warnings above)"
        print(style.green(verdict))
        return 0

    print(style.red(
        "VERDICT: {} check(s) failed — see [FAIL] lines above.".format(
            results.failed
        )
    ))
    return 1


if __name__ == "__main__":
    sys.exit(main())
