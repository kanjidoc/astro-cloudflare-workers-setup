// Security headers and cache policy (technical spec §7.4). The Worker is authoritative:
// _headers rules don't reach responses the Worker creates (redirects, 401s, JSON, rewritten HTML).
// Stealth: X-Robots-Tag goes on every response. Never add HSTS preload.

export const SECURITY_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
} as const;

export interface SecurityHeaderOptions {
  /** The invite page sends no referrer, so its token never leaks. */
  referrerPolicy?: 'no-referrer';
}

/** A copy of `res` with mutable headers (asset and fetch responses have immutable ones). */
export function mutable(res: Response): Response {
  return new Response(res.body, res);
}

export function applySecurityHeaders(
  res: Response,
  opts: SecurityHeaderOptions = {},
): Response {
  const out = mutable(res);
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    out.headers.set(name, value);
  if (opts.referrerPolicy)
    out.headers.set('Referrer-Policy', opts.referrerPolicy);
  return out;
}

export function isHtml(res: Response): boolean {
  return (res.headers.get('Content-Type') ?? '').includes('text/html');
}

/** Cache policy for content served behind the gate. */
export function applyGatedCache(res: Response, pathname: string): Response {
  const out = mutable(res);
  if (isHtml(out)) {
    out.headers.set('Cache-Control', 'private, no-store');
    out.headers.delete('ETag');
  } else if (pathname.startsWith('/_astro/')) {
    out.headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  } else {
    out.headers.set('Cache-Control', 'private, no-cache');
  }
  return out;
}

/** Lock and invite pages, auth JSON and 401s. */
export function applyNoStore(res: Response): Response {
  const out = mutable(res);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.delete('ETag');
  return out;
}
