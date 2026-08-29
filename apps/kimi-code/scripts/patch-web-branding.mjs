/**
 * Idempotent branding guard for the Hakimi source-built production Web bundle.
 *
 * `apps/kimi-web` is already Hakimi-branded. These replacements remain as a
 * release guard against accidentally reintroducing upstream display strings in
 * generated HTML or JavaScript. Compatibility identifiers such as `kimi-web.*`,
 * `kimi-code` URLs, API paths, and the source favicon are deliberately untouched.
 *
 * `build-web-assets.mjs` applies this guard only to its staging directory and
 * verifies that a second pass is a no-op before replacing generated dist-web.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultDistWeb = resolve(appRoot, 'dist-web');

// Increment whenever the replacement rules change so provenance cannot silently
// bless a bundle patched with different branding semantics.
export const WEB_BRANDING_PATCH_VERSION = 1;

function assertWebAssets(distWeb) {
  const indexHtml = join(distWeb, 'index.html');
  if (!statSync(indexHtml).isFile()) {
    throw new Error(`dist-web/index.html not found at ${distWeb}; run the Web build first.`);
  }
}

/** Replace brand strings in a file body; returns the number of replacements. */
function patchText(body, replacements) {
  let count = 0;
  for (const [from, to] of replacements) {
    let next = body;
    let start = 0;
    const chunks = [];
    while (true) {
      const i = next.indexOf(from, start);
      if (i === -1) break;
      chunks.push(next.slice(start, i), to);
      start = i + from.length;
      count += 1;
    }
    if (chunks.length > 0) {
      chunks.push(next.slice(start));
      next = chunks.join('');
    }
    body = next;
  }
  return { body, count };
}

// Longest first so "Kimi Code Web" is consumed before the bare "Kimi Code"
// replacement would split it.
const JS_REPLACEMENTS = [
  ['Kimi Code Web', 'Hakimi Web'],
  ['Kimi Code', 'Hakimi'],
];

const HTML_REPLACEMENTS = [
  ['<title>Kimi Code Web</title>', '<title>Hakimi Web</title>'],
];

function walkAssets(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkAssets(full, out);
      continue;
    }
    if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

export function patchWebBranding(distWeb = defaultDistWeb) {
  assertWebAssets(distWeb);

  let total = 0;
  for (const file of walkAssets(distWeb)) {
    const { body, count } = patchText(readFileSync(file, 'utf8'), JS_REPLACEMENTS);
    if (count > 0) {
      writeFileSync(file, body);
      total += count;
    }
  }

  const indexHtml = join(distWeb, 'index.html');
  const { body: html, count: htmlCount } = patchText(
    readFileSync(indexHtml, 'utf8'),
    HTML_REPLACEMENTS,
  );
  if (htmlCount > 0) {
    writeFileSync(indexHtml, html);
    total += htmlCount;
  }
  return total;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const total = patchWebBranding();
  console.log(`Web branding patched: ${total} replacement(s) in ${defaultDistWeb}.`);
}
