// npm run auth:revoke -- --session <id8> | --credential <id8> | --user <name> | --invite <name>
//   [--local | --preview]
// --session     one device's session
// --credential  the passkey and every session created with it
// --user        every session of that person ("sign out everywhere"); passkeys stay
// --invite      that person's pending invites
import { fileURLToPath } from 'node:url';
import { USERS } from '../../src/data/auth.ts';
import { kv, parseTarget } from './kv.mjs';

/** @typedef {import('./kv.mjs').KeyInfo} KeyInfo */
/** @typedef {{ kind: 'session' | 'credential' | 'user' | 'invite', value: string }} Revocation */

/**
 * @param {string[]} argv
 * @returns {{ revocation: Revocation, target: import('./kv.mjs').Target }}
 */
export function parseRevokeArgs(argv) {
  const { target, rest } = parseTarget(argv);
  const kinds = ['session', 'credential', 'user', 'invite'];
  if (
    rest.length !== 2 ||
    !kinds.includes(rest[0].slice(2)) ||
    !rest[0].startsWith('--')
  ) {
    throw new Error(
      'Usage: npm run auth:revoke -- --session <id8> | --credential <id8> | --user <name> | --invite <name>',
    );
  }
  const kind = /** @type {Revocation['kind']} */ (rest[0].slice(2));
  const value = rest[1];
  if (
    (kind === 'user' || kind === 'invite') &&
    !USERS.includes(/** @type {never} */ (value))
  ) {
    throw new Error(`Name must be one of: ${USERS.join(', ')}.`);
  }
  if ((kind === 'session' || kind === 'credential') && value.length < 8) {
    throw new Error(
      'Give at least the first 8 characters of the id (from npm run auth:list).',
    );
  }
  return { revocation: { kind, value }, target };
}

/**
 * The single key under `prefix` whose id starts with `id`.
 * @param {KeyInfo[]} list
 * @param {string} prefix
 * @param {string} id
 * @returns {KeyInfo}
 */
export function pickOne(list, prefix, id) {
  const matches = list.filter((k) => k.name.startsWith(prefix + id));
  if (matches.length !== 1) {
    throw new Error(
      `${matches.length} keys match ${prefix}${id}. Use more characters.`,
    );
  }
  return matches[0];
}

/**
 * Every key to delete for a revocation, given the current listings.
 * @param {Revocation} revocation
 * @param {{ creds: KeyInfo[], sessions: KeyInfo[], invites: KeyInfo[] }} lists
 * @returns {string[]}
 */
export function keysToDelete({ kind, value }, { creds, sessions, invites }) {
  if (kind === 'session') return [pickOne(sessions, 'session:', value).name];
  if (kind === 'credential') {
    const cred = pickOne(creds, 'cred:', value);
    const credentialId = cred.name.slice('cred:'.length);
    return [
      cred.name,
      ...sessions
        .filter((s) => s.metadata?.credentialId === credentialId)
        .map((s) => s.name),
    ];
  }
  if (kind === 'user')
    return sessions
      .filter((s) => s.metadata?.user === value)
      .map((s) => s.name);
  return invites.filter((i) => i.metadata?.user === value).map((i) => i.name);
}

function main() {
  const { revocation, target } = parseRevokeArgs(process.argv.slice(2));
  const store = kv(target);
  const lists = {
    creds: revocation.kind === 'credential' ? store.list('cred:') : [],
    sessions: revocation.kind === 'invite' ? [] : store.list('session:'),
    invites: revocation.kind === 'invite' ? store.list('invite:') : [],
  };
  const doomed = keysToDelete(revocation, lists);
  for (const key of doomed) store.del(key);
  console.log(`deleted ${doomed.length} key(s) (${target})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
