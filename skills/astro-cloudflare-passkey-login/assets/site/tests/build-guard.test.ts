// Run after `astro build` (the build script does). Guards against F5: if every route were
// prerendered, the adapter would emit an assets-only Worker and silently drop src/worker.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { USERS } from '../src/data/auth.ts';

const root = new URL('../', import.meta.url);

test('the generated Worker config still has a main and runs the Worker first', () => {
  const deployDir = new URL('.wrangler/deploy/', root);
  const redirect = JSON.parse(
    readFileSync(new URL('config.json', deployDir), 'utf8'),
  );
  const config = JSON.parse(
    readFileSync(new URL(redirect.configPath, deployDir), 'utf8'),
  );
  assert.ok(
    config.main,
    `${redirect.configPath} has no main: the gate would be dropped`,
  );
  assert.equal(config.assets?.run_worker_first, true);
});

test('the lock page is prerendered at lock/index.html', () => {
  assert.ok(existsSync(new URL('dist/client/lock/index.html', root)));
});

test('the root wrangler.jsonc still points main at the custom Worker entry', () => {
  // wrangler.jsonc is JSONC (comments, trailing commas), so pull the one "main" key by regex
  // rather than pulling in a JSONC parser just for this guard.
  const raw = readFileSync(new URL('wrangler.jsonc', root), 'utf8');
  const match = raw.match(/"main"\s*:\s*"([^"]+)"/);
  assert.equal(
    match?.[1],
    './src/worker.ts',
    'wrangler.jsonc main has drifted from the custom entry: a revert to the adapter default ' +
      'would silently ungate every request',
  );
});

test('no page is prerendered under /auth or /invite (they must stay on-demand)', () => {
  // A prerendered page there would be served straight from ASSETS by the Worker's passthrough
  // (gate step 3), bypassing any session check.
  assert.ok(!existsSync(new URL('dist/client/auth', root)));
  assert.ok(!existsSync(new URL('dist/client/invite', root)));
});

test('no user name appears in public files', () => {
  // The lock page and every public CSS/JS asset are served with no session at all, so they must
  // never name who can sign in — that would hand a stranger a head start on the passkey prompt.
  const nameRe = new RegExp(`\\b(${USERS.join('|')})\\b`, 'i');
  const astroDir = new URL('dist/client/_astro/', root);
  const files = readdirSync(astroDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith('.css') || entry.name.endsWith('.js')),
    )
    .map((entry) => new URL(entry.name, astroDir));
  files.push(new URL('dist/client/lock/index.html', root));
  for (const file of files) {
    const contents = readFileSync(file, 'utf8');
    assert.ok(
      !nameRe.test(contents),
      `${file.pathname} names a user, but it's public: served with no session`,
    );
  }
});
