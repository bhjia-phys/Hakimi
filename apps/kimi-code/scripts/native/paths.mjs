import { resolve } from 'node:path';

export const appRoot = resolve(import.meta.dirname, '..', '..');

const WINDOWS_RESERVED_TARGET = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function assertSafeNativeTarget(target) {
  if (
    typeof target !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(target) ||
    WINDOWS_RESERVED_TARGET.test(target)
  ) {
    throw new Error(`Invalid native build target: ${JSON.stringify(target)}`);
  }
  return target;
}

export function targetTriple({ platform = process.platform, arch = process.arch, env = process.env } = {}) {
  return assertSafeNativeTarget(env.KIMI_CODE_BUILD_TARGET ?? `${platform}-${arch}`);
}

export function executableName(platform = process.platform) {
  return platform === 'win32' ? 'hakimi.exe' : 'hakimi';
}

export function nativeDistRoot() {
  return resolve(appRoot, 'dist-native');
}

export function nativeIntermediatesDir() {
  return resolve(nativeDistRoot(), 'intermediates');
}

export function nativeBinDir(target = targetTriple()) {
  return resolve(nativeDistRoot(), 'bin', assertSafeNativeTarget(target));
}

export function nativeBinPath(target = targetTriple(), platform = process.platform) {
  return resolve(nativeBinDir(target), executableName(platform));
}

export function nativeJsBundlePath() {
  return resolve(nativeIntermediatesDir(), 'main.cjs');
}

export function nativeBlobPath() {
  return resolve(nativeIntermediatesDir(), 'hakimi.blob');
}

export function nativeSeaConfigPath() {
  return resolve(nativeIntermediatesDir(), 'sea-config.json');
}

export function nativeManifestDir(target = targetTriple()) {
  return resolve(nativeIntermediatesDir(), 'native-assets', assertSafeNativeTarget(target));
}

export function nativeWebAssetsDir(target = targetTriple()) {
  return resolve(nativeIntermediatesDir(), 'web-assets', assertSafeNativeTarget(target));
}

export function nativeWebSnapshotDir(target = targetTriple()) {
  return resolve(nativeWebAssetsDir(target), 'bundle');
}

export function nativeBuildReceiptPath(target = targetTriple()) {
  return resolve(nativeWebAssetsDir(target), 'build-receipt.json');
}

export function nativeArtifactsDir() {
  return resolve(nativeDistRoot(), 'artifacts');
}

export function nativeSmokeHome() {
  return resolve(nativeDistRoot(), 'smoke-home');
}

export function nativeManifestKey(target = targetTriple()) {
  return `native/${assertSafeNativeTarget(target)}/manifest.json`;
}

export const SEA_SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
