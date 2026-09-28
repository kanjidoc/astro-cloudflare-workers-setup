import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicPath } from '../../src/lib/gate/allowlist.ts';

const PUBLIC = [
  '/favicon.svg',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/robots.txt',
  '/og.webp',
  '/_astro/Layout.DB3ELqNt.css',
  '/_astro/lock.astro_astro_type_script_index_0_lang.BxY1-2_z.js',
  '/_astro/fonts/b700bf46346f99e2.woff2',
];

const GATED = [
  '/',
  '/index.html',
  '/lock/',
  '/404.html',
  '/some/deep/path',
  '/_astro/photo.png',
  '/_astro/photo.webp',
  '/_astro/photo.svg',
  '/_astro/photo.avif',
  '/_astro/photo.jpg',
  '/_astro/nested/app.js',
  '/_astro/..%2findex.html',
  '/_astro/%2e%2e/index.js',
  '/_astro/../index.js',
  '/_astro//x.js',
  '/_astro/.hidden.js',
  '//og.webp',
  '/og.webp/',
  '/OG.WEBP',
  '/images/logo.svg',
  '/images/',
  '/auth/signin/options',
  '/invite/abc',
];

test('every allowlisted path is public', () => {
  for (const path of PUBLIC) assert.equal(isPublicPath(path), true, path);
});

test('everything else is gated, including images and traversal tricks', () => {
  for (const path of GATED) assert.equal(isPublicPath(path), false, path);
});
