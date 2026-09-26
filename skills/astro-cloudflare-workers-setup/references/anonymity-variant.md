# Anonymity-first variant

For a site that must **not be discovered yet** — a stealth coming-soon page, a property holding company, a pre-launch brand. Use this instead of the standard Step 13–14 SEO work. Confirm the user actually wants this (Confirm Inputs, **Q9**) before applying it.

`<skill-dir>` below is the skill directory named at the top of SKILL.md.

## Keep it out of search — two `noindex` layers, and let crawlers see them

Each `noindex` layer covers a different crawler failure mode; use both. The third piece, `robots.txt`, must stay **open** — a crawler that is blocked from fetching a page never sees its `noindex`, and can still index the bare URL from external links.

1. **HTML meta** — in `Layout.astro` `<head>`:
   ```html
   <meta name="robots" content="noindex,nofollow" />
   ```
   Catches any crawler that parses HTML.

2. **HTTP header** — add `X-Robots-Tag` into the `/*` block of the `public/_headers` file copied at Step 8 (don't make a second file — merge it). The merged block:
   ```
   /*
     X-Robots-Tag: noindex, nofollow
     Strict-Transport-Security: max-age=31536000; includeSubDomains
     X-Content-Type-Options: nosniff
     X-Frame-Options: DENY
     Referrer-Policy: strict-origin-when-cross-origin
     Permissions-Policy: camera=(), microphone=(), geolocation=()
   ```
   Catches crawlers that don't parse the body (images, PDFs, HEAD requests). **Never add HSTS `preload`** on a stealth site — a preload-list entry publishes the domain in browser source code.

3. **`public/robots.txt`** — omit the `Sitemap:` line and do **not** add `Disallow: /`. Crawlers must be able to fetch pages to see layers 1–2:
   ```
   User-agent: *
   Allow: /
   ```

## Skip in Step 13

- **No sitemap** — Step 4's install line and `astro.config.mjs` block leave out `@astrojs/sitemap` / `sitemap()` when stealth is chosen; also leave out the `<link rel="sitemap">` head tag. No `sitemap-index.xml` should exist.
- **Don't** add JSON-LD with real names, addresses, or credentials.
- **Don't** generate an OG image — link-preview caches index by URL forever, so anything shipped now is what the user is stuck with at launch. Run `gen-images.mjs` with `--no-og` (favicons only), and leave the `og:image*` / `twitter:image` tags out of `Layout.astro` until launch.
- **Don't** add a real `security.txt` contact until launch.

CSP (the Step 4 `security.csp` block), the Fonts API, `imageService: 'compile'`, the security/cache `_headers`, and accessibility (Step 15) all still apply unchanged.

## Repo & domain posture

- GitHub repo `--private`. Description vague or empty ("Project landing page", "Coming soon").
- Commit messages stay about code and architecture — never business intent.
- Register the domain through Cloudflare Registrar (free WHOIS privacy by default).
- Don't add MX/TXT records that name the business until launch.
- **Limits of stealth — tell the user.** `noindex` keeps the page out of search results, not out of sight. The moment a custom domain gets its TLS certificate, the hostname appears in public Certificate Transparency logs (e.g. crt.sh) within minutes, and anyone can visit it. Put nothing on the page that must stay secret; for real privacy, put it behind **Cloudflare Access** instead.

## Verify

Run the verifier in stealth mode:

```bash
python3 "<skill-dir>/scripts/verify_site.py" https://<domain> --stealth
```

It inverts the indexability checks: it requires the `noindex` robots meta and the `X-Robots-Tag` header, **warns** if `robots.txt` blocks crawling, and accepts a missing sitemap. OG and JSON-LD checks become advisory. Before a push, the same check runs against the local preview with `--local` added.

## Launch checklist — document this in the project's CLAUDE.md

When the site goes public, do it in one reversible PR so a slipped launch is easy to roll back:

1. `npm i @astrojs/sitemap`; add `sitemap()` to `integrations` in `astro.config.mjs` and the `<link rel="sitemap" href="/sitemap-index.xml">` tag to `Layout.astro`.
2. Add the JSON-LD schema (`src/data/site.ts`).
3. Generate the OG image — `node "<skill-dir>/scripts/gen-images.mjs" "<Site Name>" "<tagline>"` (no `--no-og`; in the project CLAUDE.md write this as "run the setup skill's `gen-images.mjs` without `--no-og`", since `<skill-dir>` means nothing there) — and add the `og:image*` / `twitter:image` tags to `Layout.astro`.
4. Remove both `noindex` layers (the meta tag and the `X-Robots-Tag` line).
5. Restore the `Sitemap:` line in `robots.txt`.
6. Run `verify_site.py` **without** `--stealth` — it should pass the full public-site check set, and it FAILs on any leftover `noindex`.

HSTS `preload` stays opt-in after launch too.

Future Claude sessions must know the stealth posture is deliberate, not an oversight — that is why it belongs in the project `CLAUDE.md`.
