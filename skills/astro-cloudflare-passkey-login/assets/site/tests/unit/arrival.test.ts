import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arrivalAttributes,
  arrivalDecision,
} from '../../src/lib/gate/arrival.ts';

function req(method: string, dest?: string): Request {
  const headers = new Headers();
  if (dest !== undefined) headers.set('Sec-Fetch-Dest', dest);
  return new Request('https://example.com/', { method, headers });
}

test('a sign-in arrival adds data-arrival="unlock"', () => {
  assert.deepEqual(arrivalAttributes('lock'), { 'data-arrival': 'unlock' });
});

test('an invite arrival also adds data-arrival-from="invite"', () => {
  assert.deepEqual(arrivalAttributes('invite'), {
    'data-arrival': 'unlock',
    'data-arrival-from': 'invite',
  });
});

test('no cookie, an empty cookie or an unknown value adds nothing', () => {
  assert.deepEqual(arrivalAttributes(null), {});
  assert.deepEqual(arrivalAttributes(''), {});
  assert.deepEqual(arrivalAttributes('unlock'), {});
});

test('a GET document request with the cookie gets attributes and expires it', () => {
  assert.deepEqual(arrivalDecision(req('GET', 'document'), 'lock'), {
    attributes: { 'data-arrival': 'unlock' },
    expire: true,
  });
  // No Sec-Fetch-Dest (link-preview bots) also counts as "wants a document".
  assert.deepEqual(arrivalDecision(req('GET'), 'invite'), {
    attributes: { 'data-arrival': 'unlock', 'data-arrival-from': 'invite' },
    expire: true,
  });
});

test('HEAD never consumes the arrival cookie, even for a document', () => {
  assert.deepEqual(arrivalDecision(req('HEAD', 'document'), 'lock'), {
    attributes: {},
    expire: false,
  });
});

test('a non-document GET (image, script, fetch) never consumes the cookie', () => {
  assert.deepEqual(arrivalDecision(req('GET', 'image'), 'lock'), {
    attributes: {},
    expire: false,
  });
  assert.deepEqual(arrivalDecision(req('GET', 'empty'), 'lock'), {
    attributes: {},
    expire: false,
  });
});

test('no arrival cookie: never expires, even on a GET document', () => {
  assert.deepEqual(arrivalDecision(req('GET', 'document'), null), {
    attributes: {},
    expire: false,
  });
});
