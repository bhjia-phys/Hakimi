#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '../..');
const usage = 'Usage: node docs/scripts/sync-changelog.mjs [--dry-run]';
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CHANGESET_HEADING_PATTERN = /^### (?:Major|Minor|Patch) Changes\s*$/;
const PR_DECORATION_PATTERN = /^\[#\d+\]\([^\n)]+\)\s*/;
const HASH_DECORATION_PATTERN = /^\[`[0-9a-fA-F]+`\]\([^\n)]+\)\s*/;

export const SOURCE_CHANGELOG_PATH = 'apps/kimi-code/CHANGELOG.md';
export const ENGLISH_CHANGELOG_PATH = 'docs/en/release-notes/changelog.md';
export const SOURCE_RELEASE_LINE = { stopAt: '0.13.0' };

function normalizeNewlines(text) {
  return text.replaceAll(/\r\n?/g, '\n');
}

function assertStrictSemver(version, context) {
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`${context} is not strict semver: ${JSON.stringify(version)}.`);
  }
}

function canonicalReleaseTag(version) {
  assertStrictSemver(version, 'Release version');
  return `hakimi-v${version}`;
}

function canonicalReleaseBody(body) {
  return normalizeNewlines(body).trim();
}

export function parseSyncChangelogArgs(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  let dryRun = false;
  for (const arg of args) {
    if (arg !== '--dry-run') {
      throw new Error(`Unknown option ${JSON.stringify(arg)}. ${usage}`);
    }
    if (dryRun) {
      throw new Error(`--dry-run may only be specified once. ${usage}`);
    }
    dryRun = true;
  }
  return { dryRun };
}

export function parseSourceChangelog(text) {
  const normalized = normalizeNewlines(text);
  const lines = normalized.split('\n');
  const packageHeading = lines.find((line) => line.startsWith('# '));
  const packageName = packageHeading?.slice(2).trim();
  if (packageName === undefined || packageName === '') {
    throw new Error('Source changelog must start with a package heading.');
  }

  const headings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('## ')) continue;
    const version = line.slice(3).trim();
    assertStrictSemver(version, `Source heading on line ${index + 1}`);
    headings.push({ line: index, version });
  }
  if (headings.length === 0) {
    throw new Error('Source changelog has no release blocks.');
  }
  const releases = headings.map((heading, index) => {
    const nextLine = headings[index + 1]?.line ?? lines.length;
    const body = lines.slice(heading.line + 1, nextLine).join('\n');
    if (body.trim() === '') {
      throw new Error(`Source release ${heading.version} has an empty body.`);
    }
    return { version: heading.version, body };
  });
  return { packageName, releases };
}

export function parseDocsChangelog(text) {
  const normalized = normalizeNewlines(text);
  const headingPattern = /^## ([^\s]+) \((\d{4}-\d{2}-\d{2})\)$/gm;
  const releases = [];
  let firstReleaseOffset = -1;
  for (const match of normalized.matchAll(headingPattern)) {
    const version = match[1];
    assertStrictSemver(version, 'Docs release heading');
    if (!isReleaseDate(match[2])) {
      throw new Error(`Docs release ${version} has an invalid date ${JSON.stringify(match[2])}.`);
    }
    if (firstReleaseOffset === -1) firstReleaseOffset = match.index;
    releases.push({ version, date: match[2] });
  }
  if (releases.length === 0 || firstReleaseOffset === -1) {
    throw new Error('English docs changelog has no dated release boundary.');
  }
  return { normalized, releases, firstReleaseOffset };
}

