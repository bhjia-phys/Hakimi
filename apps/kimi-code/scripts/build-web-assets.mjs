#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  buildWebProvenance,
  readWebToolchainRequirements,
  verifyWebAssetsAgainstProvenance,
} from './check-web-assets.mjs';
import { patchWebBranding } from './patch-web-branding.mjs';

const execFileAsync = promisify(execFile);
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(appRoot, '../..');
const usage =
  'Usage: node apps/kimi-code/scripts/build-web-assets.mjs ' +
  '[--check] [--allow-nix-toolchain-mismatch]';
const NIX_BUILD_MARKER = 'KIMI_WEB_NIX_BUILD';
const PASSTHROUGH_ENV_KEYS = [
  'PATH',
  'SystemRoot',
  'SYSTEMROOT',
  'ComSpec',
  'COMSPEC',
  'PATHEXT',
  'TEMP',
  'TMP',
  'TMPDIR',
];
export const CANONICAL_WEB_BUILD_ENV = Object.freeze({
  KIMI_WEB_CANONICAL_BUILD: '1',
  VITE_KIMI_SERVER_HTTP_URL: '',
  KIMI_WEB_DESKTOP: '0',
  KIMI_BACKEND_DEFAULT_URL: 'http://127.0.0.1:58627',
  KIMI_BACKEND_MULTI_URL: 'http://127.0.0.1:58628',
  KIMI_SERVER_URL: 'http://127.0.0.1:58627',
  WEB_PORT: '5175',
  WEB_PREVIEW_PORT: '4175',
  NODE_ENV: 'production',
  SOURCE_DATE_EPOCH: '0',
  TZ: 'UTC',
  LANG: 'C',
  LC_ALL: 'C',
  NO_COLOR: '1',
});

/**
 * @param {NodeJS.ProcessEnv} ambient
 * @param {{ repositoryRoot: string; stagingRoot: string }} paths
 * @returns {NodeJS.ProcessEnv}
 */
export function createCanonicalBuildEnvironment(
  ambient,
  { repositoryRoot: root, stagingRoot },
) {
  const env = {};
  for (const key of PASSTHROUGH_ENV_KEYS) {
    if (ambient[key] !== undefined) env[key] = ambient[key];
  }
  return {
    ...env,
    ...CANONICAL_WEB_BUILD_ENV,
    KIMI_WEB_BUILD_OUT_DIR: stagingRoot,
    NPM_CONFIG_USERCONFIG: resolve(root, '.npmrc'),
  };
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toPosixPath(path) {
  return path.split('\\').join('/');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function listRelativeFiles(root) {
  const files = [];

  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        files.push(toPosixPath(relative(root, path)));
      }
    }
  }

  await walk(root);
  files.sort(compareStrings);
  return files;
}

function parseSemver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value);
  if (match === null) return undefined;
  return {
    numbers: match.slice(1, 4).map(Number),
    prerelease: match[4] !== undefined,
  };
}

function nodeVersionMeetsRequirement(version, requirement) {
  const actual = parseSemver(version);
  const minimum = parseSemver(requirement.slice('>='.length));
  if (actual === undefined || minimum === undefined) return false;
  for (let index = 0; index < actual.numbers.length; index += 1) {
    if (actual.numbers[index] > minimum.numbers[index]) return true;
    if (actual.numbers[index] < minimum.numbers[index]) return false;
  }
  return !actual.prerelease;
}

async function readPnpmVersion({ repositoryRoot: root, environment }) {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const { stdout } = await execFileAsync(command, ['--version'], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
  });
  return stdout.trim();
}

