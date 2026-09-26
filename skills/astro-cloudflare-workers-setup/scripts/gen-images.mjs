#!/usr/bin/env node
/**
 * gen-images.mjs — raster icons + Open Graph card from public/favicon.svg.
 *
 * Usage (run from the project root, the folder with package.json):
 *     node "<skill-dir>/scripts/gen-images.mjs" "<Site Name>" "<tagline>" [--no-og]
 *
 * Reads public/favicon.svg (the brand mark; never modified) and writes, overwriting
 * only these generated files:
 *     public/favicon.ico           PNG frames 16/32/48/64
 *     public/apple-touch-icon.png  180x180
 *     public/og.webp               1200x630 neutral text card (skipped with --no-og;
 *                                  use it for stealth sites or a user-supplied og.webp)
 * The site name is required unless --no-og is given; the tagline is optional.
 * Re-running with the same inputs produces byte-identical files.
 *
 * Uses the project's own sharp (an optional dependency of astro) and installs nothing.
 * This is the skill's one Node script: rasterizing SVG needs sharp, which the Python
 * standard library lacks.
 *
 * Exit codes:
 *     0  all images written
 *     1  render error (e.g. invalid SVG); message printed
 *     2  bad usage, no package.json here, missing mark, mark is still the default
 *        Astro logo, or sharp not resolvable from this project (fix: npm i -D sharp)
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const USAGE = 'usage: node gen-images.mjs "<Site Name>" "<tagline>" [--no-og]';
const MARK = 'public/favicon.svg';
const ICO_SIZES = [16, 32, 48, 64];
// A fragment of the path data in create-astro's default favicon.svg. If the scaffold's
// logo changes, this check silently stops matching; it is a guard, not a guarantee.
const ASTRO_DEFAULT = 'M50.4 78.5a75.1 75.1';

const die = (code, msg) => {
  console.error(msg);
  process.exit(code);
};

// ---- Arguments ----------------------------------------------------------------
const args = process.argv.slice(2);
const noOg = args.includes('--no-og');
const unknownFlag = args.find((a) => a.startsWith('--') && a !== '--no-og');
if (unknownFlag) die(2, `error: unknown option ${unknownFlag}\n${USAGE}`);
const positional = args.filter((a) => a !== '--no-og');
if (positional.length > 2) die(2, `error: too many arguments (quote the name and tagline)\n${USAGE}`);
const name = (positional[0] ?? '').trim();
const tagline = (positional[1] ?? '').trim();

// ---- Preconditions -------------------------------------------------------------
if (!existsSync('package.json')) die(2, 'error: run from the project root (no package.json here)');
if (!noOg && !name) die(2, USAGE);
if (!existsSync(MARK)) die(2, `error: ${MARK} not found — create the brand mark first`);
const svg = readFileSync(MARK);
if (svg.includes(ASTRO_DEFAULT)) die(2, `error: ${MARK} is still the Astro logo — replace the mark first`);

let sharp;
try {
  sharp = createRequire(join(process.cwd(), 'package.json'))('sharp');
} catch (err) {
  if (err.code === 'MODULE_NOT_FOUND') die(2, 'error: sharp not found in this project — run: npm i -D sharp');
  die(2, `error: sharp is installed but failed to load (${err.message}) — try: npm i -D sharp`);
}

// ---- OG card text layout -------------------------------------------------------
// Text width is estimated, not measured: 0.6em per Latin glyph, 1em per CJK/fullwidth
// glyph. Each block wraps to at most `maxLines` lines of TEXT_WIDTH px, shrinking from
// `max` toward `min` font size until it fits; anything still too long ends in "…".
const TEXT_X = 80;
const TEXT_WIDTH = 1040; // 1200px card minus an 80px margin each side
const WIDE = 'ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦';
const WIDE_CHAR = new RegExp(`[${WIDE}]`);
// Tokens: one wide char (CJK wraps between any two characters), a word plus its
// trailing space, or a run of whitespace.
const TOKEN = new RegExp(`[${WIDE}]|[^\\s${WIDE}]+\\s*|\\s+`, 'g');

const em = (s) => [...s].reduce((w, c) => w + (WIDE_CHAR.test(c) ? 1 : 0.6), 0);
const fits = (line, size) => em(line) * size <= TEXT_WIDTH;

function wrap(tokens, size) {
  const lines = [''];
  for (const t of tokens) {
    const cur = lines[lines.length - 1];
    if (cur.trim() && !fits((cur + t).trimEnd(), size)) lines.push(t.trimStart());
    else lines[lines.length - 1] = cur + t;
  }
  return lines.map((l) => l.trim());
}

function ellipsize(line, size) {
  const chars = [...line];
  while (chars.length && !fits(chars.join('') + '…', size)) chars.pop();
  return chars.join('').trimEnd() + '…';
}

function layout(text, max, min, maxLines) {
  const tokens = text.match(TOKEN) || [];
  let size = max;
  let lines = wrap(tokens, size);
  const ok = () => lines.length <= maxLines && lines.every((l) => fits(l, size));
  while (!ok() && size > min) {
    size = Math.max(min, size - 2);
    lines = wrap(tokens, size);
  }
  const truncated = lines.length > maxLines;
  lines = lines.slice(0, maxLines);
  return {
    size,
    lines: lines.map((l, i) => ((truncated && i === lines.length - 1) || !fits(l, size) ? ellipsize(l, size) : l)),
  };
}

const esc = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

function ogCardSvg() {
  // Neutral black-on-white card. It is an image, not site styling: name up to 2 lines,
  // tagline up to 2, the whole block centred vertically.
  const n = layout(name, 76, 48, 2);
  const t = layout(tagline, 36, 26, 2);
  const GAP = 24;
  const blockH = n.lines.length * n.size * 1.15 + (tagline ? GAP + t.lines.length * t.size * 1.3 : 0);
  let y = Math.round((630 - blockH) / 2);
  const block = ({ lines, size }, weight, fill, lineHeight) =>
    lines
      .map((line) => {
        y += Math.round(size * lineHeight); // baseline of this line
        return `<text x="${TEXT_X}" y="${y}" font-family="sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(line)}</text>`;
      })
      .join('');
  const nameSvg = block(n, 700, '#111111', 1.15);
  y += GAP;
  const tagSvg = tagline ? block(t, 400, '#555555', 1.3) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#ffffff"/>${nameSvg}${tagSvg}</svg>`;
}

// ---- Render ----------------------------------------------------------------------
const write = (path, buf, dims) => {
  writeFileSync(path, buf);
  console.log(`wrote ${path} (${dims}, ${buf.length} bytes)`);
};

try {
  // Rasterize the mark at >= 512px before downscaling so tiny viewBoxes stay crisp.
  // Non-square marks are letterboxed on a transparent background, never stretched.
  const { width = 128, height = 128 } = await sharp(svg).metadata();
  const density = Math.min(2400, Math.max(72, Math.ceil((72 * 512) / Math.max(width, height))));
  const png = (size) =>
    sharp(svg, { density })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

  // favicon.ico = ICONDIR (6 bytes) + one 16-byte ICONDIRENTRY per frame + PNG payloads.
  const frames = await Promise.all(ICO_SIZES.map(png));
  const head = Buffer.alloc(6 + 16 * frames.length);
  head.writeUInt16LE(1, 2); // type 1 = icon
  head.writeUInt16LE(frames.length, 4);
  let offset = head.length;
  frames.forEach((frame, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(ICO_SIZES[i], e); // width
    head.writeUInt8(ICO_SIZES[i], e + 1); // height
    head.writeUInt16LE(1, e + 4); // colour planes
    head.writeUInt16LE(32, e + 6); // bits per pixel
    head.writeUInt32LE(frame.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += frame.length;
  });
  write('public/favicon.ico', Buffer.concat([head, ...frames]), ICO_SIZES.join('/'));

  write('public/apple-touch-icon.png', await png(180), '180x180');

  if (!noOg) {
    const og = await sharp(Buffer.from(ogCardSvg())).webp({ quality: 90 }).toBuffer();
    write('public/og.webp', og, '1200x630');
  }
} catch (err) {
  die(1, `error: could not render images: ${err.message}`);
}
