/**
 * Scenario: native release archives and aggregate manifest production.
 *
 * Responsibilities asserted: package a native executable, require the exact
 * six-platform Hakimi artifact set, verify each archive checksum, normalize
 * supported release tags, and emit clear subprocess failures. The package and
 * manifest scripts are real subprocess boundaries; fixture binaries and
 * archives live in isolated directories removed after every test.
 *
 * Run: `pnpm --filter @bhjia-phys/hakimi exec vitest run test/scripts/native/release-artifacts.test.ts`
 */

import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { inflateRawSync } from 'node:zlib';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { verifyWebAssets } from '../../../scripts/check-web-assets.mjs';
import {
  NATIVE_BUILD_RECEIPT_VERSION,
  writeNativeBuildReceipt,
} from '../../../scripts/native/build-receipt.mjs';
import {
  appRoot,
  nativeBuildReceiptPath,
} from '../../../scripts/native/paths.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(appRoot, '../..');
const buildWebAssetsScript = resolve(appRoot, 'scripts/build-web-assets.mjs');
const packageScript = resolve(appRoot, 'scripts/native/package.mjs');
const manifestScript = resolve(appRoot, 'scripts/native/produce-manifest.mjs');
const artifactsDir = resolve(appRoot, 'dist-native/artifacts');
const target = 'test-zip-artifact';
const executableName = process.platform === 'win32' ? 'hakimi.exe' : 'hakimi';
const fakeBinary = resolve(appRoot, 'dist-native/bin', target, executableName);
const expectedNativeTargets = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-arm64',
  'win32-x64',
] as const;

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function stageNativePackageInput(binaryContent: string) {
  mkdirSync(resolve(appRoot, 'dist-native/bin', target), { recursive: true });
  writeFileSync(fakeBinary, binaryContent, { mode: 0o755 });
  const { provenance } = await verifyWebAssets();
  await writeNativeBuildReceipt({ target, provenance, binaryPath: fakeBinary });
  return provenance;
}

function runNativePackage() {
  return spawnSync(process.execPath, [packageScript], {
    cwd: appRoot,
    env: { ...process.env, KIMI_CODE_BUILD_TARGET: target },
    encoding: 'utf8',
  });
}

