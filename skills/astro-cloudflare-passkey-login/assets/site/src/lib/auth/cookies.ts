// Cookie names, parsing and exact Set-Cookie strings. `__Host-` pins each cookie to the exact
// host (Secure, Path=/, no Domain).
import { ARRIVAL_TTL_S, CHALLENGE_TTL_S, SESSION_TTL_S } from './config.ts';

export const SESSION_COOKIE = '__Host-auth-session';
export const CHALLENGE_COOKIE = '__Host-auth-challenge';
export const ARRIVAL_COOKIE = '__Host-auth-arrival';

/** Which screen the unlock came from. The Worker maps it to `data-arrival(-from)`. */
export type ArrivalFrom = 'lock' | 'invite';

/** Value of the first cookie called `name`, or null. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function cookie(
  name: string,
  value: string,
  sameSite: 'Lax' | 'Strict',
  maxAge: number,
): string {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}`;
}

export const sessionCookie = (token: string) =>
  cookie(SESSION_COOKIE, token, 'Lax', SESSION_TTL_S);
export const clearSessionCookie = () => cookie(SESSION_COOKIE, '', 'Lax', 0);
export const challengeCookie = (value: string) =>
  cookie(CHALLENGE_COOKIE, value, 'Strict', CHALLENGE_TTL_S);
export const clearChallengeCookie = () =>
  cookie(CHALLENGE_COOKIE, '', 'Strict', 0);
export const arrivalCookie = (from: ArrivalFrom) =>
  cookie(ARRIVAL_COOKIE, from, 'Strict', ARRIVAL_TTL_S);
export const clearArrivalCookie = () => cookie(ARRIVAL_COOKIE, '', 'Strict', 0);
