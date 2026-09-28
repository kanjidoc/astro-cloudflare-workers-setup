// npm run invite -- <name> [--hours <n>] [--local | --preview] [--origin <url>]
// Creates a one-time invite link (7 days by default) and prints it once. The token itself is
// never stored: KV keeps only its SHA-256.
import { fileURLToPath } from 'node:url';
import { SITE_ORIGIN, USERS } from '../../src/data/auth.ts';
import { INVITE_TTL_S } from '../../src/lib/auth/config.ts';
import { randomToken, sha256Hex } from '../../src/lib/auth/crypto.ts';
import { keys } from '../../src/lib/auth/store.ts';
import { kv, parseTarget } from './kv.mjs';

const MAX_HOURS = 168;

/**
 * @param {string[]} argv
 * @returns {{ user: import('../../src/data/auth.ts').User, ttlSeconds: number, origin: string, target: import('./kv.mjs').Target }}
 */
export function parseInviteArgs(argv) {
  const { target, rest } = parseTarget(argv);
  let hours;
  let origin;
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--hours') hours = Number(rest[++i]);
    else if (rest[i] === '--origin') origin = rest[++i];
    else positional.push(rest[i]);
  }
  const user = positional[0];
  if (positional.length !== 1 || !USERS.includes(/** @type {never} */ (user))) {
    throw new Error(
      `Usage: npm run invite -- <${USERS.join('|')}> [--hours <n>]`,
    );
  }
  if (
    hours !== undefined &&
    !(Number.isInteger(hours) && hours >= 1 && hours <= MAX_HOURS)
  ) {
    throw new Error(`--hours must be a whole number from 1 to ${MAX_HOURS}.`);
  }
  if (origin !== undefined && !/^https?:\/\/[^/]+$/.test(origin)) {
    throw new Error(
      '--origin must look like https://host or http://host:port (no path).',
    );
  }
  return {
    user: /** @type {import('../../src/data/auth.ts').User} */ (user),
    ttlSeconds: hours === undefined ? INVITE_TTL_S : hours * 3600,
    origin:
      origin ??
      (target === 'local'
        ? 'http://localhost:4321'
        : SITE_ORIGIN),
    target,
  };
}

async function main() {
  const { user, ttlSeconds, origin, target } = parseInviteArgs(
    process.argv.slice(2),
  );
  const store = kv(target);
  if (!store.get(keys.user(user))) {
    store.put(keys.user(user), { name: user, webauthnUserID: randomToken(32) });
  }
  const token = randomToken();
  const createdAt = Date.now();
  const expiresAt = createdAt + ttlSeconds * 1000;
  store.put(
    keys.invite(await sha256Hex(token)),
    { user, createdAt, expiresAt },
    { ttl: ttlSeconds, metadata: { user, expiresAt } },
  );
  console.error(
    `invite for ${user} (${target}), expires ${new Date(expiresAt).toISOString()}`,
  );
  console.log(`${origin}/invite/${token}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