function zipEntryNames(zipPath: string): readonly string[] {
  const zip = readFileSync(zipPath);
  const eocdOffset = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  let offset = zip.readUInt32LE(eocdOffset + 16);
  const names: string[] = [];

  for (let i = 0; i < entryCount; i += 1) {
    expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    names.push(zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf-8'));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return names;
}

function readZipEntry(zipPath: string, expectedName: string): Buffer {
  const zip = readFileSync(zipPath);
  const eocdOffset = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  let offset = zip.readUInt32LE(eocdOffset + 16);

  for (let i = 0; i < entryCount; i += 1) {
    expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localHeaderOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf-8');
    if (name === expectedName) {
      return readLocalEntry(zip, localHeaderOffset, method, compressedSize);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error(`zip entry not found: ${expectedName}`);
}

function readLocalEntry(
  zip: Buffer,
  localHeaderOffset: number,
  method: number,
  compressedSize: number,
): Buffer {
  expect(zip.readUInt32LE(localHeaderOffset)).toBe(0x04034b50);
  const nameLength = zip.readUInt16LE(localHeaderOffset + 26);
  const extraLength = zip.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + nameLength + extraLength;
  const compressed = zip.subarray(dataStart, dataStart + compressedSize);
  if (method === 0) return compressed;
  if (method === 8) return inflateRawSync(compressed);
  throw new Error(`unsupported zip compression method: ${String(method)}`);
}

function findEndOfCentralDirectory(zip: Buffer): number {
  for (let offset = zip.length - 22; offset >= 0; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('end of central directory not found');
}

function expectTextOrder(text: string, needles: readonly string[]): void {
  let previous = -1;
  for (const needle of needles) {
    const current = text.indexOf(needle, previous + 1);
    expect(current, `missing or out-of-order text: ${needle}`).toBeGreaterThan(previous);
    previous = current;
  }
}

describe('native release artifacts', () => {
  // Every release dir created via makeReleaseDir is tracked and removed in
  // afterEach so no /tmp leftovers survive the suite.
  const tempReleaseDirs: string[] = [];

  beforeAll(async () => {
    await execFileAsync(process.execPath, [buildWebAssetsScript], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: 180_000,
    });
  }, 180_000);

  it('wires ignored Web outputs through package, CI, release, native, and Nix builds', () => {
    const rootPackage = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    const cliPackage = JSON.parse(
      readFileSync(resolve(appRoot, 'package.json'), 'utf8'),
    ) as { files?: string[]; scripts?: Record<string, string> };
    const ignore = readFileSync(resolve(repositoryRoot, '.gitignore'), 'utf8');
    const boundary = readFileSync(
      resolve(repositoryRoot, 'scripts/check-hakimi-release-boundary.mjs'),
      'utf8',
    );
    const boundaryWorkflow = readFileSync(
      resolve(repositoryRoot, '.github/workflows/hakimi-boundary.yml'),
      'utf8',
    );
    const ci = readFileSync(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');
    const release = readFileSync(
      resolve(repositoryRoot, '.github/workflows/release-hakimi.yml'),
      'utf8',
    );
    const native = readFileSync(
      resolve(repositoryRoot, '.github/workflows/_native-build.yml'),
      'utf8',
    );
    const flake = readFileSync(resolve(repositoryRoot, 'flake.nix'), 'utf8');

    expect(rootPackage.scripts?.['build:web-assets']).toBe(
      'node apps/kimi-code/scripts/build-web-assets.mjs',
    );
    expect(rootPackage.scripts?.['test:docs:sync-changelog']).toBe(
      'node --test docs/scripts/sync-changelog.test.mjs',
    );
    expect(cliPackage.files).toEqual(
      expect.arrayContaining(['dist-web', 'web-base.json']),
    );
    expect(cliPackage.scripts?.['build']).toMatch(
      /^node scripts\/build-web-assets\.mjs && /,
    );
    expect(cliPackage.scripts?.['prepack']).toBe('node scripts/build-web-assets.mjs');
    expect(ignore).not.toContain('/apps/kimi-code/dist-web/');
    expect(ignore).not.toContain('/apps/kimi-code/web-base.json');
    expect(boundary).toContain("'ls-files'");
    expect(boundary).toContain("'apps/kimi-code/dist-web'");
    expect(boundary).toContain("'apps/kimi-code/web-base.json'");
    expect(boundary).toContain('tracked Web outputs match the provenance manifest');
    expect(boundary).toContain('generated Web outputs contain no untracked files');
    expect(boundary).not.toContain("'--exclude-standard'");
    expect(boundary).not.toContain('assertWebAssets');
    expect(boundaryWorkflow).toContain('pull_request:');
    expect(boundaryWorkflow).toContain('node scripts/check-hakimi-release-boundary.mjs');
    expect(ci).toContain('pnpm run test:docs:sync-changelog');

    expectTextOrder(ci, [
      'Verify committed Hakimi web assets before package build',
      'run: pnpm run build:web-assets -- --check',
      '- run: pnpm run build\n',
    ]);
    expectTextOrder(ci, [
      'pnpm run build:web-assets -- --check',
      'pnpm run build:web-assets\n',
    ]);
    expectTextOrder(release, [
      'Run Hakimi release-boundary checks',
      'Install dependencies',
      'pnpm run build:web-assets -- --check',
      'pnpm run build:web-assets\n',
      'Build packages',
    ]);
    expectTextOrder(native, [
      'pnpm run build:web-assets -- --check',
      'pnpm run build:web-assets\n',
      'Build native executable',
    ]);
    expect(ci).not.toContain('--allow-nix-toolchain-mismatch');
    expect(release).not.toContain('--allow-nix-toolchain-mismatch');
    expect(native).not.toContain('--allow-nix-toolchain-mismatch');
    expect(flake).not.toContain('--allow-nix-toolchain-mismatch');
    expect(flake).not.toContain('KIMI_WEB_NIX_BUILD');
    expect(flake).toContain('pnpmVersion = "10.33.0";');
    expect(flake).toContain('pnpm-${pnpmVersion}.tgz');
    expectTextOrder(flake, [
      'pnpm run build:web-assets -- --check',
      'pnpm run build:web-assets\n',
      'pnpm run build:web-assets -- --check',
      'pnpm --filter=@bhjia-phys/hakimi run build:native:sea',
    ]);
  });

  async function makeReleaseDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'hakimi-manifest-zip-'));
    tempReleaseDirs.push(dir);
    return dir;
  }

  async function stageZipChecksum(releaseDir: string, targetName: string): Promise<string> {
    const archiveBytes = Buffer.from('fake zip bytes');
    const checksum = sha256(archiveBytes);
    await writeFile(join(releaseDir, `${targetName}.zip`), archiveBytes);
    await writeFile(
      join(releaseDir, `${targetName}.zip.sha256`),
      `${checksum}  ${targetName}.zip\n`,
    );
    return checksum;
  }

  async function stageCompleteRelease(releaseDir: string): Promise<string> {
    let checksum = '';
    for (const targetName of expectedNativeTargets) {
      checksum = await stageZipChecksum(releaseDir, `hakimi-${targetName}`);
    }
    return checksum;
  }

  afterEach(() => {
    rmSync(resolve(appRoot, 'dist-native/bin', target), { recursive: true, force: true });
    rmSync(nativeBuildReceiptPath(target), { force: true });
    rmSync(resolve(artifactsDir, `hakimi-${target}.zip`), { force: true });
    rmSync(resolve(artifactsDir, `hakimi-${target}.zip.sha256`), { force: true });
    for (const dir of tempReleaseDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('packages the v4 receipt-bound native binary as a zip archive and checksums it', async () => {
    const binaryContent = 'native binary payload\n';
    const provenance = await stageNativePackageInput(binaryContent);
    const receipt = JSON.parse(readFileSync(nativeBuildReceiptPath(target), 'utf8')) as {
      version: number;
      web: Record<string, unknown>;
      binary: { sha256: string };
    };
    expect(receipt).toEqual({
      version: NATIVE_BUILD_RECEIPT_VERSION,
      target,
      web: {
        repository: provenance.repository,
        toolchain: provenance.recipe.toolchain,
        sourceSha256: provenance.source.sha256,
        recipeSha256: provenance.recipe.sha256,
        bundleSha256: provenance.bundle.sha256,
        brandingPatchVersion: provenance.brandingPatchVersion,
      },
      binary: { sha256: sha256(binaryContent) },
    });

    await execFileAsync(process.execPath, [packageScript], {
      cwd: appRoot,
      env: { ...process.env, KIMI_CODE_BUILD_TARGET: target },
    });

    const archivePath = resolve(artifactsDir, `hakimi-${target}.zip`);
    const checksumPath = `${archivePath}.sha256`;
    expect(existsSync(archivePath)).toBe(true);
    expect(existsSync(checksumPath)).toBe(true);
    expect(zipEntryNames(archivePath)).toEqual([executableName]);
    expect(readZipEntry(archivePath, executableName).toString('utf-8')).toBe(binaryContent);
    expect(readFileSync(checksumPath, 'utf-8')).toBe(
      `${sha256(readFileSync(archivePath))}  hakimi-${target}.zip\n`,
    );
  });

  it('rejects packaging when the native build receipt is missing', () => {
    mkdirSync(resolve(appRoot, 'dist-native/bin', target), { recursive: true });
    writeFileSync(fakeBinary, 'unreceipted binary\n', { mode: 0o755 });

    const result = runNativePackage();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Native build receipt not found');
    expect(existsSync(resolve(artifactsDir, `hakimi-${target}.zip`))).toBe(false);
  });

  it('rejects packaging when the binary no longer matches its receipt', async () => {
    await stageNativePackageInput('original binary\n');
    writeFileSync(fakeBinary, 'changed binary\n', { mode: 0o755 });

    const result = runNativePackage();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('binary sha256 does not match');
  });

  it('rejects packaging when the receipt records stale toolchain, source, recipe, or bundle identity', async () => {
    const provenance = await stageNativePackageInput('native binary\n');
    await writeNativeBuildReceipt({
      target,
      provenance: {
        ...provenance,
        recipe: {
          ...provenance.recipe,
          toolchain: { ...provenance.recipe.toolchain, node: '25.0.0' },
        },
      },
      binaryPath: fakeBinary,
    });

    let result = runNativePackage();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Web identity does not match');

    await writeNativeBuildReceipt({
      target,
      provenance: {
        ...provenance,
        source: { ...provenance.source, sha256: '0'.repeat(64) },
      },
      binaryPath: fakeBinary,
    });

    result = runNativePackage();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Web identity does not match');

    await writeNativeBuildReceipt({
      target,
      provenance: {
        ...provenance,
        recipe: { ...provenance.recipe, sha256: '0'.repeat(64) },
      },
      binaryPath: fakeBinary,
    });
    result = runNativePackage();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Web identity does not match');

    await writeNativeBuildReceipt({
      target,
      provenance: {
        ...provenance,
        bundle: { ...provenance.bundle, sha256: '0'.repeat(64) },
      },
      binaryPath: fakeBinary,
    });
    result = runNativePackage();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Web identity does not match');
  });

  it('rejects packaging with an old native build receipt schema', async () => {
    await stageNativePackageInput('native binary\n');
    const receiptPath = nativeBuildReceiptPath(target);
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as { version: number };
    receipt.version = NATIVE_BUILD_RECEIPT_VERSION - 1;
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    const result = runNativePackage();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Native build receipt must use version ${NATIVE_BUILD_RECEIPT_VERSION}`,
    );
  });

  it('produces a manifest from zip archive checksums', async () => {
    const releaseDir = await makeReleaseDir();
    const checksum = await stageCompleteRelease(releaseDir);

    await execFileAsync(process.execPath, [manifestScript, releaseDir, 'hakimi-v0.5.0']);

    const manifest = JSON.parse(
      await readFile(join(releaseDir, 'manifest.json'), 'utf-8'),
    ) as {
      version: string;
      tag: string;
      platforms: Record<string, { filename: string; checksum: string }>;
    };
    expect(manifest.version).toBe('0.5.0');
    expect(manifest.tag).toBe('hakimi-v0.5.0');
    expect(Object.keys(manifest.platforms)).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win32-arm64',
      'win32-x64',
    ]);
    for (const targetName of expectedNativeTargets) {
      expect(manifest.platforms[targetName]).toEqual({
        filename: `hakimi-${targetName}.zip`,
        checksum,
      });
    }
  });

  it('normalizes historical release tags into the canonical hakimi-v form in the manifest', async () => {
    const releaseDir = await makeReleaseDir();
    await stageCompleteRelease(releaseDir);

    await execFileAsync(process.execPath, [manifestScript, releaseDir, '@bhjia-phys/hakimi@0.5.0']);

    const manifest = JSON.parse(await readFile(join(releaseDir, 'manifest.json'), 'utf-8')) as {
      version: string;
      tag: string;
    };
    expect(manifest.version).toBe('0.5.0');
    expect(manifest.tag).toBe('hakimi-v0.5.0');
  });

  it('exits with code 1 and names missing files when a platform artifact is absent', async () => {
    const releaseDir = await makeReleaseDir();
    for (const targetName of expectedNativeTargets.slice(0, -1)) {
      await stageZipChecksum(releaseDir, `hakimi-${targetName}`);
    }

    const result = spawnSync(process.execPath, [manifestScript, releaseDir, 'hakimi-v0.5.0'], {
      encoding: 'utf-8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing required native release artifacts');
    expect(result.stderr).toContain('hakimi-win32-x64.zip');
  });

  it('exits with code 1 and reports the archive when its checksum does not match', async () => {
    const releaseDir = await makeReleaseDir();
    await stageCompleteRelease(releaseDir);
    await writeFile(join(releaseDir, 'hakimi-linux-x64.zip'), 'corrupted archive');

    const result = spawnSync(process.execPath, [manifestScript, releaseDir, 'hakimi-v0.5.0'], {
      encoding: 'utf-8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Checksum mismatch for hakimi-linux-x64.zip');
  });

  it('exits with code 1 and a clear stderr line when the release tag is not strict semver', async () => {
    const releaseDir = await makeReleaseDir();

    const result = spawnSync(process.execPath, [manifestScript, releaseDir, 'nightly-build'], {
      encoding: 'utf-8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid release tag');
  });
});
