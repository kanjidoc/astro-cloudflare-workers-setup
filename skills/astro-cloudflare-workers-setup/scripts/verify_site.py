#!/usr/bin/env python3
"""
verify_site.py — post-deploy verifier for Astro 6 + Cloudflare Workers sites.

Fetches a live site and asserts it is correctly and canonically configured:
HTTPS + Cloudflare edge, security headers, immutable hashed assets, OG/Twitter
metadata, canonical link, JSON-LD, CSP meta tag, sitemap, robots.txt, a real
custom 404, the Web Analytics beacon, and favicons.

Usage:
    python3 verify_site.py https://example.com
    python3 verify_site.py https://example.com --stealth

The --stealth flag targets the "coming soon" / anonymity variant: it inverts
the indexability expectations (expects a noindex robots meta tag, expects
robots.txt to Disallow everything, expects NO sitemap) and downgrades the
OG / JSON-LD checks to warnings.

Python 3.8+, standard library only. No third-party dependencies.
"""

import argparse
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
    "Mozilla/5.0 (compatible; AstroCloudflareVerifier/1.0; "
    "+https://github.com/) verify_site.py"
)
MAX_REDIRECTS = 5

# Result status constants.
PASS = "PASS"
FAIL = "FAIL"
WARN = "WARN"


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
        # Show a fix hint only for failures, indented under the line.
        if status == FAIL and hint:
            print("       {} {}".format(self.style.dim("hint:"), hint))

    def _marker(self, status):
        if status == PASS:
            return self.style.green("[PASS]")
        if status == FAIL:
            return self.style.red("[FAIL]")
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
    which would make a manual redirect loop dead code and would hide the true
    status of a route from a check. Returning ``None`` from ``redirect_request``
    tells urllib not to follow the redirect; the 3xx is then raised as an
    ``HTTPError``, which ``fetch()`` turns into a normal Response.
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


# A single opener, reused for every request, that never auto-follows redirects.
# fetch() decides whether to follow them based on its follow_redirects argument.
_OPENER = urllib.request.build_opener(_NoRedirect)


def fetch(url, method="GET", follow_redirects=True):
    """
    Fetch a URL and return a normalized Response, or raise on a network-level
    failure (DNS, TLS, timeout, connection reset).

    Redirects are never auto-followed by urllib here (see ``_NoRedirect``).
    Instead this function decides what to do with a 3xx:

      * ``follow_redirects=True`` (default) -- follow redirects manually so we
        can cap their number with ``MAX_REDIRECTS`` and still observe the final
        status. This is what normal checks (homepage, assets, ...) want.
      * ``follow_redirects=False`` -- return the 3xx response as-is, so a caller
        can observe that a route redirected. ``check_custom_404`` needs this to
        tell a real 404 apart from a redirect to the index page.

    HTTP error statuses (404, 500, ...) are always returned as a Response, not
    raised.

    TLS uses urllib's default verified context (via the shared opener), so an
    invalid certificate still raises a network-level error as before.
    """
    current = url
    seen_redirects = 0

    while True:
        request = urllib.request.Request(current, method=method)
        request.add_header("User-Agent", USER_AGENT)
        request.add_header("Accept", "*/*")

        try:
            with _OPENER.open(request, timeout=TIMEOUT) as resp:
                raw = resp.read()
                body = _decode(raw)
                return Response(
                    resp.status, list(resp.getheaders()), body, resp.geturl()
                )
        except urllib.error.HTTPError as err:
            # Because _NoRedirect refuses to auto-follow, every 3xx arrives here
            # as an HTTPError. When following is requested we chase the Location
            # header manually, capped by MAX_REDIRECTS; otherwise we return the
            # 3xx unchanged so the caller can see it.
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


def max_age_seconds(cache_control):
    """Extract the max-age value (seconds) from a Cache-Control header."""
    match = re.search(r"max-age\s*=\s*(\d+)", cache_control, re.IGNORECASE)
    return int(match.group(1)) if match else None


# ---------------------------------------------------------------------------
# Individual checks
#
# Each check is wrapped by run_check() so a thrown exception is converted into
# a FAIL rather than aborting the whole verification run.
# ---------------------------------------------------------------------------

