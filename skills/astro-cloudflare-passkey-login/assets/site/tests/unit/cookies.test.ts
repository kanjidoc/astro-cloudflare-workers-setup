import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arrivalCookie,
  challengeCookie,
  clearArrivalCookie,
  clearChallengeCookie,
  clearSessionCookie,
  readCookie,
  sessionCookie,
} from '../../src/lib/auth/cookies.ts';

test('exact Set-Cookie strings', () => {
  assert.equal(
    sessionCookie('tok'),
    '__Host-auth-session=tok; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400',
  );
  assert.equal(
    clearSessionCookie(),
    '__Host-auth-session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0',
  );
  assert.equal(
    challengeCookie('a.b'),
    '__Host-auth-challenge=a.b; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=300',
  );
  assert.equal(
    clearChallengeCookie(),
    '__Host-auth-challenge=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0',
  );
  assert.equal(
    arrivalCookie('lock'),
    '__Host-auth-arrival=lock; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=30',
  );
  assert.equal(
    arrivalCookie('invite'),
    '__Host-auth-arrival=invite; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=30',
  );
  assert.equal(
    clearArrivalCookie(),
    '__Host-auth-arrival=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0',
  );
});

function withCookie(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set('Cookie', header);
  return new Request('https://example.com/', { headers });
}

test('readCookie finds a cookie among others, with spaces, first duplicate wins', () => {
  const req = withCookie(
    'a=1;  __Host-auth-session = tok1 ; b=2; __Host-auth-session=tok2',
  );
  assert.equal(readCookie(req, '__Host-auth-session'), 'tok1');
  assert.equal(readCookie(req, 'b'), '2');
  assert.equal(readCookie(req, 'missing'), null);
  assert.equal(readCookie(withCookie(null), 'a'), null);
  assert.equal(readCookie(withCookie('novalue; a=x=y'), 'a'), 'x=y');
});
