import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInviteArgs } from '../../scripts/auth/invite.mjs';
import {
  isNotFound,
  isRemoteNotFound,
  kv,
  namespaceArgs,
  parseTarget,
  previewNamespaceId,
} from '../../scripts/auth/kv.mjs';
import { formatListing } from '../../scripts/auth/list.mjs';
import {
  keysToDelete,
  parseRevokeArgs,
  pickOne,
} from '../../scripts/auth/revoke.mjs';
import { USERS } from '../../src/data/auth.ts';

// Names that must pass the USERS check come from the site's own list.
const [A, B = A] = USERS;

test('targets: --remote is the default; --local and --preview switch; only one allowed', () => {
  assert.deepEqual(parseTarget(['bob']), {
    target: 'remote',
    rest: ['bob'],
  });
  assert.deepEqual(parseTarget(['--local', 'bob']), {
    target: 'local',
    rest: ['bob'],
  });
  assert.equal(parseTarget(['bob', '--preview']).target, 'preview');
  assert.throws(() => parseTarget(['--local', '--remote']));
});

test('namespace args: binding for remote/local, the preview id for --preview', () => {
  assert.deepEqual(namespaceArgs('remote'), [
    '--binding',
    'AUTH_KV',
    '--remote',
  ]);
  assert.deepEqual(namespaceArgs('local'), ['--binding', 'AUTH_KV', '--local']);
  const jsonc = `{
    // comment
    "kv_namespaces": [{ "binding": "AUTH_KV", "id": "prod" }],
    "previews": { "kv_namespaces": [{ "binding": "AUTH_KV", "id": "prev123" },], },
  }`;
  assert.equal(previewNamespaceId(jsonc), 'prev123');
  assert.deepEqual(
    namespaceArgs('preview', () => jsonc),
    ['--namespace-id', 'prev123', '--remote'],
  );
  assert.throws(() => previewNamespaceId('{ "previews": {} }'), /No previews/);
});

test('kv.get: only a genuine "not found" becomes null; every other wrangler failure rethrows', () => {
  assert.equal(isNotFound('Value not found'), true);
  assert.equal(isNotFound('Value not found\n'), true);
  assert.equal(isNotFound('  Value not found  '), true);
  assert.equal(isNotFound('{"a":1}'), false);
  assert.equal(isNotFound(''), false);

  const notFoundStore = kv('local', () => 'Value not found\n');
  assert.equal(notFoundStore.get('user:alice'), null);

  const jsonStore = kv('local', () => '{"name":"alice"}');
  assert.deepEqual(jsonStore.get('user:alice'), { name: 'alice' });

  // A transient wrangler failure (network blip, auth hiccup, ...) must never be read as "missing":
  // invite.mjs relies on that distinction to avoid clobbering an existing user: record.
  const failingStore = kv('local', () => {
    throw new Error('wrangler exited with code 1');
  });
  assert.throws(() => failingStore.get('user:alice'), /exited with code 1/);
});

test('kv.get: a --remote/--preview 404 is null; every other failure (401/500/network) rethrows', () => {
  // Wrangler 4.141's actual --remote output for a missing key (captured against a live probe,
  // see the report): exit 1, nothing useful on stdout, this on stderr.
  const REMOTE_404 =
    'Failed to fetch https://api.cloudflare.com/client/v4/accounts/x/storage/kv/namespaces/y/values/does-not-exist-probe - 404: Not Found';

  assert.equal(isRemoteNotFound({ stderr: REMOTE_404 }), true);
  assert.equal(isRemoteNotFound({ stdout: REMOTE_404 }), true);
  assert.equal(isRemoteNotFound({ stderr: '401: Unauthorized' }), false);
  assert.equal(
    isRemoteNotFound({ stderr: '500: Internal Server Error' }),
    false,
  );
  assert.equal(
    isRemoteNotFound({ stderr: 'getaddrinfo ENOTFOUND api.cloudflare.com' }),
    false,
  );
  assert.equal(isRemoteNotFound({}), false);

  const notFoundErr = Object.assign(new Error('exit 1'), {
    stderr: REMOTE_404,
    stdout: '',
  });
  const remoteStore = kv('remote', () => {
    throw notFoundErr;
  });
  assert.equal(remoteStore.get('user:bob'), null);

  const previewStore = kv('preview', () => {
    throw notFoundErr;
  });
  assert.equal(previewStore.get('user:bob'), null);

  const unauthorizedErr = Object.assign(new Error('exit 1'), {
    stderr: '401: Unauthorized',
  });
  const unauthorizedStore = kv('remote', () => {
    throw unauthorizedErr;
  });
  assert.throws(
    () => unauthorizedStore.get('user:alice'),
    /exit 1/,
    'a real auth failure must never be read as "missing"',
  );

  const serverErr = Object.assign(new Error('exit 1'), {
    stderr: '500: Internal Server Error',
  });
  const serverStore = kv('remote', () => {
    throw serverErr;
  });
  assert.throws(() => serverStore.get('user:alice'), /exit 1/);

  const networkErr = Object.assign(
    new Error('getaddrinfo ENOTFOUND api.cloudflare.com'),
    {},
  );
  const networkStore = kv('remote', () => {
    throw networkErr;
  });
  assert.throws(() => networkStore.get('user:alice'), /ENOTFOUND/);
});