def check_homepage(ctx):
    """Check 1: homepage returns HTTP 200 over HTTPS."""
    resp = ctx["home"]
    if resp is None:
        return (FAIL, "Homepage reachable over HTTPS",
                "could not fetch homepage",
                "confirm the site is deployed and the domain resolves")
    if not resp.final_url.startswith("https://"):
        return (FAIL, "Homepage reachable over HTTPS",
                "final URL is not https: " + resp.final_url,
                "ensure HTTPS is enabled and HTTP redirects to HTTPS")
    if resp.status != 200:
        return (FAIL, "Homepage reachable over HTTPS",
                "got HTTP {}".format(resp.status),
                "the homepage route should return 200")
    return (PASS, "Homepage returns 200 over HTTPS", resp.final_url)


def check_cloudflare(ctx):
    """Check 2: the `server` header identifies Cloudflare."""
    resp = ctx["home"]
    if resp is None:
        # No response at all: the right diagnosis is "unreachable", not a
        # misleading "(missing) server header" — there is no header to inspect.
        return (FAIL, "Served by Cloudflare", "homepage is unreachable",
                "confirm the site is deployed and the domain resolves")
    server = resp.header("server")
    if "cloudflare" in server.lower():
        return (PASS, "Served by Cloudflare", "server: " + server)
    return (FAIL, "Served by Cloudflare",
            "server header is {!r}".format(server or "(missing)"),
            "the domain may not be proxied through Cloudflare (orange-cloud)")


def check_security_headers(ctx):
    """Check 3: required security headers are present on the homepage."""
    resp = ctx["home"]
    if resp is None:
        return (FAIL, "Security headers present", "no homepage response",
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

    if missing or wrong:
        problems = []
        if missing:
            problems.append("missing: " + ", ".join(missing))
        if wrong:
            problems.append("; ".join(wrong))
        return (FAIL, "Security headers present", " / ".join(problems),
                "add these headers via the Cloudflare adapter, a _headers "
                "file, or middleware")
    return (PASS, "Security headers present", "all 5 headers found")


def check_hashed_asset(ctx):
    """
    Check 4: a content-hashed /_astro/ asset is served with an immutable,
    long-lived Cache-Control header.
    """
    resp = ctx["home"]
    if resp is None or not resp.body:
        return (FAIL, "Hashed asset is immutable & long-cached",
                "no homepage HTML to scan",
                "homepage must be reachable")

    # Targeted regex: locate one hashed asset URL referenced by the homepage.
    # This deliberately does not parse the whole DOM.
    match = re.search(
        r'["\'(]([^"\'()\s]*?/_astro/[^"\'()\s]+?\.(?:css|js))(?:["\'?)]|$)',
        resp.body,
    )
    if not match:
        return (WARN, "Hashed asset is immutable & long-cached",
                "no /_astro/*.css or *.js asset referenced on the homepage")

    asset_url = urllib.parse.urljoin(resp.final_url, match.group(1))
    try:
        asset = fetch(asset_url)
    except Exception as err:  # pragma: no cover - network dependent
        return (FAIL, "Hashed asset is immutable & long-cached",
                "could not fetch {}: {}".format(asset_url, err),
                "ensure /_astro/ assets are deployed")

    if asset.status != 200:
        return (FAIL, "Hashed asset is immutable & long-cached",
                "asset returned HTTP {}".format(asset.status),
                "the hashed asset should return 200")

    cache_control = asset.header("cache-control")
    age = max_age_seconds(cache_control)
    if "immutable" not in cache_control.lower():
        return (FAIL, "Hashed asset is immutable & long-cached",
                "Cache-Control lacks 'immutable': {!r}".format(cache_control),
                "serve /_astro/* with 'Cache-Control: public, max-age=31536000, "
                "immutable' (these files are content-hashed)")
    if age is None or age < 86400:
        return (FAIL, "Hashed asset is immutable & long-cached",
                "max-age is too short: {!r}".format(cache_control),
                "use a long max-age (e.g. 31536000) for content-hashed assets")
    return (PASS, "Hashed asset is immutable & long-cached",
            "max-age={}, immutable".format(age))


def check_open_graph(ctx):
    """
    Check 5: Open Graph tags present; og:url and og:image must be absolute
    https URLs, and og:image must actually resolve (HTTP 200 with an image
    Content-Type). A 404'd OG image is a real defect, so it FAILs in standard
    mode. Downgraded to WARN-only in stealth mode.
    """
    fail_status = WARN if ctx["stealth"] else FAIL
    name = "Open Graph tags"
    head = ctx["head"]
    if head is None:
        return (fail_status, name, "no homepage HTML to parse",
                "homepage must be reachable")

    required = ["og:title", "og:type", "og:url", "og:image"]
    found = {}
    for prop in required:
        meta = find_meta(head.metas, prop=prop)
        found[prop] = meta.get("content", "") if meta else None

    missing = [p for p in required if not found[p]]
    if missing:
        return (fail_status, name, "missing: " + ", ".join(missing),
                "add Open Graph <meta property=\"og:*\"> tags to the <head>")

    not_absolute = [
        p for p in ("og:url", "og:image") if not is_absolute_https(found[p])
    ]
    if not_absolute:
        return (fail_status, name,
                "not absolute https URLs: " + ", ".join(not_absolute),
                "og:url and og:image must be absolute https:// URLs, not "
                "relative paths")

    # The og:image URL must actually resolve. A social card pointing at a
    # missing image renders blank when the page is shared, so verify it loads
    # and is genuinely an image (200 + Content-Type starting "image/").
    og_image = found["og:image"].strip()
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
            "all 4 tags present, og:url & og:image absolute, og:image resolves")


