// npm run auth:list [-- --local | --preview]
// Passkeys, sessions and pending invites. Never prints a token (KV only has hashes anyway).
import { fileURLToPath } from 'node:url';
import { kv, parseTarget } from './kv.mjs';

/**
 * @param {unknown} ms
 * @returns {string}
 */
function when(ms) {
  return typeof ms === 'number'
    ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
    : '-';
}

/**
 * Printable rows. `id` is the first 8 characters after the prefix: what auth:revoke takes.
 * @param {import('./kv.mjs').KeyInfo[]} creds
 * @param {import('./kv.mjs').KeyInfo[]} sessions
 * @param {import('./kv.mjs').KeyInfo[]} invites
 * @returns {string[]}
 */
export function formatListing(creds, sessions, invites) {
  const lines = ['passkeys'];
  for (const { name, metadata: m = {} } of creds) {
    lines.push(
      `  ${name.slice('cred:'.length, 'cred:'.length + 8)}  ${m.user}  created ${when(m.createdAt)}  last used ${when(m.lastUsedAt)}  aaguid ${m.aaguid ?? '-'}`,
    );
  }
  lines.push('sessions');
  for (const { name, metadata: m = {} } of sessions) {
    lines.push(
      `  ${name.slice('session:'.length, 'session:'.length + 8)}  ${m.user}  created ${when(m.createdAt)}  ${m.country || '-'}  ${m.ua || '-'}`,
    );
  }
  lines.push('pending invites');
  for (const { metadata: m = {} } of invites) {
    lines.push(`  ${m.user}  expires ${when(m.expiresAt)}`);
  }
  return lines;
}

function main() {
  const { target } = parseTarget(process.argv.slice(2));
  const store = kv(target);
  const lines = formatListing(
    store.list('cred:'),
    store.list('session:'),
    store.list('invite:'),
  );
  console.log(lines.join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
