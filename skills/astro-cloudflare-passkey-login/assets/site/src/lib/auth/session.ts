// Sessions: 24 h from the unlock, fixed, never renewed (technical spec §5.5).
// The cookie holds a random token; KV holds only its SHA-256.
import type { User } from '../../data/auth.ts';
import type { KVLike } from './config.ts';
import { SESSION_COOKIE, readCookie, sessionCookie } from './cookies.ts';
import { randomToken, sha256Hex } from './crypto.ts';
import { getSession, putSession, type SessionRecord } from './store.ts';

export interface ResolvedSession {
  user: User;
  keyHash: string;
  record: SessionRecord;
}

export interface SessionMeta {
  ua: string;
  country: string;
}

/** True when the request carries a session cookie at all (valid or not). */
export function hasSessionCookie(request: Request): boolean {
  return readCookie(request, SESSION_COOKIE) !== null;
}

export async function resolveSession(
  request: Request,
  kv: KVLike,
): Promise<ResolvedSession | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const keyHash = await sha256Hex(token);
  const record = await getSession(kv, keyHash);
  return record ? { user: record.user, keyHash, record } : null;
}

/** Stores a new session and returns its Set-Cookie header value. */
export async function createSession(
  kv: KVLike,
  user: User,
  credentialId: string,
  meta: SessionMeta,
  now: number,
): Promise<string> {
  const token = randomToken();
  await putSession(kv, await sha256Hex(token), {
    user,
    credentialId,
    createdAt: now,
    ua: meta.ua.slice(0, 120),
    country: meta.country,
  });
  return sessionCookie(token);
}

/** Session metadata from the request: coarse UA and country only (no IP). */
export function sessionMeta(request: Request): SessionMeta {
  const cf = (request as Request & { cf?: { country?: unknown } }).cf;
  return {
    ua: request.headers.get('User-Agent') ?? '',
    country: typeof cf?.country === 'string' ? cf.country : '',
  };
}
