import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { ZipFile } from 'yazl';

import { verifyWebAssets } from '../check-web-assets.mjs';
import { assertNativeBuildReceipt, sha256File } from './build-receipt.mjs';
import { executableName, nativeArtifactsDir, nativeBinPath, targetTriple } from './paths.mjs';

const target = targetTriple();
const execName = executableName();
const sourceBinary = nativeBinPath(target);
const artifactsDir = nativeArtifactsDir();

// Flat-name archive for GH Release (GitHub Release assets do not support subdirectories).
const artifactName = `hakimi-${target}.zip`;
const artifactPath = resolve(artifactsDir, artifactName);
const checksumPath = `${artifactPath}.sha256`;

async function packageNative() {
  const { provenance } = await verifyWebAssets();
  try {
    const info = await stat(sourceBinary);
    if (!info.isFile()) throw new Error('not a file');
  } catch {
    throw new Error(
      `Native executable not found at ${sourceBinary}. Run build:native:sea first.`,
    );
  }

  await mkdir(artifactsDir, { recursive: true });
  const stagingDir = await mkdtemp(resolve(artifactsDir, '.package-'));
  const stagedBinary = resolve(stagingDir, execName);
  try {
    await copyFile(sourceBinary, stagedBinary);
    await assertNativeBuildReceipt({
      target,
      provenance,
      binaryPath: stagedBinary,
    });

    const zip = new ZipFile();
    zip.addFile(stagedBinary, execName, { mode: 0o100755 });
    zip.end();
    await pipeline(zip.outputStream, createWriteStream(artifactPath));
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }

  const digest = await sha256File(artifactPath);
  await writeFile(checksumPath, `${digest}  ${basename(artifactPath)}\n`);
  console.log(`Wrote native artifact: ${artifactPath}`);
  console.log(`Wrote artifact checksum: ${checksumPath}`);
}

try {
  await packageNative();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
