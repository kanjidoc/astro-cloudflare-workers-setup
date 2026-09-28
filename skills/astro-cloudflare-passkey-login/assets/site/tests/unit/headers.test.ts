import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECURITY_HEADERS,
  applyGatedCache,
  applyNoStore,
  applySecurityHeaders,
} from '../../src/lib/gate/headers.ts';

function html(): Response {
  return new Response('<html></html>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"abc"' },
  });
}

test('every response class carries the security headers', () => {
  const classes = [
    html(),
    new Response(null, { status: 401 }),
    Response.redirect('https://example.com/x', 301),
    Response.json({ ok: false }, { status: 401 }),
    new Response(null, { status: 204 }),
  ];
  for (const res of classes) {
    const out = applySecurityHeaders(res);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      assert.equal(out.headers.get(name), value, `${res.status} ${name}`);
    }
    assert.equal(out.status, res.status);
    assert.doesNotMatch(
      out.headers.get('Strict-Transport-Security') ?? '',
      /preload/,
    );
  }
});

test('the invite page gets no-referrer', () => {
  const out = applySecurityHeaders(html(), { referrerPolicy: 'no-referrer' });
  assert.equal(out.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(out.headers.get('X-Robots-Tag'), 'noindex, nofollow');
});

test('gated cache policy', () => {
  const page = applyGatedCache(html(), '/');
  assert.equal(page.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(page.headers.get('ETag'), null);

  const hashed = applyGatedCache(
    new Response('x', { headers: { 'Content-Type': 'image/webp' } }),
    '/_astro/photo.abc.webp',
  );
  assert.equal(
    hashed.headers.get('Cache-Control'),
    'private, max-age=31536000, immutable',
  );

  const other = applyGatedCache(
    new Response('x', { headers: { 'Content-Type': 'image/svg+xml' } }),
    '/images/logo.svg',
  );
  assert.equal(other.headers.get('Cache-Control'), 'private, no-cache');
});

test('lock, invite, auth JSON and 401s are no-store', () => {
  const out = applyNoStore(html());
  assert.equal(out.headers.get('Cache-Control'), 'no-store');
  assert.equal(out.headers.get('ETag'), null);
});