function isReleaseDate(value) {
  if (!RELEASE_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function stripChangesetEntryDecoration(line) {
  if (!line.startsWith('- ')) return line;

  let body = line.slice(2);
  let removedDecoration = false;
  for (;;) {
    const pr = PR_DECORATION_PATTERN.exec(body);
    const hash = HASH_DECORATION_PATTERN.exec(body);
    const decoration = pr ?? hash;
    if (decoration === null) break;
    body = body.slice(decoration[0].length);
    removedDecoration = true;
  }
  if (body.startsWith('Thanks ')) {
    const end = body.indexOf('!');
    if (end === -1) {
      throw new Error(`Malformed changesets credit: ${line}`);
    }
    body = body.slice(end + 1).trimStart();
    removedDecoration = true;
  }
  if (removedDecoration) {
    if (!body.startsWith('- ')) {
      throw new Error(`Decorated changesets entry is missing its body separator: ${line}`);
    }
    body = body.slice(2);
  }
  if (body.trim() === '') {
    throw new Error('Changelog entry body is empty after removing decorations.');
  }
  return `- ${body}`;
}

export function cleanReleaseBody(body) {
  const lines = normalizeNewlines(body)
    .split('\n')
    .filter((line) => !CHANGESET_HEADING_PATTERN.test(line))
    .map(stripChangesetEntryDecoration);
  const cleaned = lines.join('\n').trim().replaceAll(/\n{3,}/g, '\n\n');
  if (!/^- /m.test(cleaned)) {
    throw new Error('Release block has no changelog entries after removing changesets headings.');
  }
  if (
    CHANGESET_HEADING_PATTERN.test(cleaned)
    || /^- (?:\[#\d+\]|\[`[0-9a-fA-F]+`\]|Thanks )/m.test(cleaned)
  ) {
    throw new Error('Release block still contains changesets decorations after cleaning.');
  }
  return cleaned;
}

function pendingSourceReleases(source, docs) {
  const releaseLineBoundary = source.releases.findIndex(
    ({ version }) => version === SOURCE_RELEASE_LINE.stopAt,
  );
  if (releaseLineBoundary === -1) {
    throw new Error(
      `Source changelog is missing release-line baseline ${SOURCE_RELEASE_LINE.stopAt}.`,
    );
  }

  const releaseLine = source.releases.slice(0, releaseLineBoundary);
  const docsBoundary = releaseLine.findIndex(
    ({ version }) => version === docs.releases[0].version,
  );
  const pending = docsBoundary === -1
    ? releaseLine
    : releaseLine.slice(0, docsBoundary);
  const pendingVersions = pending.map(({ version }) => version);
  if (new Set(pendingVersions).size !== pendingVersions.length) {
    throw new Error('Pending source range contains duplicate release versions.');
  }
  return pending;
}

function validateReleaseMetadata(release, metadata) {
  if (metadata === null || metadata === undefined) {
    throw new Error(`Release ${release.version} has no published release tag.`);
  }
  const expectedTag = canonicalReleaseTag(release.version);
  if (metadata.tag !== expectedTag) {
    throw new Error(
      `Release ${release.version} must use canonical tag ${expectedTag}, found ${JSON.stringify(metadata.tag)}.`,
    );
  }
  if (!isReleaseDate(metadata.date)) {
    throw new Error(
      `Release ${release.version} tag ${expectedTag} has no parseable release date.`,
    );
  }
  return metadata;
}

export async function createSyncPlan({ sourceText, targetText, resolveRelease }) {
  const source = parseSourceChangelog(sourceText);
  const docs = parseDocsChangelog(targetText);
  const pending = pendingSourceReleases(source, docs);
  if (pending.length === 0) {
    return { changed: false, versions: [], text: docs.normalized };
  }

  const blocks = [];
  for (const release of pending) {
    const metadata = validateReleaseMetadata(
      release,
      await resolveRelease(release, source.packageName),
    );
    blocks.push(
      `## ${release.version} (${metadata.date})\n\n${cleanReleaseBody(release.body)}`,
    );
  }

  const prefix = docs.normalized.slice(0, docs.firstReleaseOffset).trimEnd();
  const suffix = docs.normalized.slice(docs.firstReleaseOffset).trimStart();
  return {
    changed: true,
    versions: pending.map(({ version }) => version),
    text: `${prefix}\n\n${blocks.join('\n\n')}\n\n${suffix.trimEnd()}\n`,
  };
}

async function runGit(args, cwd) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

export async function resolveGitRelease(
  release,
  packageName,
  root = repositoryRoot,
  git = runGit,
) {
  const tag = canonicalReleaseTag(release.version);
  try {
    await git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`], root);
  } catch {
    return null;
  }

  const date = (await git(['show', '-s', '--format=%cs', `${tag}^{commit}`], root)).trim();
  if (!isReleaseDate(date)) {
    throw new Error(`Release tag ${tag} has invalid commit date ${JSON.stringify(date)}.`);
  }

  let taggedText;
  try {
    taggedText = await git(['show', `${tag}:${SOURCE_CHANGELOG_PATH}`], root);
  } catch (error) {
    throw new Error(`Release tag ${tag} does not contain ${SOURCE_CHANGELOG_PATH}.`, {
      cause: error,
    });
  }
  const taggedSource = parseSourceChangelog(taggedText);
  if (taggedSource.packageName !== packageName) {
    throw new Error(
      `Release tag ${tag} contains package ${JSON.stringify(taggedSource.packageName)}, expected ${JSON.stringify(packageName)}.`,
    );
  }
  const taggedRelease = taggedSource.releases.find(({ version }) => version === release.version);
  if (taggedRelease === undefined) {
    throw new Error(`Release tag ${tag} does not contain changelog version ${release.version}.`);
  }
  if (canonicalReleaseBody(taggedRelease.body) !== canonicalReleaseBody(release.body)) {
    throw new Error(
      `Release ${release.version} differs from ${SOURCE_CHANGELOG_PATH} recorded at tag ${tag}.`,
    );
  }
  return { tag, date };
}

async function atomicWrite(path, text) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, text, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function syncChangelog({
  root = repositoryRoot,
  dryRun = false,
  readText = (path) => readFile(path, 'utf8'),
  writeText = atomicWrite,
  resolveRelease = (release, packageName) =>
    resolveGitRelease(release, packageName, root),
} = {}) {
  const sourcePath = resolve(root, SOURCE_CHANGELOG_PATH);
  const targetPath = resolve(root, ENGLISH_CHANGELOG_PATH);
  const [sourceText, targetText] = await Promise.all([
    readText(sourcePath),
    readText(targetPath),
  ]);
  const plan = await createSyncPlan({ sourceText, targetText, resolveRelease });
  if (plan.changed && !dryRun) {
    await writeText(targetPath, plan.text);
  }
  return { ...plan, sourcePath, targetPath, dryRun };
}

async function main() {
  const { dryRun } = parseSyncChangelogArgs(process.argv.slice(2));
  const result = await syncChangelog({ dryRun });
  if (!result.changed) {
    process.stdout.write('English docs changelog is already up to date.\n');
    return;
  }
  const range = result.versions.join(', ');
  process.stdout.write(
    `${
      dryRun
        ? `Dry run: would sync released version(s) ${range} into ${ENGLISH_CHANGELOG_PATH}.`
        : `Synced released version(s) ${range} into ${ENGLISH_CHANGELOG_PATH}.`
    }\n`,
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `sync-changelog: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
