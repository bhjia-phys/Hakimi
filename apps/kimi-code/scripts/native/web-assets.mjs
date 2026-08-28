import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import {
  verifyWebAssets,
  verifyWebAssetsAgainstProvenance,
} from '../check-web-assets.mjs';
import {
  WEB_ASSET_MANIFEST_VERSION,
  buildWebAssetKey,
  buildWebManifestKey,
} from './manifest.mjs';
import { assertSafeNativeTarget } from './paths.mjs';

export { WEB_ASSET_MANIFEST_VERSION };

const WEB_ASSETS_DIR = 'dist-web';

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toPosixPath(path) {
  return path.split('\\').join('/');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function listFiles(root) {
  const files = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (entry.isFile()) {
        files.push(path);
      }
    }
  }

  await walk(root);
  return files;
}

async function assertBuiltAssetRoot({ assetRoot, requiredFile, message }) {
  const requiredPath = join(assetRoot, requiredFile);
  try {
    const info = await stat(requiredPath);
    if (!info.isFile()) {
      throw new Error(`${requiredFile} is not a file`);
    }
  } catch {
    throw new Error(message);
  }
}

export function webAssetManifestKey(target) {
  return buildWebManifestKey(target);
}

export function webAssetKey(target, relativePath) {
  return buildWebAssetKey(target, relativePath);
}

async function collectAssetRoot({
  assetRoot,
  files,
  target,
  root,
  requiredFile,
  missingMessage,
  assetKey,
}) {
  await assertBuiltAssetRoot({ assetRoot, requiredFile, message: missingMessage });

  const collectedFiles = files ?? (await listFiles(assetRoot));
  collectedFiles.sort((left, right) =>
    compareStrings(toPosixPath(relative(assetRoot, left)), toPosixPath(relative(assetRoot, right))),
  );
  const manifestFiles = [];
  const assets = {};

  for (const file of collectedFiles) {
    const bytes = await readFile(file);
    const relativePath = toPosixPath(relative(assetRoot, file));
    const key = assetKey(target, relativePath);
    manifestFiles.push({
      assetKey: key,
      relativePath,
      sha256: sha256(bytes),
    });
    assets[key] = file;
  }

  const manifest = {
    version: WEB_ASSET_MANIFEST_VERSION,
    target,
    root,
    files: manifestFiles,
  };

  return {
    manifest,
    manifestJson: `${JSON.stringify(manifest, null, 2)}\n`,
    assets,
  };
}

async function snapshotVerifiedBundle({ appRoot, target, sourceRoot, verifiedSource }) {
  assertSafeNativeTarget(target);
  const snapshotRoot = resolve(
    appRoot,
    'dist-native',
    'intermediates',
    'web-assets',
    target,
    'bundle',
  );
  const snapshotParent = dirname(snapshotRoot);
  const stagingRoot = resolve(snapshotParent, `.bundle-${process.pid}-${randomUUID()}`);
  await mkdir(snapshotParent, { recursive: true });

  try {
    for (const sourceFile of verifiedSource.files) {
      const relativePath = relative(sourceRoot, sourceFile);
      const destination = resolve(stagingRoot, relativePath);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(sourceFile, destination);
    }
    const verifiedSnapshot = await verifyWebAssetsAgainstProvenance(
      stagingRoot,
      verifiedSource.provenance,
      { verifySource: false, verifyRecipe: false },
    );
    await rm(snapshotRoot, { recursive: true, force: true });
    await rename(stagingRoot, snapshotRoot);
    return {
      snapshotRoot,
      provenance: verifiedSnapshot.provenance,
      files: verifiedSnapshot.provenance.bundle.files.map((entry) =>
        resolve(snapshotRoot, ...entry.path.split('/')),
      ),
    };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

export async function collectWebAssets({
  appRoot,
  target,
  repositoryRoot = resolve(appRoot, '../..'),
}) {
  const sourceRoot = resolve(appRoot, WEB_ASSETS_DIR);
  const verifiedSource = await verifyWebAssets(
    sourceRoot,
    resolve(appRoot, 'web-base.json'),
    repositoryRoot,
  );
  const snapshot = await snapshotVerifiedBundle({
    appRoot,
    target,
    sourceRoot,
    verifiedSource,
  });
  const collected = await collectAssetRoot({
    assetRoot: snapshot.snapshotRoot,
    files: snapshot.files,
    target,
    root: WEB_ASSETS_DIR,
    requiredFile: 'index.html',
    missingMessage: `Verified Hakimi web snapshot disappeared before native SEA collection: ${snapshot.snapshotRoot}`,
    assetKey: webAssetKey,
  });
  return { ...collected, provenance: snapshot.provenance };
}
