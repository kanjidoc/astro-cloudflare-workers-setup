# Anonymity-first variant

For a site that must **not be discovered yet** — a stealth coming-soon page, a property holding company, a pre-launch brand. Use this instead of the standard Step 13–14 SEO work. Confirm the user actually wants this (Confirm Inputs, Q7) before applying it.

## Defense-in-depth `noindex` — apply all three layers

Each layer covers a different crawler failure mode; use all three.

1. **HTML meta** — in `Layout.astro` `<head>`:
   ```html
   <meta name="robots" content="noindex,nofollow" />
   ```
   Catches any crawler that parses HTML.

2. **HTTP header** — add `X-Robots-Tag` into the `/*` block of the `public/_headers` file from Step 14 (don't make a second file — merge it). The merged block:
   ```
   /*
     X-Robots-Tag: noindex, nofollow
     Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
     X-Content-Type-Options: nosniff
     X-Frame-Options: DENY
     Referrer-Policy: strict-origin-when-cross-origin
     Permissions-Policy: camera=(), microphone=(), geolocation=()
   ```
   Catches crawlers that don't run JS or fetch the body. `verify_site.py --stealth` checks for this header.

3. **`public/robots.txt`** — replace the `Sitemap:` line entirely with:
   ```
   User-agent: *
   Disallow: /
   ```
   A polite signal to compliant crawlers; not enforcement, but layered with 1 and 2 it is enough.

## Skip in Step 13

- **Don't** install `@astrojs/sitemap` — no `sitemap-index.xml` should exist.
- **Don't** add JSON-LD with real names, addresses, or credentials.
- **Don't** generate an OG image — link-preview caches index by URL forever, so anything shipped now is what the user is stuck with at launch. Defer it.
- **Don't** add a real `security.txt` contact until launch.

CSP (`security: { csp: true }`), the Fonts API, `imageService: 'compile'`, the security/cache `_headers`, and accessibility (Step 15) all still apply unchanged.

## Repo & domain posture

- GitHub repo `--private`. Description vague or empty ("Project landing page", "Coming soon").
- Commit messages stay about code and architecture — never business intent.
- Register the domain through Cloudflare Registrar (free WHOIS privacy by default).
- Don't add MX/TXT records that name the business until launch.

## Verify

Run the verifier in stealth mode:

```bash
python3 ~/.claude/skills/astro-cloudflare-workers-setup/scripts/verify_site.py https://<domain> --stealth
```

It inverts the indexability checks: it requires the `noindex` robots meta, requires `robots.txt` to disallow all crawling, and accepts a missing sitemap. OG and JSON-LD checks become advisory.

## Launch checklist — document this in the project's CLAUDE.md

When the site goes public, do it in one reversible PR so a slipped launch is easy to roll back:

1. Install `@astrojs/sitemap`; add it to `astro.config.mjs`.
2. Add the JSON-LD schema (`src/data/site.ts`).
3. Generate and ship the OG image.
4. Remove all three `noindex` layers (meta tag, `X-Robots-Tag`, `Disallow: /`).
5. Restore the `Sitemap:` line in `robots.txt`.
6. Run `verify_site.py` **without** `--stealth` — it should now pass the full public-site check set.

Future Claude sessions must know the stealth posture is deliberate, not an oversight — that is why it belongs in the project `CLAUDE.md`.
