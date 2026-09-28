// Auth constants and settings. One place for every lifetime (technical spec §5.5, §14).
import { RP_NAME } from '../../data/auth.ts';

/** Session lifetime: 24 h from the unlock, fixed, never renewed. Cookie Max-Age and KV TTL. */
export const SESSION_TTL_S = 86_400;
/** Invite links last 7 days, single use. */
export const INVITE_TTL_S = 604_800;
/** Signed challenge cookie lifetime. */
export const CHALLENGE_TTL_S = 300;
/** One-time arrival cookie lifetime (the bloom on the next gated page). */
export const ARRIVAL_TTL_S = 30;

/** The subset of Workers KV the auth code uses. `KVNamespace` satisfies it; tests use a fake. */
export interface KVLike {
  get(key: string, type: 'json'): Promise<unknown>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: Record<string, unknown> },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

/** The subset of the Rate Limiting binding the auth code uses. */
export interface RateLimiterLike {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** What the auth code reads from `env`. Every field is optional so a missing one fails closed. */
export interface AuthEnv {
  RP_ID?: string;
  ORIGIN?: string;
  AUTH_COOKIE_SECRET?: string;
  AUTH_KV?: KVLike;
  AUTH_RATE_LIMIT?: RateLimiterLike;
}

export interface AuthConfig {
  rpID: string;
  rpName: string;
  origin: string;
  cookieSecret: string;
  kv: KVLike;
  limiter: RateLimiterLike | undefined;
}

/**
 * Validated auth settings, or null when anything required is missing or malformed.
 * Callers fail closed on null: auth endpoints answer 503 and the gate serves the lock page.
 */
export function authConfig(env: AuthEnv): AuthConfig | null {
  const { RP_ID, ORIGIN, AUTH_COOKIE_SECRET, AUTH_KV } = env;
  if (!RP_ID || !ORIGIN || !AUTH_KV) return null;
  if (!AUTH_COOKIE_SECRET || AUTH_COOKIE_SECRET.length < 32) return null;
  let origin: URL;
  try {
    origin = new URL(ORIGIN);
  } catch {
    return null;
  }
  if (origin.origin !== ORIGIN || origin.hostname !== RP_ID) return null;
  return {
    rpID: RP_ID,
    // Shown in the passkey prompt.
    rpName: RP_NAME,
    origin: ORIGIN,
    cookieSecret: AUTH_COOKIE_SECRET,
    kv: AUTH_KV,
    limiter: env.AUTH_RATE_LIMIT,
  };
}
