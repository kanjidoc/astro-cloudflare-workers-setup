import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wantsDocument } from '../../src/lib/gate/classify.ts';

function req(dest?: string): Request {
  const headers = new Headers();
  if (dest !== undefined) headers.set('Sec-Fetch-Dest', dest);
  return new Request('https://example.com/x', { headers });
}

test('documents and requests without Sec-Fetch-Dest get the lock page', () => {
  assert.equal(wantsDocument(req('document')), true);
  assert.equal(wantsDocument(req()), true);
});

test('images, scripts and fetches get a 401', () => {
  for (const dest of ['image', 'script', 'style', 'empty', 'font', 'iframe']) {
    assert.equal(wantsDocument(req(dest)), false, dest);
  }
});
