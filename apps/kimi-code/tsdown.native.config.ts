import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';

import { defineConfig } from 'tsdown';

import { rawTextPlugin } from '../../build/raw-text-plugin.mjs';
import { BUILT_IN_CATALOG_DEFINE, builtInCatalogDefine } from './scripts/built-in-catalog.mjs';
import { isValidSemver } from './scripts/native/release-tag.mjs';

const appRoot = import.meta.dirname;
const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string };

// Upstream Kimi Code baseline for the native SEA bundle. Read from
// `upstream-base.json` at build time (the SEA blob cannot read files next to
// the executable at runtime) and validated strictly here so a malformed file
// fails the build instead of surfacing a wrong version in /status.
const UPSTREAM_REPO_URL = 'https://github.com/MoonshotAI/kimi-code.git';
const upstreamBase = JSON.parse(
  readFileSync(new URL('./upstream-base.json', import.meta.url), 'utf-8'),
) as { repository: string; version: string; commit: string };

const upstreamKeys = Object.keys(upstreamBase).sort();
if (JSON.stringify(upstreamKeys) !== JSON.stringify(['commit', 'repository', 'version'])) {
  throw new Error(
    `Malformed upstream-base.json: expected exactly repository, version, commit; found ${upstreamKeys.join(', ')}`,
  );
}
if (upstreamBase.repository !== UPSTREAM_REPO_URL) {
  throw new Error(
    `Malformed upstream-base.json: repository must be ${UPSTREAM_REPO_URL}; found ${upstreamBase.repository}`,
  );
}
if (!isValidSemver(upstreamBase.version)) {
  throw new Error(`Malformed upstream-base.json: version is not strict semver: ${upstreamBase.version}`);
}
if (!/^[a-f0-9]{40}$/.test(upstreamBase.commit)) {
  throw new Error('Malformed upstream-base.json: commit must be a 40-char lowercase git sha');
}

const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
const optionalNativeDependencies = new Set(['cpu-features']);

function shouldAlwaysBundle(id: string): boolean {
  if (builtins.has(id) || id.startsWith('node:')) return false;
  if (optionalNativeDependencies.has(id)) return false;
  // Everything else is force-bundled, which covers `@moonshot-ai/*` (incl.
  // vis-server for `kimi vis`) plus its transitive `hono` / `@hono/node-server`
  // — so the SEA bundle is self-contained (check-bundle.mjs enforces this).
  return true;
}

function buildTarget(): string {
  return process.env['KIMI_CODE_BUILD_TARGET'] ?? `${process.platform}-${process.arch}`;
}

export default defineConfig({
  entry: ['./src/main.ts'],
  format: ['cjs'],
  outDir: 'dist-native/intermediates',
  clean: true,
  dts: false,
  fixedExtension: true,
  hash: false,
  platform: 'node',
  target: 'node24',
  banner: { js: '#!/usr/bin/env node' },
  plugins: [rawTextPlugin()],
  alias: {
    '@': resolve(appRoot, 'src'),
  },
  define: {
    [BUILT_IN_CATALOG_DEFINE]: builtInCatalogDefine(),
    __KIMI_CODE_VERSION__: JSON.stringify(packageJson.version),
    __KIMI_CODE_CHANNEL__: JSON.stringify(process.env['KIMI_CODE_CHANNEL'] ?? ''),
    __KIMI_CODE_COMMIT__: JSON.stringify(process.env['KIMI_CODE_COMMIT'] ?? ''),
    __KIMI_CODE_BUILD_TARGET__: JSON.stringify(buildTarget()),
    __KIMI_CODE_NATIVE_BUNDLE__: 'true',
    __KIMI_CODE_UPSTREAM_REPOSITORY__: JSON.stringify(upstreamBase.repository),
    __KIMI_CODE_UPSTREAM_VERSION__: JSON.stringify(upstreamBase.version),
    __KIMI_CODE_UPSTREAM_COMMIT__: JSON.stringify(upstreamBase.commit),
  },
  deps: {
    alwaysBundle: shouldAlwaysBundle,
    neverBundle: [...optionalNativeDependencies],
    onlyBundle: false,
  },
  outputOptions: {
    codeSplitting: false,
    entryFileNames: 'main.cjs',
  },
  checks: {
    legacyCjs: false,
  },
});