def check_twitter_card(ctx):
    """Check 6: twitter:card meta tag present. WARN-only in stealth mode."""
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
    """Check 7: <link rel="canonical"> present and absolute."""
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


def check_json_ld(ctx):
    """
    Check 8: a <script type="application/ld+json"> block exists and contains
    valid JSON. WARN-only in stealth mode.
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


def check_csp_meta(ctx):
    """
    Check 9: a <meta http-equiv="content-security-policy"> tag is present.
    Astro 6 delivers CSP via a meta tag for static pages served through the
    Cloudflare adapter.
    """
    head = ctx["head"]
    if head is None:
        return (FAIL, "CSP meta tag", "no homepage HTML to parse",
                "homepage must be reachable")
    meta = find_meta(head.metas, http_equiv="content-security-policy")
    if meta and meta.get("content"):
        return (PASS, "CSP meta tag", "content-security-policy present")
    return (FAIL, "CSP meta tag",
            "no <meta http-equiv=\"content-security-policy\"> found",
            "set `security: { csp: true }` in astro.config so Astro emits a "
            "CSP meta tag (build + preview — CSP is inactive in dev)")


def check_sitemap(ctx):
    """
    Check 10: /sitemap-index.xml returns 200 and looks like XML.
    In stealth mode the expectation is inverted: a 404 is acceptable.
    """
    url = urllib.parse.urljoin(ctx["base"], "/sitemap-index.xml")
    try:
        resp = fetch(url)
    except Exception as err:
        if ctx["stealth"]:
            return (PASS, "Sitemap absent (stealth)",
                    "sitemap-index.xml not reachable, as expected")
        return (FAIL, "Sitemap present",
                "could not fetch {}: {}".format(url, err),
                "generate a sitemap with @astrojs/sitemap")

    if ctx["stealth"]:
        if resp.status == 404:
            return (PASS, "Sitemap absent (stealth)",
                    "sitemap-index.xml returns 404, as expected")
        return (WARN, "Sitemap absent (stealth)",
                "sitemap-index.xml returned HTTP {} — a stealth site should "
                "not expose a sitemap".format(resp.status))

    if resp.status != 200:
        return (FAIL, "Sitemap present",
                "sitemap-index.xml returned HTTP {}".format(resp.status),
                "add @astrojs/sitemap and set the `site` config")

    # A misconfigured server can answer /sitemap-index.xml with an HTML error
    # page at HTTP 200. Merely "starts with <" is not enough — require a real
    # sitemap root element (<sitemapindex> or <urlset>) and explicitly reject a
    # body whose root looks like HTML.
    body_lower = resp.body.lower()
    body_head = body_lower.lstrip()
    if body_head.startswith("<!doctype html") or body_head.startswith("<html"):
        return (FAIL, "Sitemap present",
                "sitemap-index.xml served an HTML page, not a sitemap",
                "sitemap-index.xml should be an XML sitemap index, not HTML "
                "(a 200 HTML page here usually means the route fell through "
                "to index.html)")
    if "<sitemapindex" not in body_lower and "<urlset" not in body_lower:
        return (FAIL, "Sitemap present",
                "response has no <sitemapindex> or <urlset> root element",
                "sitemap-index.xml should be valid sitemap XML — generate it "
                "with @astrojs/sitemap")
    return (PASS, "Sitemap present", "sitemap-index.xml is a valid sitemap")


def check_robots(ctx):
    """
    Check 11: /robots.txt returns 200.
    In stealth mode it must additionally contain `Disallow: /`.
    """
    url = urllib.parse.urljoin(ctx["base"], "/robots.txt")
    try:
        resp = fetch(url)
    except Exception as err:
        return (FAIL, "robots.txt", "could not fetch {}: {}".format(url, err),
                "add a public/robots.txt file")

    if resp.status != 200:
        return (FAIL, "robots.txt",
                "robots.txt returned HTTP {}".format(resp.status),
                "add a public/robots.txt file")

    if ctx["stealth"]:
        body_lower = resp.body.lower()
        # Match a Disallow rule covering the whole site.
        if re.search(r"^\s*disallow:\s*/\s*$", body_lower, re.MULTILINE):
            return (PASS, "robots.txt disallows all (stealth)",
                    "robots.txt contains 'Disallow: /'")
        return (FAIL, "robots.txt disallows all (stealth)",
                "robots.txt does not contain 'Disallow: /'",
                "a stealth site's robots.txt should disallow all crawling")
    return (PASS, "robots.txt", "robots.txt returns 200")


def check_custom_404(ctx):
    """
    Check 12: a path that cannot exist returns a real 404 (not 200, not a
    redirect).

    Redirects must NOT be followed here: if the request is fetched with
    follow_redirects=True, a misconfigured server that 302s every unknown route
    to "/" would look like a 200 homepage and the true status would be hidden.
    So this calls fetch(..., follow_redirects=False) and inspects the immediate
    status:

      * 404            -> PASS (correct not_found_handling)
      * 200 or any 3xx -> FAIL (both mean not_found_handling is misconfigured:
                          the unknown URL is being served, or bounced, instead
                          of returning a genuine 404)
    """
    token = "{:08x}".format(random.getrandbits(32))
    url = urllib.parse.urljoin(ctx["base"], "/__verify_nonexistent_" + token)
    try:
        resp = fetch(url, follow_redirects=False)
    except Exception as err:
        return (FAIL, "Custom 404 handling",
                "could not fetch {}: {}".format(url, err),
                "the site must respond to unknown routes")

    if resp.status == 404:
        return (PASS, "Custom 404 handling",
                "unknown route correctly returns 404")
    if resp.status == 200:
        return (FAIL, "Custom 404 handling",
                "unknown route returned 200 instead of 404",
                "set `not_found_handling = \"404-page\"` in Wrangler assets "
                "config — a 200 here means every unknown URL serves index.html")
    if 300 <= resp.status < 400:
        return (FAIL, "Custom 404 handling",
                "unknown route returned a redirect (HTTP {}) instead of 404"
                .format(resp.status),
                "set `not_found_handling = \"404-page\"` in Wrangler assets "
                "config — an unknown URL should 404, not redirect")
    return (FAIL, "Custom 404 handling",
            "unknown route returned HTTP {}".format(resp.status),
            "unknown routes should return a 404 status")


def check_analytics_beacon(ctx):
    """
    Check 13: the Cloudflare Web Analytics beacon is present in the homepage
    HTML. Analytics is optional, so a miss is a WARN, never a FAIL.
    """
    resp = ctx["home"]
    body = resp.body if resp else ""
    if "cloudflareinsights.com/beacon" in body:
        return (PASS, "Cloudflare Web Analytics beacon",
                "beacon script present")
    return (WARN, "Cloudflare Web Analytics beacon",
            "no cloudflareinsights.com/beacon script found — add the Web "
            "Analytics snippet if you want traffic stats (auto-inject is "
            "Pages-only; on Workers add the snippet manually)")


def check_favicons(ctx):
    """
    Check 14: favicon.svg, favicon.ico and apple-touch-icon.png each return
    200. Any miss is a WARN, never a FAIL.
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


