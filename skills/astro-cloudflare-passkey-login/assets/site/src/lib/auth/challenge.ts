// Stateless WebAuthn challenge: a signed, expiring cookie instead of a KV write (technical spec §4, §5.1).
import type { User } from '../../data/auth.ts';
import { hmacSign, hmacVerify } from './crypto.ts';
import { b64url, utf8 } from './encoding.ts';

export type ChallengePurpose = 'auth' | 'reg';

export interface ChallengePayload {
  /** The WebAuthn challenge (base64url), exactly as sent in the options. */
  c: string;
  p: ChallengePurpose;
  /** Registration only: sha256 hex of the invite token. */
  i?: string;
  /** Registration only: who the invite is for. */
  u?: User;
  /** Expiry, ms since epoch. */
  exp: number;
}

export async function sealChallenge(
  secret: string,
  payload: ChallengePayload,
): Promise<string> {
  const body = b64url.encode(utf8(JSON.stringify(payload)));
  return `${body}.${await hmacSign(secret, body)}`;
}

/** The payload if the cookie is authentic, unexpired and for `purpose`; otherwise null. */
export async function openChallenge(
  secret: string,
  cookie: string | null,
  now: number,
  purpose: ChallengePurpose,
): Promise<ChallengePayload | null> {
  if (!cookie) return null;
  const dot = cookie.indexOf('.');
  if (dot <= 0) return null;
  const body = cookie.slice(0, dot);
  if (!(await hmacVerify(secret, body, cookie.slice(dot + 1)))) return null;
  let payload: ChallengePayload;
  try {
    payload = JSON.parse(
      new TextDecoder().decode(b64url.decode(body)),
    ) as ChallengePayload;
  } catch {
    return null;
  }
  if (typeof payload.c !== 'string' || typeof payload.exp !== 'number')
    return null;
  if (payload.p !== purpose || payload.exp <= now) return null;
  return payload;
}
