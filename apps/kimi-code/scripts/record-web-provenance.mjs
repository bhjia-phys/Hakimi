#!/usr/bin/env node
/**
 * Record the external code-app source identity and the exact branded dist-web
 * bytes that Hakimi will package. Run after sync:web and patch-web-branding.
 */

import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildWebProvenance } from './check-web-assets.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultTarget = resolve(appRoot, 'dist-web');
const defaultOutput = resolve(appRoot, 'web-base.json');
const usage =
  'Usage: node apps/kimi-code/scripts/record-web-provenance.mjs ' +
  '--repository code-app --commit <40-char-lowercase-sha> ' +
  '[--target <dist-web>] [--output <web-base.json>]';

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} requires a value. ${usage}`);
  }
  return value;
}

export function parseRecordWebProvenanceArgs(argv) {
  let repository;
  let commit;
  let target = defaultTarget;
  let output = defaultOutput;
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!['--repository', '--commit', '--target', '--output'].includes(option)) {
      throw new Error(`Unknown option ${option}. ${usage}`);
    }
    if (seen.has(option)) {
      throw new Error(`${option} may only be specified once. ${usage}`);
    }
    seen.add(option);
    const value = optionValue(argv, index, option);
    index += 1;
    if (option === '--repository') repository = value;
    else if (option === '--commit') commit = value;
    else if (option === '--target') target = resolve(value);
    else output = resolve(value);
  }

  if (repository === undefined || commit === undefined) {
    throw new Error(`--repository and --commit are required. ${usage}`);
  }
  return { repository, commit, target, output };
}

export async function recordWebProvenance({
  repository,
  commit,
  target = defaultTarget,
  output = defaultOutput,
}) {
  const resolvedTarget = resolve(target);
  const resolvedOutput = resolve(output);
  if (
    resolvedOutput === resolvedTarget ||
    resolvedOutput.startsWith(`${resolvedTarget}${sep}`)
  ) {
    throw new Error('web-base.json must live outside dist-web so it cannot hash itself.');
  }

  const provenance = await buildWebProvenance({
    target: resolvedTarget,
    repository,
    commit,
  });
  const temporaryOutput = `${resolvedOutput}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryOutput, `${JSON.stringify(provenance, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryOutput, resolvedOutput);
  } finally {
    await rm(temporaryOutput, { force: true });
  }
  return provenance;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseRecordWebProvenanceArgs(process.argv.slice(2));
  const provenance = await recordWebProvenance(options);
  console.log(
    `Web provenance recorded: ${provenance.repository}@${provenance.commit} ` +
      `(${provenance.bundle.fileCount} files, ${provenance.bundle.sha256})`,
  );
}