def check_robots_meta(ctx):
    """
    Stealth-only check: the homepage <head> must carry a robots meta tag with
    `noindex` so search engines do not index the coming-soon site.
    """
    head = ctx["head"]
    if head is None:
        return (FAIL, "Noindex robots meta (stealth)",
                "no homepage HTML to parse", "homepage must be reachable")
    meta = find_meta(head.metas, name="robots")
    content = meta.get("content", "").lower() if meta else ""
    if "noindex" in content:
        return (PASS, "Noindex robots meta (stealth)",
                "robots meta = " + content)
    return (FAIL, "Noindex robots meta (stealth)",
            "no <meta name=\"robots\" content=\"noindex\"> found"
            + (" (content: {!r})".format(content) if content else ""),
            "add <meta name=\"robots\" content=\"noindex, nofollow\"> so the "
            "stealth site is not indexed")


def check_xrobots_header(ctx):
    """
    Stealth-only check: the homepage HTTP response must carry an
    `X-Robots-Tag` header containing `noindex`.

    This is the defense-in-depth companion to the noindex robots meta tag — the
    header keeps a stealth site out of search indexes even for responses a
    crawler fetches without parsing the HTML (and for non-HTML routes). This
    check is skipped entirely in standard mode (it is never added to the check
    list there).
    """
    resp = ctx["home"]
    if resp is None:
        return (FAIL, "X-Robots-Tag header (stealth)",
                "homepage is unreachable", "homepage must be reachable")
    value = resp.header("x-robots-tag")
    if "noindex" in value.lower():
        return (PASS, "X-Robots-Tag header (stealth)",
                "X-Robots-Tag: " + value)
    return (FAIL, "X-Robots-Tag header (stealth)",
            "X-Robots-Tag header {}".format(
                "is {!r}".format(value) if value else "is missing"),
            "send an `X-Robots-Tag: noindex` HTTP response header (e.g. via a "
            "_headers file or the Cloudflare adapter) for the stealth site")


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
    except Exception as err:  # pragma: no cover - defensive catch-all
        results.record(
            FAIL,
            getattr(func, "__name__", "check"),
            "unexpected error: {}".format(err),
            "this is a verifier bug or a severe network failure",
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def normalize_url(raw):
    """Ensure the target URL has an https scheme and no surrounding noise."""
    url = raw.strip()
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = "https://" + url
    return url


def build_context(base_url, stealth):
    """
    Fetch the homepage once and assemble the context dict shared by all checks.
    A single homepage fetch keeps the run fast and consistent.
    """
    home = None
    try:
        home = fetch(base_url)
    except (urllib.error.URLError, socket.timeout, ssl.SSLError, OSError) as err:
        print("  (homepage fetch failed: {})".format(err))

    head = parse_head(home.body) if (home and home.body) else None
    return {
        "base": base_url,
        "stealth": stealth,
        "home": home,
        "head": head,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Post-deploy verifier for Astro 6 + Cloudflare Workers "
                    "sites.",
    )
    parser.add_argument("url", help="Site URL, e.g. https://example.com")
    parser.add_argument(
        "--stealth",
        action="store_true",
        help="Verify the anonymity / coming-soon variant: expect noindex, "
             "robots Disallow: /, and no sitemap; OG and JSON-LD become "
             "warnings.",
    )
    args = parser.parse_args(argv)

    style = Style(sys.stdout.isatty())
    base_url = normalize_url(args.url)

    mode = "stealth / coming-soon" if args.stealth else "standard / public"
    print(style.bold("Verifying {}".format(base_url)))
    print(style.dim("Mode: {}".format(mode)))
    print("")

    ctx = build_context(base_url, args.stealth)
    results = Results(style)

    # Ordered list of checks. The stealth-only robots-meta check is appended
    # only when --stealth is set.
    checks = [
        check_homepage,
        check_cloudflare,
        check_security_headers,
        check_hashed_asset,
        check_open_graph,
        check_twitter_card,
        check_canonical,
        check_json_ld,
        check_csp_meta,
        check_sitemap,
        check_robots,
        check_custom_404,
        check_analytics_beacon,
        check_favicons,
    ]
    if args.stealth:
        checks.append(check_robots_meta)
        checks.append(check_xrobots_header)

    for check in checks:
        run_check(results, check, ctx)

    # Summary.
    print("")
    summary = "{} passed, {} failed, {} warnings".format(
        results.passed, results.failed, results.warnings
    )
    print(style.bold(summary))

    if results.failed == 0:
        verdict = "VERDICT: site looks correctly configured."
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
