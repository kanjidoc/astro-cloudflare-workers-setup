// The backup-host → apex redirect target. Pulled out of src/worker.ts (which can't be
// unit-tested: it imports @astrojs/cloudflare/handler, which imports cloudflare:workers, which
// only exists inside workerd) so this specific logic can be node:test-ed directly.
/**
 * Builds the apex URL for `pathname`/`search`, always on `origin`'s own host.
 *
 * Never build this with `new URL(pathname + search, origin)`: a `pathname` starting with `//`
 * (or `/\`, which the URL parser folds to `//`) is a network-path reference in a relative
 * resolve, so the parser would read everything after it as a *new* host — an open redirect
 * (`//evil.example/x` resolved against `https://example.com` → `https://evil.example/x`).
 * Setting `.pathname`/`.search` on a URL already anchored to `origin` never re-parses the host.
 */
export function backupRedirectTarget(
  origin: string,
  pathname: string,
  search: string,
): string {
  const target = new URL(origin);
  target.pathname = pathname;
  target.search = search;
  return target.href;
}