export async function assertCanonicalBuildToolchain({
  repositoryRoot: root = repositoryRoot,
  environment = process.env,
  nodeVersion = process.versions.node,
  getPnpmVersion = readPnpmVersion,
} = {}) {
  const requirements = await readWebToolchainRequirements(root);
  if (!nodeVersionMeetsRequirement(nodeVersion, requirements.node)) {
    throw new Error(
      `Canonical Web build requires Node ${requirements.node}; current process is ${nodeVersion}.`,
    );
  }

  let pnpmVersion;
  try {
    pnpmVersion = String(await getPnpmVersion({ repositoryRoot: root, environment })).trim();
  } catch (error) {
    throw new Error(
      `Canonical Web build could not execute pnpm --version from PATH: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (pnpmVersion !== requirements.pnpm) {
    throw new Error(
      `Canonical Web build requires pnpm ${requirements.pnpm}; PATH resolves pnpm ${pnpmVersion}.`,
    );
  }
  return { requirements, actual: { node: nodeVersion, pnpm: pnpmVersion } };
}

async function runViteBuild({ repositoryRoot: root, environment, stagingRoot }) {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  await new Promise((resolveBuild, reject) => {
    const child = spawn(
      command,
      ['--filter', '@bhjia-phys/hakimi-web', 'run', 'build', '--logLevel', 'warn'],
      {
        cwd: root,
        env: environment,
        stdio: 'inherit',
      },
    );
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolveBuild();
        return;
      }
      reject(
        new Error(
          signal === null
            ? `Hakimi Web build exited with code ${String(code)}.`
            : `Hakimi Web build was terminated by ${signal}.`,
        ),
      );
    });
  });
}

async function compareBundleDirectories(expectedRoot, generatedRoot) {
  let expectedFiles;
  let generatedFiles;
  try {
    [expectedFiles, generatedFiles] = await Promise.all([
      listRelativeFiles(expectedRoot),
      listRelativeFiles(generatedRoot),
    ]);
  } catch (error) {
    throw new Error(
      `Cannot compare generated dist-web: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const expectedSet = new Set(expectedFiles);
  const generatedSet = new Set(generatedFiles);
  const differences = [];
  for (const path of expectedFiles) {
    if (!generatedSet.has(path)) {
      differences.push(`${path}: missing from generated dist-web`);
      continue;
    }
    const [expected, generated] = await Promise.all([
      readFile(resolve(expectedRoot, ...path.split('/'))),
      readFile(resolve(generatedRoot, ...path.split('/'))),
    ]);
    if (!expected.equals(generated)) {
      differences.push(
        `${path}: content differs (rebuilt ${sha256(expected)}, generated ${sha256(generated)})`,
      );
    }
  }
  for (const path of generatedFiles) {
    if (!expectedSet.has(path)) {
      differences.push(`${path}: unexpected in generated dist-web`);
    }
  }
  if (differences.length > 0) {
    throw new Error(
      `Generated dist-web differs from a clean Hakimi Web rebuild:\n- ${differences.join('\n- ')}`,
    );
  }
}

async function assertGeneratedProvenance(provenancePath, expectedText) {
  let generatedText;
  try {
    generatedText = await readFile(provenancePath, 'utf8');
  } catch (error) {
    throw new Error(
      `Cannot read generated web-base.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (generatedText !== expectedText) {
    throw new Error(
      'Generated web-base.json differs from the deterministic provenance of the clean rebuild.',
    );
  }
}

async function moveAsideIfPresent(path, backupPath, renamePath) {
  try {
    await renamePath(path, backupPath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function replaceProductionAssets(
  { stagingRoot, target, provenancePath, provenanceText },
  {
    renamePath = rename,
    removePath = rm,
    writePath = writeFile,
    warn = console.warn,
  } = {},
) {
  const suffix = `${process.pid}-${randomUUID()}`;
  const backupRoot = resolve(dirname(target), `.dist-web-backup-${suffix}`);
  const temporaryProvenance = `${provenancePath}.${suffix}.tmp`;
  let originalMoved = false;
  let stagingInstalled = false;
  let cutoverComplete = false;

  try {
    await writePath(temporaryProvenance, provenanceText, { encoding: 'utf8', flag: 'wx' });
    originalMoved = await moveAsideIfPresent(target, backupRoot, renamePath);
    await renamePath(stagingRoot, target);
    stagingInstalled = true;
    await renamePath(temporaryProvenance, provenancePath);
    // Cutover point: the complete staged directory and matching provenance are
    // both installed. Nothing after this line may report the cutover as failed.
    cutoverComplete = true;
  } catch (error) {
    const rollbackErrors = [];
    if (stagingInstalled && !cutoverComplete) {
      try {
        await renamePath(target, stagingRoot);
        stagingInstalled = false;
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (originalMoved && !stagingInstalled && !cutoverComplete) {
      try {
        await renamePath(backupRoot, target);
        originalMoved = false;
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        'Web asset replacement failed and rollback was incomplete.',
      );
    }
    throw error;
  } finally {
    try {
      await removePath(temporaryProvenance, { force: true });
    } catch (error) {
      warn(
        `Web cutover ${cutoverComplete ? 'completed' : 'aborted'}; temporary provenance cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (originalMoved) {
    try {
      await removePath(backupRoot, { recursive: true, force: true });
    } catch (error) {
      warn(
        `Web cutover completed; backup cleanup failed at ${backupRoot}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { installed: true };
}

export function parseBuildWebAssetsArgs(argv) {
  let check = false;
  let allowNixToolchainMismatch = false;
  const options = argv[0] === '--' ? argv.slice(1) : argv;
  for (const option of options) {
    if (option === '--check') {
      if (check) {
        throw new Error(`--check may only be specified once. ${usage}`);
      }
      check = true;
      continue;
    }
    if (option === '--allow-nix-toolchain-mismatch') {
      if (allowNixToolchainMismatch) {
        throw new Error(
          `--allow-nix-toolchain-mismatch may only be specified once. ${usage}`,
        );
      }
      allowNixToolchainMismatch = true;
      continue;
    }
    throw new Error(`Unknown option ${option}. ${usage}`);
  }
  return { check, allowNixToolchainMismatch };
}

function assertNixToolchainBypass(ambientEnvironment) {
  if (ambientEnvironment[NIX_BUILD_MARKER] !== '1') {
    throw new Error(
      `--allow-nix-toolchain-mismatch is restricted to the Nix build; ${NIX_BUILD_MARKER}=1 is required.`,
    );
  }
}

/**
 * @param {{
 *   check?: boolean;
 *   allowNixToolchainMismatch?: boolean;
 *   ambientEnvironment?: NodeJS.ProcessEnv;
 *   repositoryRoot?: string;
 *   appRoot?: string;
 *   checkToolchain?: (options: {
 *     repositoryRoot: string;
 *     environment: NodeJS.ProcessEnv;
 *   }) => Promise<unknown>;
 *   build?: (options: {
 *     repositoryRoot: string;
 *     environment: NodeJS.ProcessEnv;
 *     stagingRoot: string;
 *   }) => Promise<void>;
 * }} [options]
 */
export async function buildWebAssets({
  check = false,
  allowNixToolchainMismatch = false,
  ambientEnvironment = process.env,
  repositoryRoot: sourceRepositoryRoot = repositoryRoot,
  appRoot: targetAppRoot = appRoot,
  checkToolchain = assertCanonicalBuildToolchain,
  build = runViteBuild,
} = {}) {
  if (allowNixToolchainMismatch) {
    assertNixToolchainBypass(ambientEnvironment);
  }

  const resolvedRepositoryRoot = resolve(sourceRepositoryRoot);
  const resolvedAppRoot = resolve(targetAppRoot);
  const target = resolve(resolvedAppRoot, 'dist-web');
  const provenancePath = resolve(resolvedAppRoot, 'web-base.json');
  const stagingRoot = await mkdtemp(resolve(resolvedAppRoot, '.dist-web-staging-'));
  const environment = createCanonicalBuildEnvironment(ambientEnvironment, {
    repositoryRoot: resolvedRepositoryRoot,
    stagingRoot,
  });

  try {
    if (!allowNixToolchainMismatch) {
      await checkToolchain({
        repositoryRoot: resolvedRepositoryRoot,
        environment,
      });
    }
    await build({
      repositoryRoot: resolvedRepositoryRoot,
      environment,
      stagingRoot,
    });
    const patched = patchWebBranding(stagingRoot);
    const secondPass = patchWebBranding(stagingRoot);
    if (secondPass !== 0) {
      throw new Error(
        `Web branding guard is not idempotent: second pass made ${secondPass} replacement(s).`,
      );
    }

    const provenance = await buildWebProvenance({
      target: stagingRoot,
      repositoryRoot: resolvedRepositoryRoot,
    });
    await verifyWebAssetsAgainstProvenance(stagingRoot, provenance, {
      repositoryRoot: resolvedRepositoryRoot,
    });
    const provenanceText = `${JSON.stringify(provenance, null, 2)}\n`;

    if (check) {
      await compareBundleDirectories(stagingRoot, target);
      await assertGeneratedProvenance(provenancePath, provenanceText);
      return { check: true, patched, provenance };
    }

    await replaceProductionAssets({
      stagingRoot,
      target,
      provenancePath,
      provenanceText,
    });
    return { check: false, patched, provenance };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { check, allowNixToolchainMismatch } = parseBuildWebAssetsArgs(
    process.argv.slice(2),
  );
  const result = await buildWebAssets({ check, allowNixToolchainMismatch });
  const identity =
    `source ${result.provenance.source.sha256}, ` +
    `recipe ${result.provenance.recipe.sha256}`;
  console.log(
    check
      ? `Web assets are reproducible (${result.provenance.bundle.fileCount} files, ${identity}).`
      : `Web assets built (${result.provenance.bundle.fileCount} files, ${result.patched} branding replacement(s), ${identity}).`,
  );
}
