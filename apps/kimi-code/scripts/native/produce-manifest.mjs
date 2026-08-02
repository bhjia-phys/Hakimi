/**
 * Aggregate per-platform zip archive `.sha256` files into a single
 * `manifest.json` written into the same input directory.
 *
 * Usage:
 *   node produce-manifest.mjs <input-dir> <release-tag>
 *
 * Input dir must contain files matching: hakimi-<target>.zip.sha256
 * (produced by package.mjs across the 6 native-build matrix runners).
 *
 * The release tag may be the canonical `hakimi-v<semver>` form or any
 * historical form (`v<semver>`, `@bhjia-phys/hakimi@<semver>`,
 * `@moonshot-ai/kimi-code@<semver>`); the manifest always records the
 * canonical form.
 *
 * Output:
 *   <input-dir>/manifest.json   ← consumed by install.sh / install.ps1
 *
 */

import { createHash } from 'node:crypto';
import { createReadStream, writeSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { normalizeReleaseTag, parseReleaseTag } from './release-tag.mjs';

const [, , inputDir, tag] = process.argv;

const EXPECTED_NATIVE_TARGETS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-arm64',
  'win32-x64',
];

/**
 * Synchronous single-line failure exit. `writeSync` flushes to the pipe even
 * when stdout/stderr are redirected, so CI logs and subprocess callers always
 * see the message (a plain console.error + process.exit can drop the line).
 */
function fail(message) {
  writeSync(process.stderr.fd, `${message}\n`);
  process.exit(1);
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

if (!inputDir || !tag) {
  fail('Usage: produce-manifest.mjs <input-dir> <release-tag>');
}

const version = parseReleaseTag(tag);
if (version === null) {
  fail(`Invalid release tag: ${JSON.stringify(tag)} (expected hakimi-v<semver> or a historical tag form)`);
}
const canonicalTag = normalizeReleaseTag(tag);

const entries = await readdir(inputDir);
const sumFiles = entries.filter((f) => /^hakimi-[a-z0-9-]+\.zip\.sha256$/.test(f));
const entrySet = new Set(entries);
const missingFiles = EXPECTED_NATIVE_TARGETS.flatMap((target) => {
  const filename = `hakimi-${target}.zip`;
  return [filename, `${filename}.sha256`].filter((entry) => !entrySet.has(entry));
});
if (missingFiles.length > 0) {
  fail(`Missing required native release artifacts: ${missingFiles.join(', ')}`);
}

const expectedSumFiles = new Set(
  EXPECTED_NATIVE_TARGETS.map((target) => `hakimi-${target}.zip.sha256`),
);
const unexpectedSumFiles = sumFiles.filter((sumFile) => !expectedSumFiles.has(sumFile));
if (unexpectedSumFiles.length > 0) {
  fail(`Unexpected native release checksum files: ${unexpectedSumFiles.join(', ')}`);
}

const platforms = {};
for (const target of EXPECTED_NATIVE_TARGETS) {
  const filename = `hakimi-${target}.zip`;
  const sumFile = `${filename}.sha256`;
  const text = await readFile(resolve(inputDir, sumFile), 'utf-8');
  const [checksum, referencedFilename] = text.trim().split(/\s+/);
  if (!checksum || !/^[a-f0-9]{64}$/.test(checksum)) {
    fail(`Invalid checksum in ${sumFile}: ${checksum}`);
  }
  if (referencedFilename !== filename) {
    fail(`Checksum file ${sumFile} references ${JSON.stringify(referencedFilename)}, expected ${JSON.stringify(filename)}`);
  }
  const actualChecksum = await sha256File(resolve(inputDir, filename));
  if (actualChecksum !== checksum) {
    fail(`Checksum mismatch for ${filename}: expected ${checksum}, found ${actualChecksum}`);
  }
  platforms[target] = { filename, checksum };
}

const manifest = { version, tag: canonicalTag, platforms };
const manifestPath = resolve(inputDir, 'manifest.json');

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote ${manifestPath} (${Object.keys(platforms).length} platforms)`);
