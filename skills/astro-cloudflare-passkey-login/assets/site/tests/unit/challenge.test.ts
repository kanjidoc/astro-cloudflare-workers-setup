import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openChallenge, sealChallenge } from '../../src/lib/auth/challenge.ts';
import { USERS } from '../../src/data/auth.ts';

const SECRET = 'test-secret-0123456789abcdef0123456789';
const NOW = 1_800_000_000_000;

test('seal/open round-trip keeps the payload', async () => {
  const payload = {
    c: 'chal',
    p: 'reg' as const,
    i: 'abc',
    u: USERS[0],
    exp: NOW + 1000,
  };
  const sealed = await sealChallenge(SECRET, payload);
  assert.deepEqual(await openChallenge(SECRET, sealed, NOW, 'reg'), payload);
});

test('a tampered payload or signature is rejected', async () => {
  const sealed = await sealChallenge(SECRET, {
    c: 'chal',
    p: 'auth',
    exp: NOW + 1000,
  });
  const [body, sig] = sealed.split('.');
  const forged = await sealChallenge('another-secret-0123456789abcdef0123', {
    c: 'evil',
    p: 'auth',
    exp: NOW + 1000,
  });
  assert.equal(
    await openChallenge(SECRET, `${forged.split('.')[0]}.${sig}`, NOW, 'auth'),
    null,
  );
  assert.equal(
    await openChallenge(SECRET, `${body}.${sig.slice(1)}x`, NOW, 'auth'),
    null,
  );
  assert.equal(await openChallenge(SECRET, forged, NOW, 'auth'), null);
  assert.equal(await openChallenge(SECRET, 'garbage', NOW, 'auth'), null);
  assert.equal(await openChallenge(SECRET, null, NOW, 'auth'), null);
});

test('expired and wrong-purpose challenges are rejected', async () => {
  const sealed = await sealChallenge(SECRET, {
    c: 'chal',
    p: 'auth',
    exp: NOW,
  });
  assert.equal(await openChallenge(SECRET, sealed, NOW, 'auth'), null);
  const fresh = await sealChallenge(SECRET, {
    c: 'chal',
    p: 'auth',
    exp: NOW + 1,
  });
  assert.equal(await openChallenge(SECRET, fresh, NOW, 'reg'), null);
  assert.notEqual(await openChallenge(SECRET, fresh, NOW, 'auth'), null);
});
