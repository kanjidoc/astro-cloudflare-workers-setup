import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b64url, hex, utf8 } from '../../src/lib/auth/encoding.ts';
import {
  hmacSign,
  hmacVerify,
  randomToken,
  sha256Hex,
} from '../../src/lib/auth/crypto.ts';

test('base64url round-trips every byte value without padding', () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
  const text = b64url.encode(bytes);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(b64url.decode(text), bytes);
  assert.equal(b64url.encode(utf8('hi?>')), 'aGk_Pg');
});

test('base64url decode rejects other alphabets', () => {
  assert.throws(() => b64url.decode('aGk/Pg=='), TypeError);
  assert.throws(() => b64url.decode('a'), TypeError);
});

test('hex encodes bytes', () => {
  assert.equal(hex(new Uint8Array([0, 15, 255])), '000fff');
});

test('randomToken is 32 random bytes as base64url by default', () => {
  const a = randomToken();
  const b = randomToken();
  assert.equal(a.length, 43);
  assert.equal(b64url.decode(a).length, 32);
  assert.notEqual(a, b);
  assert.equal(b64url.decode(randomToken(16)).length, 16);
});

test('sha256Hex matches the known vector', async () => {
  assert.equal(
    await sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('hmacVerify accepts its own signature and rejects tampering', async () => {
  const sig = await hmacSign('secret-one', 'payload');
  assert.equal(await hmacVerify('secret-one', 'payload', sig), true);
  assert.equal(await hmacVerify('secret-two', 'payload', sig), false);
  assert.equal(await hmacVerify('secret-one', 'payload!', sig), false);
  assert.equal(
    await hmacVerify('secret-one', 'payload', 'not/base64url'),
    false,
  );
});