test('invite args: user, 7-day default, --hours, origin per target', () => {
  assert.deepEqual(parseInviteArgs([B]), {
    user: B,
    ttlSeconds: 604_800,
    origin: 'https://example.com',
    target: 'remote',
  });
  assert.equal(parseInviteArgs([A, '--hours', '2']).ttlSeconds, 7200);
  assert.equal(
    parseInviteArgs([A, '--local']).origin,
    'http://localhost:4321',
  );
  assert.equal(
    parseInviteArgs([A, '--local', '--origin', 'http://localhost:4322'])
      .origin,
    'http://localhost:4322',
  );
  assert.throws(() => parseInviteArgs([]));
  assert.throws(() => parseInviteArgs(['mallory']));
  assert.throws(() => parseInviteArgs([A, B]));
  assert.throws(() => parseInviteArgs([A, '--hours', '0']));
  assert.throws(() => parseInviteArgs([A, '--hours', '169']));
  assert.throws(() => parseInviteArgs([A, '--hours', '1.5']));
  assert.throws(() =>
    parseInviteArgs([A, '--origin', 'https://x.test/path']),
  );
});

const creds = [
  {
    name: 'cred:AbCdEfGh123',
    metadata: { user: 'alice', createdAt: 0, aaguid: 'x' },
  },
  {
    name: 'cred:ZyXwVuTs999',
    metadata: { user: 'bob', createdAt: 0, aaguid: 'y' },
  },
];
const sessions = [
  {
    name: 'session:aaaa1111ffff',
    metadata: { user: 'alice', credentialId: 'AbCdEfGh123' },
  },
  {
    name: 'session:aaaa2222ffff',
    metadata: { user: 'alice', credentialId: 'other' },
  },
  {
    name: 'session:bbbb3333ffff',
    metadata: { user: 'bob', credentialId: 'ZyXwVuTs999' },
  },
];
const invites = [
  { name: 'invite:1234', metadata: { user: 'bob', expiresAt: 0 } },
  { name: 'invite:5678', metadata: { user: 'alice', expiresAt: 0 } },
];

test('revoke args', () => {
  assert.deepEqual(parseRevokeArgs(['--session', 'aaaa1111']), {
    revocation: { kind: 'session', value: 'aaaa1111' },
    target: 'remote',
  });
  assert.equal(parseRevokeArgs(['--user', B, '--local']).target, 'local');
  assert.throws(() => parseRevokeArgs(['--session', 'short']));
  assert.throws(() => parseRevokeArgs(['--user', 'mallory']));
  assert.throws(() => parseRevokeArgs(['--everything', 'x']));
  assert.throws(() => parseRevokeArgs([]));
});

test('pickOne needs exactly one match', () => {
  assert.equal(
    pickOne(sessions, 'session:', 'aaaa1111').name,
    'session:aaaa1111ffff',
  );
  assert.throws(() => pickOne(sessions, 'session:', 'aaaa'), /2 keys match/);
  assert.throws(() => pickOne(sessions, 'session:', 'cccc'), /0 keys match/);
});

test('keysToDelete for each revocation kind', () => {
  const lists = { creds, sessions, invites };
  assert.deepEqual(
    keysToDelete({ kind: 'session', value: 'bbbb3333' }, lists),
    ['session:bbbb3333ffff'],
  );
  assert.deepEqual(
    keysToDelete({ kind: 'credential', value: 'AbCdEfGh' }, lists),
    ['cred:AbCdEfGh123', 'session:aaaa1111ffff'],
  );
  assert.deepEqual(keysToDelete({ kind: 'user', value: 'alice' }, lists), [
    'session:aaaa1111ffff',
    'session:aaaa2222ffff',
  ]);
  assert.deepEqual(keysToDelete({ kind: 'invite', value: 'bob' }, lists), [
    'invite:1234',
  ]);
});

test('the listing shows short ids and never a full key', () => {
  const out = formatListing(creds, sessions, invites).join('\n');
  assert.match(out, /AbCdEfGh {2}alice/);
  assert.match(out, /aaaa1111 {2}alice/);
  assert.match(out, /pending invites\n {2}bob/);
  assert.doesNotMatch(out, /aaaa1111ffff/);
  assert.doesNotMatch(out, /invite:1234/);
});
