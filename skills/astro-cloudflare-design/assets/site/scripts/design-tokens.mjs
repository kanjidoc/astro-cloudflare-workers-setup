#!/usr/bin/env node
/**
 * design-tokens.mjs — DESIGN.md (google-labs-code/design.md format) → src/styles/tokens.css
 *
 * Usage (from the project root; `npm run design` / `npm run design:check`):
 *     node scripts/design-tokens.mjs [--check] [--in DESIGN.md] [--out src/styles/tokens.css]
 *
 * Input: the YAML front matter (between `---` lines; trailing spaces allowed) plus every
 * fenced ```yaml block in the body, merged into one tree (YAML anchors and `<<` merge keys
 * work). A top-level key defined in two blocks is an error (as the spec says). Only `colors`,
 * `typography`, `rounded` and `spacing` become CSS; `version`, `name`, `description`,
 * `omitted` and unknown keys are read and ignored. `components` emit nothing, but every
 * `{path}` reference inside them must exist. References `{group.token}` (also inside a longer
 * value) resolve recursively to the referenced value.
 *
 * Values are checked: no `;`, `{`, `}`, line break, `/*`, `*\/` or backslash, balanced `( )`
 * outside quotes, and closed quotes. Typography `fontSize`/`letterSpacing` need a unit (a bare
 * YAML number is an error).
 *
 * Output, the CSS contract (in this order, tokens in DESIGN.md order):
 *     /* one-line generated header *\/
 *     :root {
 *       color-scheme: light dark;            only when a dark pair exists
 *       --color-<name>: <value>;             every color, `-dark` ones included
 *       --type-<name>-family|size|weight|line|tracking: <value>;   the properties present
 *       --rounded-<k>: <value>;              a bare number gets `px` (0 stays 0)
 *       --spacing-<k>: <value>;              a bare number passes through unitless, with a
 *                                            warning (the spec reads it as a count or ratio)
 *     }
 *     .type-<name> { font-family: var(--type-<name>-family); … font-feature-settings;
 *                    font-variation-settings }   each style uses its own fontFamily
 *     @media (prefers-color-scheme: dark) { :root { --color-<x>: var(--color-<x>-dark); } }
 * The `-dark` convention: a color `<x>-dark` is the dark-scheme value of `<x>` (when `<x>`
 * exists; otherwise it is an ordinary color). A file with no values is exactly the header
 * plus `:root {\n}\n`; the summary says `no values yet`, or `no token block found` when the
 * file has neither front matter nor a yaml block. Font families are quoted unless already
 * quoted, a function, or a generic/system family; the fallback list inside var(--font-x, …)
 * is quoted the same way.
 * Output is deterministic: LF, trailing newline, no timestamps.
 *
 * Exit codes:
 *     0  written, unchanged, or (--check) in sync
 *     1  --check found drift, or DESIGN.md is invalid (the message names the token)
 *     2  bad usage or a missing input file
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { parse } from 'yaml';

class DesignError extends Error {}
const fail = (message) => {
  throw new DesignError(message);
};
const TYPE_PROPS = [
  // [DESIGN.md key, variable suffix, CSS property]
  ['fontFamily', 'family', 'font-family'],
  ['fontSize', 'size', 'font-size'],
  ['fontWeight', 'weight', 'font-weight'],
  ['lineHeight', 'line', 'line-height'],
  ['letterSpacing', 'tracking', 'letter-spacing'],
];
const TYPE_LITERAL = [
  ['fontFeature', 'font-feature-settings'],
  ['fontVariation', 'font-variation-settings'],
];
const KNOWN_TYPE_KEYS = new Set(
  [...TYPE_PROPS, ...TYPE_LITERAL].map(([key]) => key),
);
// Left unquoted (compared lowercased): generic families, CSS-wide keywords, and the two
// system-font keywords that only work unquoted.
const GENERIC_FAMILIES = new Set(
  'serif sans-serif monospace cursive fantasy system-ui ui-serif ui-sans-serif ui-monospace ui-rounded math emoji fangsong inherit initial unset -apple-system blinkmacsystemfont'.split(
    ' ',
  ),
);
const NEEDS_UNIT = ['fontSize', 'letterSpacing'];
const REF = /\{([A-Za-z0-9_.-]+)\}/g;

// ---- arguments --------------------------------------------------------------
function readArgs(argv) {
  const opts = { check: false, in: 'DESIGN.md', out: 'src/styles/tokens.css' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') opts.check = true;
    else if ((a === '--in' || a === '--out') && argv[i + 1])
      opts[a.slice(2)] = argv[++i];
    else return null;
  }
  return opts;
}

// ---- reading DESIGN.md: front matter + fenced yaml blocks -------------------
function yamlBlocks(text) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const blocks = [];
  const isFence = (line) => /^---\s*$/.test(line);
  let i = 0;
  if (isFence(lines[0])) {
    const end = lines.findIndex((line, n) => n > 0 && isFence(line));
    if (end === -1) fail('the front matter has no closing --- line');
    blocks.push({
      where: 'the front matter',
      src: lines.slice(1, end).join('\n'),
    });
    i = end + 1;
  }
  for (; i < lines.length; i++) {
    const open = /^(`{3,}|~{3,})\s*([\w-]*)/.exec(lines[i]);
    if (!open) continue;
    const fence = open[1];
    let end = i + 1; // the closing fence: same character, at least as long, nothing else
    while (
      end < lines.length &&
      !new RegExp(`^${fence[0]}{${fence.length},}\\s*$`).test(lines[end])
    )
      end++;
    if (/^ya?ml$/i.test(open[2]))
      blocks.push({
        where: `the yaml block at line ${i + 1}`,
        src: lines.slice(i + 1, end).join('\n'),
      });
    i = end;
  }
  return blocks;
}

// Maps keep DESIGN.md order even for numeric keys (a plain object would sort `1`, `2` first).
function toMaps(value) {
  if (value instanceof Map)
    return new Map([...value].map(([k, v]) => [String(k), toMaps(v)]));
  return Array.isArray(value) ? value.map(toMaps) : value;
}

function readTree(text) {
  const tree = new Map();
  const origin = new Map();
  const blocks = yamlBlocks(text);
  for (const { where, src } of blocks) {
    let doc;
    try {
      doc = toMaps(parse(src, { mapAsMap: true, merge: true }));
    } catch (err) {
      fail(`YAML error in ${where}: ${err.message.split('\n')[0]}`);
    }
    if (doc == null) continue;
    if (!(doc instanceof Map)) fail(`${where} is not a map of keys`);
    for (const [key, value] of doc) {
      if (tree.has(key))
        fail(
          `duplicate top-level key "${key}" (in ${origin.get(key)} and ${where})`,
        );
      tree.set(key, value);
      origin.set(key, where);
    }
  }
  return { tree, blockCount: blocks.length };
}

// ---- values and references ----------------------------------------------------
function lookup(tree, path) {
  let node = tree;
  for (const part of path.split('.'))
    node = node instanceof Map ? node.get(part) : undefined;
  return node;
}

// The CSS text of the token at `path`, references resolved; `seen` is the chain that led here.
function cssValue(tree, path, seen = []) {
  if (seen.includes(path))
    fail(`reference cycle: ${[...seen, path].join(' → ')}`);
  const raw = lookup(tree, path);
  if (raw === undefined) fail(`${seen.at(-1)}: {${path}} is not defined`);
  if (raw instanceof Map || Array.isArray(raw))
    fail(`${seen.at(-1) ?? path}: {${path}} is a group, not a value`);
  if (raw === null)
    fail(
      `${path} has no value (an unquoted # starts a YAML comment: quote colors, "#1a1c1e")`,
    );
  if (typeof raw === 'number')
    return path.startsWith('rounded.') && raw !== 0 ? `${raw}px` : String(raw);
  const text = String(raw).replace(REF, (_, ref) =>
    cssValue(tree, ref, [...seen, path]),
  );
  const problem = valueProblem(text);
  if (problem) fail(`${path}: ${JSON.stringify(text)} ${problem}`);
  return text.trim();
}

// Why `text` can't be a CSS value (it would break out of its declaration), or null.
function valueProblem(text) {
  if (/[;{}\n]/.test(text)) return 'may not contain ; { } or a line break';
  if (/\/\*|\*\/|\\/.test(text)) return 'may not contain /*, */ or a backslash';
  let quote = null;
  let depth = 0;
  for (const c of text) {
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth < 0) return 'has a ) with no matching (';
  }
  if (quote) return `has an unclosed ${quote}`;
  return depth > 0 ? 'has a ( with no matching )' : null;
}

