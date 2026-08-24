/**
 * Hakimi web branding patch.
 *
 * The committed `apps/kimi-code/dist-web` bundle is built from the private
 * code-app repo (upstream `apps/web`) and is synced verbatim, so every
 * visible "Kimi Code" brand string in the browser UI is upstream's. This
 * script rewrites the user-facing brand text in the committed bundle in
 * place:
 *
 *  - `<title>Kimi Code Web</title>` → `<title>Hakimi Web</title>` in
 *    `index.html` (the SPA document is plain text);
 *  - the `"Kimi Code Web"` document-title suffix and `"Kimi Code"` UI
 *    strings inside the minified JS assets (login page, brand name,
 *    notification titles, aria-labels, empty-state copy…).
 *
 * It deliberately does NOT touch anything that is not a display string:
 * `kimi-web.*` localStorage keys, `kimi-code` identifiers / URLs, API paths,
 * or the favicon (a binary asset — the Hakimi cat-ear logo ships in the TUI,
 * not in the web bundle). The patch is idempotent: running it twice is a
 * no-op, and re-running it after the next `sync:web` re-applies the branding.
 *
 * Usage: `node apps/kimi-code/scripts/patch-web-branding.mjs`
 * Run it after every web sync and commit the result together with the bundle.
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
    throw new Error(`dist-web/index.html not found at ${distWeb}; run the web sync first.`);
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
