import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHALLENGE_TTL_S,
  INVITE_TTL_S,
  SESSION_TTL_S,
  authConfig,
} from '../../src/lib/auth/config.ts';
import { FakeKV } from './helpers/fake-kv.ts';
import { RP_NAME } from '../../src/data/auth.ts';

const GOOD = {
  RP_ID: 'example.com',
  ORIGIN: 'https://example.com',
  BACKUP_HOST: 'example.workers.dev',
  AUTH_COOKIE_SECRET: 'x'.repeat(44),
  AUTH_KV: new FakeKV(),
};

test('lifetimes match the decisions', () => {
  assert.equal(SESSION_TTL_S, 86_400);
  assert.equal(INVITE_TTL_S, 604_800);
  assert.equal(CHALLENGE_TTL_S, 300);
});

test('authConfig returns the validated settings', () => {
  const cfg = authConfig(GOOD);
  assert.ok(cfg);
  assert.equal(cfg.rpID, 'example.com');
  assert.equal(cfg.origin, 'https://example.com');
  assert.equal(cfg.rpName, RP_NAME);
  assert.equal(cfg.limiter, undefined);
});

test('authConfig accepts the local settings', () => {
  const cfg = authConfig({
    ...GOOD,
    RP_ID: 'localhost',
    ORIGIN: 'http://localhost:4321',
  });
  assert.equal(cfg?.origin, 'http://localhost:4321');
});

test('authConfig fails closed on anything missing or malformed', () => {
  assert.equal(authConfig({ ...GOOD, AUTH_COOKIE_SECRET: undefined }), null);
  assert.equal(authConfig({ ...GOOD, AUTH_COOKIE_SECRET: 'too-short' }), null);
  assert.equal(authConfig({ ...GOOD, AUTH_KV: undefined }), null);
  assert.equal(authConfig({ ...GOOD, RP_ID: '' }), null);
  assert.equal(authConfig({ ...GOOD, ORIGIN: 'not a url' }), null);
  assert.equal(
    authConfig({ ...GOOD, ORIGIN: 'https://example.com/' }),
    null,
  );
  assert.equal(authConfig({ ...GOOD, ORIGIN: 'https://evil.example' }), null);
});
