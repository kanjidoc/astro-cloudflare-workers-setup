// src/lib/auth/http.ts: readJson must never buffer an unbounded body (technical fix wave item 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../../src/lib/auth/http.ts';

/** A real request whose body is never actually read: `.text()` is spied to prove it. */
function spiedRequest(contentLength: string, body: string) {
  const request = new Request('https://example.com/auth/signin/verify', {
    method: 'POST',
    body,
  });
  request.headers.set('Content-Length', contentLength);
  let calls = 0;
  const original = request.text.bind(request);
  request.text = async () => {
    calls++;
    return original();
  };
  return { request, calls: () => calls };
}

test('an oversize Content-Length is refused before the body is read', async () => {
  const { request, calls } = spiedRequest('1000000', '{}');
  const result = await readJson(request, 16_384);
  assert.equal(result, null);
  assert.equal(calls(), 0, 'request.text() must never be called');
});

test('a Content-Length within budget is read normally', async () => {
  const { request } = spiedRequest('2', '{}');
  const result = await readJson(request, 16_384);
  assert.deepEqual(result, {});
});

test('no Content-Length still enforces maxBytes by actual byte length, not text.length', async () => {
  // Each "é" is 1 UTF-16 code unit but 2 UTF-8 bytes, so text.length understates the real size.
  const value = 'é'.repeat(10);
  const body = JSON.stringify({ v: value }); // ~10 chars over budget in bytes, not in .length
  const maxBytes = new TextEncoder().encode(body).length - 1;
  const request = new Request('https://example.com/auth/signin/verify', {
    method: 'POST',
    body,
  });
  request.headers.delete('Content-Length');
  const result = await readJson(request, maxBytes);
  assert.equal(
    result,
    null,
    'byte length, not UTF-16 length, must be enforced',
  );
});

test('a small valid body still parses', async () => {
  const request = new Request('https://example.com/auth/signin/verify', {
    method: 'POST',
    body: JSON.stringify({ ok: true }),
  });
  assert.deepEqual(await readJson(request), { ok: true });
});
