#!/usr/bin/env node
/** Record the in-repository Hakimi Web source and exact generated bundle bytes. */

import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildWebProvenance } from './check-web-assets.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultRepositoryRoot = resolve(appRoot, '../..');
const defaultTarget = resolve(appRoot, 'dist-web');
const defaultOutput = resolve(appRoot, 'web-base.json');
const usage =
  'Usage: node apps/kimi-code/scripts/record-web-provenance.mjs ' +
  '[--repository-root <hakimi-checkout>] [--target <dist-web>] [--output <web-base.json>]';

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} requires a value. ${usage}`);
  }
  return value;
}

export function parseRecordWebProvenanceArgs(argv) {
  let repositoryRoot = defaultRepositoryRoot;
  let target = defaultTarget;
  let output = defaultOutput;
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!['--repository-root', '--target', '--output'].includes(option)) {
      throw new Error(`Unknown option ${option}. ${usage}`);
    }
    if (seen.has(option)) {
      throw new Error(`${option} may only be specified once. ${usage}`);
    }
    seen.add(option);
    const value = optionValue(argv, index, option);
    index += 1;
    if (option === '--repository-root') repositoryRoot = resolve(value);
    else if (option === '--target') target = resolve(value);
    else output = resolve(value);
  }

  return { repositoryRoot, target, output };
}

/**
 * @param {{
 *   repositoryRoot?: string;
 *   target?: string;
 *   output?: string;
 * }} [options]
 */
export async function recordWebProvenance({
  repositoryRoot = defaultRepositoryRoot,
  target = defaultTarget,
  output = defaultOutput,
} = {}) {
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
    repositoryRoot: resolve(repositoryRoot),
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
    `Web provenance recorded: ${provenance.repository} ` +
      `(source ${provenance.source.sha256}, recipe ${provenance.recipe.sha256}, bundle ${provenance.bundle.sha256})`,
  );
}
