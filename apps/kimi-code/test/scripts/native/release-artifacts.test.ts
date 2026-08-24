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

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { inflateRawSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { verifyWebAssets } from '../../../scripts/check-web-assets.mjs';
import { writeNativeBuildReceipt } from '../../../scripts/native/build-receipt.mjs';
import {
  appRoot,
  nativeBuildReceiptPath,
} from '../../../scripts/native/paths.mjs';

const execFileAsync = promisify(execFile);
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

describe('native release artifacts', () => {
  // Every release dir created via makeReleaseDir is tracked and removed in
  // afterEach so no /tmp leftovers survive the suite.
  const tempReleaseDirs: string[] = [];

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

  it('packages the receipt-bound native binary as a zip archive and checksums it', async () => {
    const binaryContent = 'native binary payload\n';
    await stageNativePackageInput(binaryContent);

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

  it('rejects packaging when the receipt records a stale Web identity', async () => {
    const provenance = await stageNativePackageInput('native binary\n');
    await writeNativeBuildReceipt({
      target,
      provenance: { ...provenance, commit: '0'.repeat(40) },
      binaryPath: fakeBinary,
    });

    const result = runNativePackage();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Web identity does not match');
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
