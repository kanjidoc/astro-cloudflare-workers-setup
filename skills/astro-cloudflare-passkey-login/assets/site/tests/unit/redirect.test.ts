import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupRedirectTarget } from '../../src/lib/gate/redirect.ts';

const ORIGIN = 'https://example.com';

test('backupRedirectTarget preserves a normal path and query', () => {
  assert.equal(
    backupRedirectTarget(ORIGIN, '/x', '?y=1'),
    'https://example.com/x?y=1',
  );
  assert.equal(
    backupRedirectTarget(ORIGIN, '/', ''),
    'https://example.com/',
  );
});

test('a leading // never turns into an open redirect off the origin host', () => {
  // `new URL('//evil.example/x', ORIGIN)` would read this as a network-path reference and
  // redirect to https://evil.example/x. The fix must stay on example.com.
  const href = backupRedirectTarget(ORIGIN, '//evil.example/x', '');
  const target = new URL(href);
  assert.equal(target.hostname, 'example.com');
  assert.equal(href, 'https://example.com//evil.example/x');
});

test('a leading /\\ (folded to //) also never leaves the origin host', () => {
  const href = backupRedirectTarget(ORIGIN, '/\\evil.example/x', '');
  const target = new URL(href);
  assert.equal(target.hostname, 'example.com');
});
