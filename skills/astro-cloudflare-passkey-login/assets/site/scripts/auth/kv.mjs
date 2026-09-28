// Wrapper around `npx wrangler kv key …` for the AUTH_KV namespace (technical spec §8.1).
// Auth: $CLOUDFLARE_API_TOKEN from the environment. Never `wrangler login`.
// Targets: --remote (default, production), --local (.wrangler/state, for tests),
// --preview (the Worker Previews namespace from wrangler.jsonc → previews.kv_namespaces).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** @typedef {'remote' | 'local' | 'preview'} Target */
/** @typedef {{ name: string, expiration?: number, metadata?: Record<string, unknown> }} KeyInfo */

const CONFIG = new URL('../../wrangler.jsonc', import.meta.url);

/**
 * Splits the target flag out of the arguments.
 * @param {string[]} argv
 * @returns {{ target: Target, rest: string[] }}
 */
export function parseTarget(argv) {
  const flags = argv.filter(
    (a) => a === '--remote' || a === '--local' || a === '--preview',
  );
  if (flags.length > 1)
    throw new Error('Use only one of --remote, --local, --preview.');
  const target = /** @type {Target} */ (flags[0]?.slice(2) ?? 'remote');
  return { target, rest: argv.filter((a) => !flags.includes(a)) };
}

/**
 * The preview namespace id, read from wrangler.jsonc (JSONC parsed by TypeScript's parser).
 * @param {string} text
 * @returns {string}
 */
export function previewNamespaceId(text) {
  const { config, error } = ts.parseConfigFileTextToJson(
    'wrangler.jsonc',
    text,
  );
  if (error) throw new Error('wrangler.jsonc is not valid JSONC.');
  const id = config?.previews?.kv_namespaces?.find(
    (/** @type {{ binding: string }} */ ns) => ns.binding === 'AUTH_KV',
  )?.id;
  if (!id)
    throw new Error(
      'No previews.kv_namespaces AUTH_KV id in wrangler.jsonc yet.',
    );
  return id;
}

/**
 * The namespace and location flags for `wrangler kv key …`.
 * @param {Target} target
 * @param {() => string} [readConfig]
 * @returns {string[]}
 */
export function namespaceArgs(
  target,
  readConfig = () => readFileSync(CONFIG, 'utf8'),
) {
  if (target === 'local') return ['--binding', 'AUTH_KV', '--local'];
  if (target === 'preview')
    return ['--namespace-id', previewNamespaceId(readConfig()), '--remote'];
  return ['--binding', 'AUTH_KV', '--remote'];
}

/**
 * @param {string[]} args
 * @returns {string}
 */
function wrangler(args) {
  return execFileSync('npx', ['wrangler', 'kv', 'key', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Whether `wrangler kv key get --text`'s stdout is its genuine "no such key" signal for
 * `--local` (checked against wrangler 4.141's actual output), as opposed to a value that merely
 * isn't valid JSON. `--local` never throws for a missing key, so this only applies there.
 * @param {string} output
 * @returns {boolean}
 */
export function isNotFound(output) {
  return output.trim() === 'Value not found';
}

/**
 * Whether a thrown wrangler CLI error is the genuine "key not found" signal for `--remote`/
 * `--preview` (checked against a live probe of wrangler 4.141: see the fix-round report for the
 * captured exit code, stdout and stderr). Unlike `--local`, a remote miss is a KV REST API 404,
 * which wrangler surfaces as a non-zero exit with "... 404: Not Found" on stderr (occasionally
 * also echoed on stdout). Every other failure — 401, 403, a 5xx, ENOTFOUND, any other network
 * error — must rethrow: only a genuine 404 is "missing".
 * @param {{ stderr?: string, stdout?: string }} err
 * @returns {boolean}
 */
export function isRemoteNotFound(err) {
  return /404: Not Found/.test(`${err?.stderr ?? ''}\n${err?.stdout ?? ''}`);
}

/**
 * @param {Target} target
 * @param {(args: string[]) => string} [run] Injectable for tests.
 * @param {() => string} [readConfig] Injectable for tests (wrangler.jsonc text).
 */
export function kv(target, run = wrangler, readConfig = undefined) {
  const ns = namespaceArgs(target, readConfig);
  return {
    /**
     * @param {string} key
     * @param {unknown} value
     * @param {{ ttl?: number, metadata?: Record<string, unknown> }} [opts]
     */
    put(key, value, opts = {}) {
      const extra = [];
      if (opts.ttl) extra.push('--ttl', String(opts.ttl));
      if (opts.metadata)
        extra.push('--metadata', JSON.stringify(opts.metadata));
      run(['put', key, JSON.stringify(value), ...ns, ...extra]);
    },
    /**
     * Only a genuine "not found" becomes null — `--local`'s "Value not found" on stdout (no
     * throw), or `--remote`/`--preview`'s 404 (a thrown, non-zero exit). Any other wrangler
     * failure (401, 403, a 5xx, a network error, ...) rethrows, so a transient CLI error can
     * never be mistaken for a missing key — that distinction is what keeps invite.mjs from
     * clobbering an existing user: record.
     * @param {string} key
     * @returns {unknown}
     */
    get(key) {
      let output;
      try {
        output = run(['get', key, '--text', ...ns]);
      } catch (err) {
        if (isRemoteNotFound(err)) return null;
        throw err;
      }
      return isNotFound(output) ? null : JSON.parse(output);
    },
    /**
     * @param {string} prefix
     * @returns {KeyInfo[]}
     */
    list(prefix) {
      return JSON.parse(run(['list', '--prefix', prefix, ...ns]));
    },
    /** @param {string} key */
    del(key) {
      run(['delete', key, ...ns]);
    },
  };
}
