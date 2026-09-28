// Shared response helpers and endpoint guards. A guard returns a Response to send back,
// or null to carry on.
import type { RateLimiterLike } from './config.ts';

/** JSON response. Auth JSON is never cached. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** Misconfiguration (missing secret, KV or vars): fail closed. */
export function unavailable(): Response {
  return json({ ok: false }, 503);
}

export function withCookies(res: Response, cookies: string[]): Response {
  for (const cookie of cookies) res.headers.append('Set-Cookie', cookie);
  return res;
}

/** CSRF: the Origin must be ours, and Sec-Fetch-Site (when sent) must be same-origin. */
export function requireSameOrigin(
  request: Request,
  origin: string,
): Response | null {
  if (request.headers.get('Origin') !== origin) return json({ ok: false }, 403);
  const site = request.headers.get('Sec-Fetch-Site');
  if (site !== null && site !== 'same-origin') return json({ ok: false }, 403);
  return null;
}

/** application/json forces a CORS preflight, which is never granted. */
export function requireJson(request: Request): Response | null {
  const type = (request.headers.get('Content-Type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  return type === 'application/json' ? null : json({ ok: false }, 415);
}

export type RateBucket = 'signin' | 'invite' | 'invite-get';

let warnedNoLimiter = false;

/** 10 per 60 s per IP per bucket. A missing binding means no limit (it's a brake, not a quota). */
export async function rateLimit(
  limiter: RateLimiterLike | undefined,
  request: Request,
  bucket: RateBucket,
): Promise<Response | null> {
  if (!limiter) {
    if (!warnedNoLimiter)
      console.warn('auth: AUTH_RATE_LIMIT binding missing, not rate limiting');
    warnedNoLimiter = true;
    return null;
  }
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await limiter.limit({ key: `${ip}:${bucket}` });
  return success ? null : json({ ok: false }, 429);
}

/** Parsed JSON body, or null when it's missing, malformed or over `maxBytes`. */
export async function readJson(
  request: Request,
  maxBytes = 16_384,
): Promise<unknown> {
  // Reject an oversize body up front, from the declared length, before reading a single byte
  // of it (a missing or non-numeric header just falls through to the length check below).
  const contentLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return null;
  const text = await request.text().catch(() => '');
  // .length is UTF-16 code units, not bytes: a body of multi-byte characters could clear this
  // check while actually exceeding maxBytes on the wire, so the real byte length is measured.
  if (!text || new TextEncoder().encode(text).length > maxBytes) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
