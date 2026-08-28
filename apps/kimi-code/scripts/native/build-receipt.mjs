import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { WEB_SOURCE_REPOSITORY } from '../check-web-assets.mjs';
import {
  nativeBinPath,
  nativeBuildReceiptPath,
  assertSafeNativeTarget,
} from './paths.mjs';

export const NATIVE_BUILD_RECEIPT_VERSION = 3;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function sha256File(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

function webIdentity(provenance) {
  return {
    repository: provenance.repository,
    sourceSha256: provenance.source.sha256,
    recipeSha256: provenance.recipe.sha256,
    bundleSha256: provenance.bundle.sha256,
    brandingPatchVersion: provenance.brandingPatchVersion,
  };
}

function validateReceipt(value, expectedTarget) {
  if (!isRecord(value) || value.version !== NATIVE_BUILD_RECEIPT_VERSION) {
    throw new Error(
      `Native build receipt must use version ${NATIVE_BUILD_RECEIPT_VERSION}.`,
    );
  }
  if (value.target !== expectedTarget) {
    throw new Error(
      `Native build receipt target mismatch: expected ${expectedTarget}, found ${JSON.stringify(value.target)}.`,
    );
  }
  if (
    !isRecord(value.web) ||
    value.web.repository !== WEB_SOURCE_REPOSITORY ||
    typeof value.web.sourceSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.web.sourceSha256) ||
    typeof value.web.recipeSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.web.recipeSha256) ||
    typeof value.web.bundleSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.web.bundleSha256) ||
    !Number.isSafeInteger(value.web.brandingPatchVersion) ||
    value.web.brandingPatchVersion < 1
  ) {
    throw new Error('Native build receipt contains invalid Web identity fields.');
  }
  if (
    !isRecord(value.binary) ||
    typeof value.binary.sha256 !== 'string' ||
    !SHA256_PATTERN.test(value.binary.sha256)
  ) {
    throw new Error('Native build receipt contains an invalid binary sha256.');
  }
  return {
    version: value.version,
    target: value.target,
    web: {
      repository: value.web.repository,
      sourceSha256: value.web.sourceSha256,
      recipeSha256: value.web.recipeSha256,
      bundleSha256: value.web.bundleSha256,
      brandingPatchVersion: value.web.brandingPatchVersion,
    },
    binary: { sha256: value.binary.sha256 },
  };
}

export async function removeNativeBuildReceipt(target) {
  await rm(nativeBuildReceiptPath(assertSafeNativeTarget(target)), { force: true });
}

export async function writeNativeBuildReceipt({
  target,
  provenance,
  binaryPath = nativeBinPath(target),
}) {
  assertSafeNativeTarget(target);
  const receiptPath = nativeBuildReceiptPath(target);
  const receipt = {
    version: NATIVE_BUILD_RECEIPT_VERSION,
    target,
    web: webIdentity(provenance),
    binary: { sha256: await sha256File(binaryPath) },
  };
  validateReceipt(receipt, target);

  await mkdir(dirname(receiptPath), { recursive: true });
  const temporaryPath = `${receiptPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryPath, receiptPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return receipt;
}

export async function readNativeBuildReceipt(target) {
  assertSafeNativeTarget(target);
  const receiptPath = nativeBuildReceiptPath(target);
  let text;
  try {
    text = await readFile(receiptPath, 'utf8');
  } catch {
    throw new Error(
      `Native build receipt not found at ${receiptPath}. Run build:native:sea before packaging.`,
    );
  }
  try {
    return validateReceipt(JSON.parse(text), target);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Native build receipt is not valid JSON: ${receiptPath}.`);
    }
    throw error;
  }
}

export async function assertNativeBuildReceipt({ target, provenance, binaryPath }) {
  const receipt = await readNativeBuildReceipt(target);
  const expectedWeb = webIdentity(provenance);
  if (JSON.stringify(receipt.web) !== JSON.stringify(expectedWeb)) {
    throw new Error(
      'Native build receipt Web identity does not match the current verified Web bundle. Rebuild the native executable.',
    );
  }
  const binarySha256 = await sha256File(binaryPath);
  if (binarySha256 !== receipt.binary.sha256) {
    throw new Error(
      'Native build receipt binary sha256 does not match the executable being packaged. Rebuild the native executable.',
    );
  }
  return receipt;
}