// components emit no CSS, but each {path} inside them must point at something that exists.
function checkComponents(tree) {
  const components = tree.get('components');
  if (!(components instanceof Map)) return;
  for (const [name, props] of components) {
    if (!(props instanceof Map)) continue;
    for (const [prop, value] of props) {
      if (typeof value !== 'string') continue;
      for (const [, ref] of value.matchAll(REF)) {
        if (lookup(tree, ref) === undefined)
          fail(`components.${name}.${prop}: {${ref}} is not defined`);
      }
    }
  }
}

function quoteFamilies(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= value.length; i++) {
    const c = value[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if ((c === ',' && depth === 0) || i === value.length) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  return parts
    .map((p) => {
      const fallback = /^var\(\s*(--[\w-]+)\s*,(.*)\)$/.exec(p); // var(--font-x, Family, generic)
      if (fallback) return `var(${fallback[1]}, ${quoteFamilies(fallback[2])})`;
      return /^["']|\(/.test(p) || GENERIC_FAMILIES.has(p.toLowerCase())
        ? p
        : `"${p}"`;
    })
    .join(', ');
}

function entries(tree, group) {
  const node = tree.get(group);
  if (node == null) return [];
  if (!(node instanceof Map)) fail(`${group} must be a map of tokens`);
  for (const name of node.keys()) {
    if (!/^[A-Za-z0-9_-]+$/.test(name))
      fail(
        `${group}.${name}: token names may use only letters, digits, - and _`,
      );
  }
  return [...node.keys()];
}

// ---- building the CSS ---------------------------------------------------------
function build({ tree, blockCount }, inName, warn) {
  const root = [];
  const classes = [];
  const dark = [];
  const colors = entries(tree, 'colors');
  for (const name of colors) {
    root.push(`  --color-${name}: ${cssValue(tree, `colors.${name}`)};`);
    const base = name.endsWith('-dark') ? name.slice(0, -5) : null;
    if (base && colors.includes(base))
      dark.push(`    --color-${base}: var(--color-${name});`);
  }
  if (dark.length) root.unshift('  color-scheme: light dark;');

  const styles = entries(tree, 'typography');
  for (const name of styles) {
    const style = tree.get('typography').get(name);
    if (!(style instanceof Map))
      fail(
        `typography.${name} must be a map of properties (fontFamily, fontSize, …)`,
      );
    for (const key of style.keys())
      if (!KNOWN_TYPE_KEYS.has(key))
        warn(`typography.${name}.${key} is not a typography property; ignored`);
    if (typeof style.get('lineHeight') === 'number') {
      warn(
        `typography.${name}.lineHeight is a bare number; quote it ("${style.get('lineHeight')}") so the official design.md tools keep it`,
      );
    }
    for (const key of NEEDS_UNIT) {
      const v = style.get(key);
      if (typeof v === 'number')
        fail(`typography.${name}.${key} needs a unit ("${v}px" or "${v}rem")`);
    }
    const rules = [];
    for (const [key, suffix, prop] of TYPE_PROPS) {
      if (!style.has(key)) continue;
      let value = cssValue(tree, `typography.${name}.${key}`);
      if (key === 'fontFamily') {
        // var(--font-x) alone is invalid while the variable is undefined (no Step 4 yet).
        const bare = /^var\(\s*(--[\w-]+)\s*\)/.exec(value);
        if (bare)
          warn(
            `typography.${name}.fontFamily: var(${bare[1]}) has no fallback inside var(); write var(${bare[1]}, Family, generic)`,
          );
        value = quoteFamilies(value);
      }
      root.push(`  --type-${name}-${suffix}: ${value};`);
      rules.push(`  ${prop}: var(--type-${name}-${suffix});`);
    }
    for (const [key, prop] of TYPE_LITERAL) {
      if (style.has(key))
        rules.push(
          `  ${prop}: ${cssValue(tree, `typography.${name}.${key}`)};`,
        );
    }
    classes.push(`.type-${name} {\n${rules.join('\n')}\n}\n`);
  }

  const counts = {};
  for (const group of ['rounded', 'spacing']) {
    const keys = entries(tree, group);
    counts[group] = keys.length;
    for (const k of keys) {
      const raw = tree.get(group).get(k);
      if (group === 'spacing' && typeof raw === 'number' && raw !== 0) {
        warn(
          `spacing.${k}: bare number ${raw} passes through unitless; write "${raw}px" for a length`,
        );
      }
      root.push(`  --${group}-${k}: ${cssValue(tree, `${group}.${k}`)};`);
    }
  }
  checkComponents(tree);

  const header = `/* Generated from ${inName} by scripts/design-tokens.mjs. Do not edit: change ${inName}, then run npm run design. */\n`;
  let css = `${header}:root {\n${root.map((l) => `${l}\n`).join('')}}\n`;
  for (const c of classes) css += `\n${c}`;
  if (dark.length)
    css += `\n@media (prefers-color-scheme: dark) {\n  :root {\n${dark.join('\n')}\n  }\n}\n`;

  const empty =
    colors.length + styles.length + counts.rounded + counts.spacing === 0;
  const summary = !blockCount
    ? `no token block found in ${inName}`
    : empty
      ? `no values yet (${inName} is a stub)`
      : `${colors.length - dark.length} colors (${dark.length} dark), ${styles.length} type styles, ${counts.spacing} spacing, ${counts.rounded} rounded`;
  return { css, summary };
}

// ---- main ---------------------------------------------------------------------------
function main() {
  const opts = readArgs(process.argv.slice(2));
  if (!opts) {
    console.error(
      'usage: node scripts/design-tokens.mjs [--check] [--in DESIGN.md] [--out src/styles/tokens.css]',
    );
    return 2;
  }
  if (!existsSync(opts.in)) {
    console.error(
      `design-tokens: ${opts.in} not found (run from the project root)`,
    );
    return 2;
  }
  const inName = basename(opts.in);
  const outName = basename(opts.out);
  let result;
  try {
    result = build(readTree(readFileSync(opts.in, 'utf8')), inName, (msg) =>
      console.error(`design-tokens: warning: ${msg}`),
    );
  } catch (err) {
    if (!(err instanceof DesignError)) throw err;
    console.error(`design-tokens: ${inName}: ${err.message}`);
    return 1;
  }
  console.log(`${outName}: ${result.summary}`);
  const current = existsSync(opts.out) ? readFileSync(opts.out, 'utf8') : null;
  if (opts.check) {
    if (current === result.css) return 0;
    console.error(
      `design-tokens: ${outName} is out of date with ${inName} (${opts.out}): run npm run design and commit both`,
    );
    return 1;
  }
  if (current === result.css) {
    console.log(`${opts.out} unchanged`);
  } else {
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, result.css);
    console.log(`wrote ${opts.out}`);
  }
  return 0;
}

process.exitCode = main();
