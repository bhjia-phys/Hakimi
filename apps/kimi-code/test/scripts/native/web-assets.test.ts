import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertCanonicalBuildToolchain,
  buildWebAssets,
  CANONICAL_WEB_BUILD_ENV,
  createCanonicalBuildEnvironment,
  parseBuildWebAssetsArgs,
  replaceProductionAssets,
} from '../../../scripts/build-web-assets.mjs';
import {
  assertWebAssets,
  WEB_PROVENANCE_SCHEMA_VERSION,
} from '../../../scripts/check-web-assets.mjs';
import {
  collectWebAssets,
  webAssetManifestKey,
  WEB_ASSET_MANIFEST_VERSION,
} from '../../../scripts/native/web-assets.mjs';
import {
  patchWebBranding,
  WEB_BRANDING_PATCH_VERSION,
} from '../../../scripts/patch-web-branding.mjs';
import {
  parseRecordWebProvenanceArgs,
  recordWebProvenance,
} from '../../../scripts/record-web-provenance.mjs';

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeFixtureFileIfMissing(path: string, content: string): void {
  if (!existsSync(path)) writeFileSync(path, content);
}

function writeTestSource(repositoryRoot: string): void {
  const webRoot = join(repositoryRoot, 'apps', 'kimi-web');
  const scriptRoot = join(repositoryRoot, 'apps', 'kimi-code', 'scripts');
  mkdirSync(join(webRoot, 'public'), { recursive: true });
  mkdirSync(join(webRoot, 'src'), { recursive: true });
  mkdirSync(scriptRoot, { recursive: true });
  writeFixtureFileIfMissing(join(repositoryRoot, '.npmrc'), 'engine-strict=true\n');
  writeFixtureFileIfMissing(join(repositoryRoot, '.nvmrc'), '24.15.0\n');
  writeFixtureFileIfMissing(
    join(repositoryRoot, 'package.json'),
    '{"private":true,"engines":{"node":">=24.15.0"},"packageManager":"pnpm@10.33.0"}\n',
  );
  writeFixtureFileIfMissing(join(repositoryRoot, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
  writeFixtureFileIfMissing(
    join(repositoryRoot, 'pnpm-workspace.yaml'),
    "packages:\n  - 'apps/*'\n",
  );
  for (const script of [
    'build-web-assets.mjs',
    'check-web-assets.mjs',
    'patch-web-branding.mjs',
    'record-web-provenance.mjs',
  ]) {
    writeFixtureFileIfMissing(join(scriptRoot, script), `// ${script}\n`);
  }
  writeFixtureFileIfMissing(join(webRoot, 'index.html'), '<title>Hakimi Web</title>\n');
  writeFixtureFileIfMissing(join(webRoot, 'package.json'), '{"name":"fixture-web"}\n');
  writeFixtureFileIfMissing(join(webRoot, 'public', 'boot.js'), '/* fixture boot */\n');
  writeFixtureFileIfMissing(join(webRoot, 'src', 'main.ts'), 'export {};\n');
  writeFixtureFileIfMissing(join(webRoot, 'tsconfig.json'), '{}\n');
  writeFixtureFileIfMissing(join(webRoot, 'vite.config.ts'), 'export default {};\n');
}

function recordExistingTestProvenance(appRoot: string) {
  return recordWebProvenance({
    repositoryRoot: appRoot,
    target: join(appRoot, 'dist-web'),
    output: join(appRoot, 'web-base.json'),
  });
}

async function recordTestProvenance(appRoot: string) {
  writeTestSource(appRoot);
  return recordExistingTestProvenance(appRoot);
}

function readTestProvenance(appRoot: string) {
  return JSON.parse(readFileSync(join(appRoot, 'web-base.json'), 'utf8'));
}

function writeTestProvenance(appRoot: string, provenance: unknown): void {
  writeFileSync(join(appRoot, 'web-base.json'), `${JSON.stringify(provenance, null, 2)}\n`);
}

function writeMinimalBundle(appRoot: string): string {
  const distWeb = join(appRoot, 'dist-web');
  mkdirSync(distWeb, { recursive: true });
  writeFileSync(
    join(distWeb, 'index.html'),
    '<title>Hakimi Web</title><script src="/boot.js"></script>',
  );
  writeFileSync(join(distWeb, 'boot.js'), 'console.log("boot");\n');
  return distWeb;
}

describe('collectWebAssets', () => {
  it('validates and collects dist-web files into deterministic SEA asset keys', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-assets-build-'));
    const indexHtml =
      '<title>Hakimi Web</title><!-- Kimi Code compatibility; <title>Hakimi Web</title>' +
      '<script src="/assets/removed-abc12345.js"></script> -->' +
      '<script src="/boot.js" data-src="/assets/ignored-abc12345.js"></script>' +
      '<script src="/assets/app-abc12345.js"></script>\n';
    try {
      mkdirSync(join(appRoot, 'dist-web', 'assets'), { recursive: true });
      writeFileSync(join(appRoot, 'dist-web', 'index.html'), indexHtml);
      writeFileSync(join(appRoot, 'dist-web', 'boot.js'), 'console.log("boot");\n');
      writeFileSync(
        join(appRoot, 'dist-web', 'assets', 'app-abc12345.js'),
        'console.log("ok");\n',
      );
      await recordTestProvenance(appRoot);
      const staleSnapshotFile = join(
        appRoot,
        'dist-native',
        'intermediates',
        'web-assets',
        'test-target',
        'bundle',
        'stale.js',
      );
      mkdirSync(
        join(
          appRoot,
          'dist-native',
          'intermediates',
          'web-assets',
          'test-target',
          'bundle',
        ),
        { recursive: true },
      );
      writeFileSync(staleSnapshotFile, 'stale snapshot asset\n');

      const { manifest, manifestJson, assets } = await collectWebAssets({
        appRoot,
        target: 'test-target',
        repositoryRoot: appRoot,
      });

      expect(WEB_ASSET_MANIFEST_VERSION).toBe(1);
      expect(webAssetManifestKey('test-target')).toBe('web/test-target/manifest.json');
      expect(manifest).toEqual({
        version: WEB_ASSET_MANIFEST_VERSION,
        target: 'test-target',
        root: 'dist-web',
        files: [
          {
            assetKey: 'web/test-target/dist-web/assets/app-abc12345.js',
            relativePath: 'assets/app-abc12345.js',
            sha256: sha256('console.log("ok");\n'),
          },
          {
            assetKey: 'web/test-target/dist-web/boot.js',
            relativePath: 'boot.js',
            sha256: sha256('console.log("boot");\n'),
          },
          {
            assetKey: 'web/test-target/dist-web/index.html',
            relativePath: 'index.html',
            sha256: sha256(indexHtml),
          },
        ],
      });
      expect(JSON.parse(manifestJson) as unknown).toEqual(manifest);
      expect(existsSync(staleSnapshotFile)).toBe(false);
      const snapshotRoot = join(
        appRoot,
        'dist-native',
        'intermediates',
        'web-assets',
        'test-target',
        'bundle',
      );
      expect(assets).toEqual({
        'web/test-target/dist-web/assets/app-abc12345.js': join(
          snapshotRoot,
          'assets',
          'app-abc12345.js',
        ),
        'web/test-target/dist-web/boot.js': join(snapshotRoot, 'boot.js'),
        'web/test-target/dist-web/index.html': join(snapshotRoot, 'index.html'),
      });
      writeFileSync(
        join(appRoot, 'dist-web', 'assets', 'app-abc12345.js'),
        'console.log("changed after collection");\n',
      );
      expect(
        readFileSync(join(snapshotRoot, 'assets', 'app-abc12345.js'), 'utf8'),
      ).toBe('console.log("ok");\n');
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('fails clearly when a recorded dist-web bundle disappears', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-assets-missing-'));
    const distWeb = writeMinimalBundle(appRoot);
    try {
      await recordTestProvenance(appRoot);
      rmSync(distWeb, { recursive: true, force: true });
      await expect(collectWebAssets({ appRoot, target: 'test-target', repositoryRoot: appRoot })).rejects.toThrow(
        /Web 产物无效：index\.html/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('rejects a missing boot script or referenced entry asset', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-assets-incomplete-'));
    const distWeb = writeMinimalBundle(appRoot);
    try {
      await recordTestProvenance(appRoot);
      rmSync(join(distWeb, 'boot.js'));
      await expect(collectWebAssets({ appRoot, target: 'test-target', repositoryRoot: appRoot })).rejects.toThrow(
        /Web 产物无效：boot\.js/,
      );

      writeFileSync(join(distWeb, 'boot.js'), 'console.log("boot");\n');
      writeFileSync(
        join(distWeb, 'index.html'),
        '<title>Hakimi Web</title>\n<<<<<<< HEAD\n<script src="/boot.js"></script>\n=======\n>>>>>>> branch\n',
      );
      await expect(collectWebAssets({ appRoot, target: 'test-target', repositoryRoot: appRoot })).rejects.toThrow(
        /未解决的 Git 冲突标记/,
      );

      writeFileSync(
        join(distWeb, 'index.html'),
        '<title>Hakimi Web</title><script src="/assets/missing-abc12345.js" data-src="/boot.js"></script>',
      );
      await expect(collectWebAssets({ appRoot, target: 'test-target', repositoryRoot: appRoot })).rejects.toThrow(
        /index\.html 引用的 \/assets\/missing-abc12345\.js/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('rejects relative entry paths and unpatched brand strings', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-assets-invalid-'));
    const distWeb = writeMinimalBundle(appRoot);
    try {
      await recordTestProvenance(appRoot);
      writeFileSync(
        join(distWeb, 'index.html'),
        '<title>Hakimi Web</title><script src="./boot.js"></script>',
      );
      await expect(collectWebAssets({ appRoot, target: 'test-target', repositoryRoot: appRoot })).rejects.toThrow(
        /本地入口必须使用以 \/ 开头的路径/,
      );

      writeFileSync(
        join(distWeb, 'index.html'),
        '<!-- <title>Hakimi Web</title> --><script src="/boot.js"></script>',
      );
      await expect(collectWebAssets({ appRoot, target: 'test-target', repositoryRoot: appRoot })).rejects.toThrow(
        /index\.html 未包含 Hakimi Web 标题/,
      );

      writeFileSync(
        join(distWeb, 'index.html'),
        '<title>Hakimi Web</title><script src="/boot.js"></script>',
      );
      writeFileSync(join(distWeb, 'boot.js'), 'console.log("Kimi Code");\n');
      await expect(collectWebAssets({ appRoot, target: 'test-target', repositoryRoot: appRoot })).rejects.toThrow(
        /boot\.js 仍包含未修补的 Kimi Code/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('keeps manifest JSON parseable and stable', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-assets-json-'));
    const indexHtml = '<title>Hakimi Web</title>';
    try {
      mkdirSync(join(appRoot, 'dist-web'), { recursive: true });
      writeFileSync(join(appRoot, 'dist-web', 'index.html'), indexHtml);
      writeFileSync(join(appRoot, 'dist-web', 'boot.js'), 'console.log("boot");\n');
      await recordTestProvenance(appRoot);

      const { manifestJson } = await collectWebAssets({ appRoot, target: 'test-target', repositoryRoot: appRoot });

      expect(readFileSync(join(appRoot, 'dist-web', 'index.html'), 'utf-8')).toBe(indexHtml);
      expect(manifestJson.endsWith('\n')).toBe(true);
      expect(JSON.parse(manifestJson)).toMatchObject({
        version: WEB_ASSET_MANIFEST_VERSION,
        target: 'test-target',
        root: 'dist-web',
      });
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });
});

describe('web bundle provenance', () => {
  it('records automatic in-repository source identity and deterministic manifests', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-provenance-record-'));
    const distWeb = writeMinimalBundle(appRoot);
    try {
      mkdirSync(join(distWeb, 'assets'), { recursive: true });
      writeFileSync(join(distWeb, 'assets', 'z.js'), 'console.log("z");\n');
      writeFileSync(join(distWeb, 'assets', 'a.js'), 'console.log("a");\n');
      writeTestSource(appRoot);
      mkdirSync(join(appRoot, 'apps', 'kimi-web', 'public', 'tmp'), { recursive: true });
      writeFileSync(
        join(appRoot, 'apps', 'kimi-web', 'public', 'tmp', 'fixture.txt'),
        'nested source fixture\n',
      );

      expect(parseRecordWebProvenanceArgs([])).toMatchObject({
        target: expect.stringContaining('apps/kimi-code/dist-web'),
      });
      expect(() =>
        parseRecordWebProvenanceArgs(['--target', distWeb, '--target', distWeb]),
      ).toThrow(/--target may only be specified once/);
      expect(() => parseRecordWebProvenanceArgs(['--repository', 'code-app'])).toThrow(
        /Unknown option --repository/,
      );

      const first = await recordTestProvenance(appRoot);
      const firstText = readFileSync(join(appRoot, 'web-base.json'), 'utf8');
      const second = await recordTestProvenance(appRoot);
      const secondText = readFileSync(join(appRoot, 'web-base.json'), 'utf8');

      expect(second).toEqual(first);
      expect(secondText).toBe(firstText);
      expect(first).toMatchObject({
        schemaVersion: WEB_PROVENANCE_SCHEMA_VERSION,
        repository: 'hakimi',
        source: {
          path: 'apps/kimi-web',
          fileCount: 5,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
        recipe: {
          toolchainRequirements: { node: '>=24.15.0', pnpm: '10.33.0' },
          fileCount: 11,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
        brandingPatchVersion: WEB_BRANDING_PATCH_VERSION,
        bundle: {
          fileCount: 4,
          files: [
            { path: 'assets/a.js', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
            { path: 'assets/z.js', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
            { path: 'boot.js', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
            { path: 'index.html', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
          ],
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      });
      expect(first).not.toHaveProperty('baseRevision');
      expect(first.recipe).not.toHaveProperty('toolchain');
      expect(first.source.files.map((entry: { path: string }) => entry.path)).toContain(
        'apps/kimi-web/public/tmp/fixture.txt',
      );
      expect(first.recipe.files.map((entry: { path: string }) => entry.path)).toEqual([
        '.npmrc',
        '.nvmrc',
        'apps/kimi-code/scripts/build-web-assets.mjs',
        'apps/kimi-code/scripts/check-web-assets.mjs',
        'apps/kimi-code/scripts/patch-web-branding.mjs',
        'apps/kimi-code/scripts/record-web-provenance.mjs',
        'apps/kimi-web/package.json',
        'apps/kimi-web/vite.config.ts',
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
      ]);
      expect(first.source.files.map((entry: { path: string }) => entry.path)).toEqual(
        first.source.files
          .map((entry: { path: string }) => entry.path)
          .toSorted(),
      );
      await expect(
        assertWebAssets(distWeb, join(appRoot, 'web-base.json'), appRoot),
      ).resolves.toHaveLength(4);
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('rejects old, missing, or incomplete provenance and identity drift', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-provenance-schema-'));
    const distWeb = writeMinimalBundle(appRoot);
    const provenancePath = join(appRoot, 'web-base.json');
    try {
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /Web provenance 缺失/,
      );

      writeTestProvenance(appRoot, {
        schemaVersion: 3,
        repository: 'hakimi',
      });
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /schemaVersion 必须是 4/,
      );

      await recordTestProvenance(appRoot);
      const invalidRepository = readTestProvenance(appRoot);
      invalidRepository.repository = 'other';
      writeTestProvenance(appRoot, invalidRepository);
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /repository 必须是 "hakimi"/,
      );

      await recordTestProvenance(appRoot);
      const invalidSourceDigest = readTestProvenance(appRoot);
      invalidSourceDigest.source.sha256 = '0'.repeat(64);
      writeTestProvenance(appRoot, invalidSourceDigest);
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /source\.sha256 与记录的文件清单不一致/,
      );

      await recordTestProvenance(appRoot);
      const invalidRecipeDigest = readTestProvenance(appRoot);
      invalidRecipeDigest.recipe.sha256 = '0'.repeat(64);
      writeTestProvenance(appRoot, invalidRecipeDigest);
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /recipe\.sha256 与记录的文件清单不一致/,
      );

      await recordTestProvenance(appRoot);
      const stalePatch = readTestProvenance(appRoot);
      stalePatch.brandingPatchVersion = WEB_BRANDING_PATCH_VERSION + 1;
      writeTestProvenance(appRoot, stalePatch);
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /brandingPatchVersion/,
      );

      await recordTestProvenance(appRoot);
      const missingFiles = readTestProvenance(appRoot);
      delete missingFiles.bundle.files;
      writeTestProvenance(appRoot, missingFiles);
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /必须包含 files 清单/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('records every ordinary file below public and src, including nested tmp directories', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-source-drift-'));
    const distWeb = writeMinimalBundle(appRoot);
    const provenancePath = join(appRoot, 'web-base.json');
    const sourceRoot = join(appRoot, 'apps', 'kimi-web');
    const nestedFixture = join(sourceRoot, 'public', 'tmp', 'fixture.txt');
    try {
      await recordTestProvenance(appRoot);
      writeFileSync(join(sourceRoot, 'src', 'main.ts'), 'export const changed = true;\n');
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /Web source 已漂移：apps\/kimi-web\/src\/main\.ts 的 sha256 不匹配/,
      );

      writeFileSync(join(sourceRoot, 'src', 'main.ts'), 'export {};\n');
      for (const outsideAnchor of ['dist', 'node_modules']) {
        mkdirSync(join(sourceRoot, outsideAnchor), { recursive: true });
        writeFileSync(join(sourceRoot, outsideAnchor, 'ignored.js'), 'ignored\n');
      }
      await expect(
        assertWebAssets(distWeb, provenancePath, appRoot),
      ).resolves.toHaveLength(2);

      mkdirSync(join(sourceRoot, 'public', 'tmp'), { recursive: true });
      writeFileSync(nestedFixture, 'nested source fixture\n');
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /Web source 已漂移：记录 4 个文件，当前 source 有 5 个文件/,
      );

      const updated = await recordTestProvenance(appRoot);
      expect(updated.source.files.map((entry: { path: string }) => entry.path)).toContain(
        'apps/kimi-web/public/tmp/fixture.txt',
      );
      writeFileSync(nestedFixture, 'changed nested source fixture\n');
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /Web source 已漂移：apps\/kimi-web\/public\/tmp\/fixture\.txt 的 sha256 不匹配/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')('rejects a source file symbolic link', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-source-file-symlink-'));
    try {
      writeMinimalBundle(appRoot);
      writeTestSource(appRoot);
      symlinkSync(
        'main.ts',
        join(appRoot, 'apps', 'kimi-web', 'src', 'linked-main.ts'),
        'file',
      );

      await expect(recordTestProvenance(appRoot)).rejects.toThrow(
        /apps\/kimi-web\/src\/linked-main\.ts 是 symbolic link/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')('rejects a source directory symbolic link', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-source-directory-symlink-'));
    try {
      writeMinimalBundle(appRoot);
      writeTestSource(appRoot);
      symlinkSync(
        '../src',
        join(appRoot, 'apps', 'kimi-web', 'public', 'linked-src'),
        'dir',
      );

      await expect(recordTestProvenance(appRoot)).rejects.toThrow(
        /apps\/kimi-web\/public\/linked-src 是 symbolic link/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')('rejects a source symbolic link outside the source tree', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-source-outside-symlink-'));
    try {
      writeMinimalBundle(appRoot);
      writeTestSource(appRoot);
      const outsideFile = join(appRoot, 'outside.ts');
      writeFileSync(outsideFile, 'export const outside = true;\n');
      symlinkSync(
        outsideFile,
        join(appRoot, 'apps', 'kimi-web', 'src', 'outside.ts'),
        'file',
      );

      await expect(recordTestProvenance(appRoot)).rejects.toThrow(
        /apps\/kimi-web\/src\/outside\.ts 是 symbolic link/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')('rejects a symbolic src source root', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-src-root-symlink-'));
    try {
      writeMinimalBundle(appRoot);
      writeTestSource(appRoot);
      const sourceRoot = join(appRoot, 'apps', 'kimi-web', 'src');
      const linkedRoot = join(appRoot, 'linked-src-root');
      mkdirSync(linkedRoot);
      writeFileSync(join(linkedRoot, 'main.ts'), 'export {};\n');
      rmSync(sourceRoot, { recursive: true });
      symlinkSync(linkedRoot, sourceRoot, 'dir');

      await expect(recordExistingTestProvenance(appRoot)).rejects.toThrow(
        /必需的构建输入目录 apps\/kimi-web\/src 是 symbolic link/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')('rejects a symbolic public source root', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-public-root-symlink-'));
    try {
      writeMinimalBundle(appRoot);
      writeTestSource(appRoot);
      const sourceRoot = join(appRoot, 'apps', 'kimi-web', 'public');
      const linkedRoot = join(appRoot, 'linked-public-root');
      mkdirSync(linkedRoot);
      writeFileSync(join(linkedRoot, 'boot.js'), '/* fixture boot */\n');
      rmSync(sourceRoot, { recursive: true });
      symlinkSync(linkedRoot, sourceRoot, 'dir');

      await expect(recordExistingTestProvenance(appRoot)).rejects.toThrow(
        /必需的构建输入目录 apps\/kimi-web\/public 是 symbolic link/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')('rejects a symbolic required index.html', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-index-symlink-'));
    try {
      writeMinimalBundle(appRoot);
      writeTestSource(appRoot);
      const sourceFile = join(appRoot, 'apps', 'kimi-web', 'index.html');
      const linkedFile = join(appRoot, 'linked-index.html');
      writeFileSync(linkedFile, '<title>Hakimi Web</title>\n');
      rmSync(sourceFile);
      symlinkSync(linkedFile, sourceFile, 'file');

      await expect(recordExistingTestProvenance(appRoot)).rejects.toThrow(
        /必需文件 apps\/kimi-web\/index\.html 是 symbolic link/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')('rejects a symbolic required tsconfig.json', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-tsconfig-symlink-'));
    try {
      writeMinimalBundle(appRoot);
      writeTestSource(appRoot);
      const sourceFile = join(appRoot, 'apps', 'kimi-web', 'tsconfig.json');
      const linkedFile = join(appRoot, 'linked-tsconfig.json');
      writeFileSync(linkedFile, '{}\n');
      rmSync(sourceFile);
      symlinkSync(linkedFile, sourceFile, 'file');

      await expect(recordExistingTestProvenance(appRoot)).rejects.toThrow(
        /必需文件 apps\/kimi-web\/tsconfig\.json 是 symbolic link/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('detects recipe and toolchain requirement drift', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-recipe-drift-'));
    const distWeb = writeMinimalBundle(appRoot);
    const provenancePath = join(appRoot, 'web-base.json');
    const rootPackagePath = join(appRoot, 'package.json');
    const rootPackage =
      '{"private":true,"engines":{"node":">=24.15.0"},"packageManager":"pnpm@10.33.0"}\n';
    try {
      await recordTestProvenance(appRoot);
      writeFileSync(
        rootPackagePath,
        '{"private":true,"engines":{"node":">=24.16.0"},"packageManager":"pnpm@10.33.0"}\n',
      );
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /Web recipe 已漂移：toolchain requirements 不匹配/,
      );

      writeFileSync(rootPackagePath, rootPackage);
      writeFileSync(join(appRoot, '.nvmrc'), '24.16.0\n');
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /Web recipe 已漂移：\.nvmrc 的 sha256 不匹配/,
      );

      writeFileSync(join(appRoot, '.nvmrc'), '24.15.0\n');
      writeFileSync(
        join(appRoot, 'apps', 'kimi-code', 'scripts', 'build-web-assets.mjs'),
        '// changed recipe\n',
      );
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /Web recipe 已漂移：apps\/kimi-code\/scripts\/build-web-assets\.mjs 的 sha256 不匹配/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('rejects reordered, malformed, or internally inconsistent file manifests', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-provenance-manifest-'));
    const distWeb = writeMinimalBundle(appRoot);
    const provenancePath = join(appRoot, 'web-base.json');
    try {
      await recordTestProvenance(appRoot);
      const reordered = readTestProvenance(appRoot);
      reordered.bundle.files.reverse();
      writeTestProvenance(appRoot, reordered);
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(/必须按 path 排序/);

      await recordTestProvenance(appRoot);
      const malformedHash = readTestProvenance(appRoot);
      malformedHash.bundle.files[0].sha256 = 'invalid';
      writeTestProvenance(appRoot, malformedHash);
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /sha256 必须是 64 位小写摘要/,
      );

      await recordTestProvenance(appRoot);
      const inconsistent = readTestProvenance(appRoot);
      inconsistent.bundle.files[0].sha256 = '0'.repeat(64);
      writeTestProvenance(appRoot, inconsistent);
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /bundle\.sha256 与记录的文件清单不一致/,
      );

      inconsistent.bundle.sha256 = sha256(`${JSON.stringify(inconsistent.bundle.files)}\n`);
      writeTestProvenance(appRoot, inconsistent);
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /sha256 不匹配/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('rejects bundle byte changes and file additions or removals', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-provenance-drift-'));
    const distWeb = writeMinimalBundle(appRoot);
    const provenancePath = join(appRoot, 'web-base.json');
    const extraAsset = join(distWeb, 'extra.css');
    try {
      await recordTestProvenance(appRoot);
      writeFileSync(join(distWeb, 'boot.js'), 'console.log("changed");\n');
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /boot\.js 的 sha256 不匹配/,
      );

      writeFileSync(join(distWeb, 'boot.js'), 'console.log("boot");\n');
      writeFileSync(extraAsset, 'body {}\n');
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /当前 bundle 有 3 个文件/,
      );

      await recordTestProvenance(appRoot);
      rmSync(extraAsset);
      await expect(assertWebAssets(distWeb, provenancePath, appRoot)).rejects.toThrow(
        /当前 bundle 有 2 个文件/,
      );
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });
});

describe('buildWebAssets', () => {
  function fakeBuild(content = 'const brand = "Kimi Code";\n') {
    return async ({ stagingRoot }: { stagingRoot: string }): Promise<void> => {
      mkdirSync(join(stagingRoot, 'assets'), { recursive: true });
      writeFileSync(
        join(stagingRoot, 'index.html'),
        '<title>Hakimi Web</title><script src="/boot.js"></script><script src="/assets/app.js"></script>',
      );
      writeFileSync(join(stagingRoot, 'boot.js'), 'console.log("boot");\n');
      writeFileSync(join(stagingRoot, 'assets', 'app.js'), content);
    };
  }

  it('constructs an allowlisted canonical environment from polluted ambient values', () => {
    const fixturePath = join(tmpdir(), 'fixture-bin');
    const fixtureRepository = join(tmpdir(), 'fixture-repo');
    const fixtureStaging = join(tmpdir(), 'fixture-staging');
    const env = createCanonicalBuildEnvironment(
      {
        PATH: fixturePath,
        HOME: '/poisoned/home',
        NODE_OPTIONS: '--require poisoned.js',
        VITE_POISONED: 'leak',
        VITE_KIMI_SERVER_HTTP_URL: 'https://evil.example',
        KIMI_WEB_DESKTOP: '1',
        KIMI_BACKEND_DEFAULT_URL: 'https://evil.example',
      },
      { repositoryRoot: fixtureRepository, stagingRoot: fixtureStaging },
    );

    expect(env['PATH']).toBe(fixturePath);
    expect(env).not.toHaveProperty('HOME');
    expect(env).not.toHaveProperty('NODE_OPTIONS');
    expect(env).not.toHaveProperty('VITE_POISONED');
    expect(env).toMatchObject({
      ...CANONICAL_WEB_BUILD_ENV,
      KIMI_WEB_BUILD_OUT_DIR: fixtureStaging,
      NPM_CONFIG_USERCONFIG: join(fixtureRepository, '.npmrc'),
    });
    expect(Object.keys(env).filter((key) => key.startsWith('VITE_'))).toEqual([
      'VITE_KIMI_SERVER_HTTP_URL',
    ]);
  });

  it('requires the minimum Node version and exact pnpm version from PATH', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-toolchain-preflight-'));
    const environment = { PATH: join(tmpdir(), 'fixture-bin') };
    let pnpmChecks = 0;
    try {
      writeTestSource(appRoot);
      await expect(
        assertCanonicalBuildToolchain({
          repositoryRoot: appRoot,
          environment,
          nodeVersion: '24.14.9',
          getPnpmVersion: async () => {
            pnpmChecks += 1;
            return '10.33.0';
          },
        }),
      ).rejects.toThrow(/requires Node >=24\.15\.0; current process is 24\.14\.9/);
      expect(pnpmChecks).toBe(0);

      await expect(
        assertCanonicalBuildToolchain({
          repositoryRoot: appRoot,
          environment,
          nodeVersion: '24.16.0',
          getPnpmVersion: async () => '10.32.0',
        }),
      ).rejects.toThrow(/requires pnpm 10\.33\.0; PATH resolves pnpm 10\.32\.0/);

      await expect(
        assertCanonicalBuildToolchain({
          repositoryRoot: appRoot,
          environment,
          nodeVersion: '25.0.0',
          getPnpmVersion: async () => '10.33.0',
        }),
      ).resolves.toEqual({
        requirements: { node: '>=24.15.0', pnpm: '10.33.0' },
        actual: { node: '25.0.0', pnpm: '10.33.0' },
      });
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('restricts the toolchain mismatch bypass to an explicit Nix build', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-nix-toolchain-bypass-'));
    let toolchainChecks = 0;
    const checkToolchain = async () => {
      toolchainChecks += 1;
    };
    try {
      writeTestSource(appRoot);
      await expect(
        buildWebAssets({
          allowNixToolchainMismatch: true,
          ambientEnvironment: {},
          appRoot,
          repositoryRoot: appRoot,
          checkToolchain,
          build: fakeBuild(),
        }),
      ).rejects.toThrow(/restricted to the Nix build; KIMI_WEB_NIX_BUILD=1 is required/);

      await expect(
        buildWebAssets({
          allowNixToolchainMismatch: true,
          ambientEnvironment: { KIMI_WEB_NIX_BUILD: '1' },
          appRoot,
          repositoryRoot: appRoot,
          checkToolchain,
          build: fakeBuild(),
        }),
      ).resolves.toMatchObject({ check: false, patched: 1 });
      expect(toolchainChecks).toBe(0);
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('generates clean-source package assets and checks every generated file', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-build-assets-'));
    const distWeb = join(appRoot, 'dist-web');
    let toolchainChecks = 0;
    const checkToolchain = async () => {
      toolchainChecks += 1;
    };
    try {
      writeTestSource(appRoot);
      expect(existsSync(distWeb)).toBe(false);
      expect(existsSync(join(appRoot, 'web-base.json'))).toBe(false);

      expect(parseBuildWebAssetsArgs([])).toEqual({
        check: false,
        allowNixToolchainMismatch: false,
      });
      expect(parseBuildWebAssetsArgs(['--check'])).toEqual({
        check: true,
        allowNixToolchainMismatch: false,
      });
      expect(
        parseBuildWebAssetsArgs([
          '--',
          '--check',
          '--allow-nix-toolchain-mismatch',
        ]),
      ).toEqual({ check: true, allowNixToolchainMismatch: true });
      expect(() => parseBuildWebAssetsArgs(['--check', '--check'])).toThrow(
        /--check may only be specified once/,
      );
      expect(() =>
        parseBuildWebAssetsArgs([
          '--allow-nix-toolchain-mismatch',
          '--allow-nix-toolchain-mismatch',
        ]),
      ).toThrow(/--allow-nix-toolchain-mismatch may only be specified once/);
      expect(() => parseBuildWebAssetsArgs(['--unknown'])).toThrow(/Unknown option/);

      const built = await buildWebAssets({
        appRoot,
        repositoryRoot: appRoot,
        checkToolchain,
        build: fakeBuild(),
      });
      expect(built.check).toBe(false);
      expect(built.patched).toBe(1);
      expect(readFileSync(join(distWeb, 'assets', 'app.js'), 'utf8')).toBe(
        'const brand = "Hakimi";\n',
      );
      const generatedProvenance = readFileSync(join(appRoot, 'web-base.json'), 'utf8');
      expect(JSON.parse(generatedProvenance)).toMatchObject({
        schemaVersion: WEB_PROVENANCE_SCHEMA_VERSION,
        repository: 'hakimi',
      });

      await expect(
        buildWebAssets({
          check: true,
          appRoot,
          repositoryRoot: appRoot,
          checkToolchain,
          build: fakeBuild(),
        }),
      ).resolves.toMatchObject({ check: true, patched: 1 });
      expect(readFileSync(join(appRoot, 'web-base.json'), 'utf8')).toBe(
        generatedProvenance,
      );

      await expect(
        buildWebAssets({
          check: true,
          appRoot,
          repositoryRoot: appRoot,
          checkToolchain,
          build: fakeBuild('const changed = true;\n'),
        }),
      ).rejects.toThrow(/assets\/app\.js: content differs/);
      expect(readFileSync(join(distWeb, 'assets', 'app.js'), 'utf8')).toBe(
        'const brand = "Hakimi";\n',
      );
      expect(toolchainChecks).toBe(3);
      expect(
        readdirSync(appRoot).filter((name) => name.startsWith('.dist-web-staging-')),
      ).toEqual([]);
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('rolls the production directory back when provenance installation fails', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-build-assets-rollback-'));
    try {
      writeTestSource(appRoot);
      const distWeb = writeMinimalBundle(appRoot);
      const originalBoot = readFileSync(join(distWeb, 'boot.js'), 'utf8');
      mkdirSync(join(appRoot, 'web-base.json'));

      await expect(
        buildWebAssets({
          appRoot,
          repositoryRoot: appRoot,
          build: fakeBuild('const replacement = true;\n'),
        }),
      ).rejects.toThrow();

      expect(readFileSync(join(distWeb, 'boot.js'), 'utf8')).toBe(originalBoot);
      expect(existsSync(join(distWeb, 'assets', 'app.js'))).toBe(false);
      expect(
        readdirSync(appRoot).filter(
          (name) =>
            name.startsWith('.dist-web-staging-') || name.startsWith('.dist-web-backup-'),
        ),
      ).toEqual([]);
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('keeps the completed cutover when backup cleanup fails', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-build-assets-cleanup-'));
    const target = writeMinimalBundle(appRoot);
    const stagingRoot = join(appRoot, '.dist-web-staging-test');
    const provenancePath = join(appRoot, 'web-base.json');
    const warnings: string[] = [];
    try {
      mkdirSync(join(stagingRoot, 'assets'), { recursive: true });
      writeFileSync(
        join(stagingRoot, 'index.html'),
        '<title>Hakimi Web</title><script src="/boot.js"></script>',
      );
      writeFileSync(join(stagingRoot, 'boot.js'), 'new boot\n');
      writeFileSync(join(stagingRoot, 'assets', 'app.js'), 'new app\n');
      writeFileSync(provenancePath, 'old provenance\n');

      const result = await replaceProductionAssets(
        {
          stagingRoot,
          target,
          provenancePath,
          provenanceText: 'new provenance\n',
        },
        {
          removePath: async (path, options) => {
            if (String(path).includes('.dist-web-backup-')) {
              throw new Error('injected backup cleanup failure');
            }
            await rm(path, options);
          },
          warn: (message: string) => warnings.push(message),
        },
      );

      expect(result).toEqual({ installed: true });
      expect(readFileSync(join(target, 'boot.js'), 'utf8')).toBe('new boot\n');
      expect(readFileSync(join(target, 'assets', 'app.js'), 'utf8')).toBe('new app\n');
      expect(readFileSync(provenancePath, 'utf8')).toBe('new provenance\n');
      expect(warnings).toEqual([
        expect.stringMatching(/Web cutover completed; backup cleanup failed/),
      ]);
      expect(
        readdirSync(appRoot).some((name) => name.startsWith('.dist-web-backup-')),
      ).toBe(true);
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });
});

describe('patchWebBranding', () => {
  it('patches root and nested JavaScript idempotently', () => {
    const distWeb = mkdtempSync(join(tmpdir(), 'kimi-web-branding-'));
    const nestedDir = join(distWeb, 'assets', 'nested');
    try {
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(join(distWeb, 'index.html'), '<title>Kimi Code Web</title>');
      writeFileSync(
        join(distWeb, 'boot.js'),
        'document.title = "Kimi Code Web"; const label = "Kimi Code";\n',
      );
      writeFileSync(join(nestedDir, 'chunk.js'), 'const brand = "Kimi Code";\n');

      expect(patchWebBranding(distWeb)).toBe(4);
      expect(readFileSync(join(distWeb, 'index.html'), 'utf8')).toBe(
        '<title>Hakimi Web</title>',
      );
      expect(readFileSync(join(distWeb, 'boot.js'), 'utf8')).toBe(
        'document.title = "Hakimi Web"; const label = "Hakimi";\n',
      );
      expect(readFileSync(join(nestedDir, 'chunk.js'), 'utf8')).toBe(
        'const brand = "Hakimi";\n',
      );
      expect(patchWebBranding(distWeb)).toBe(0);
    } finally {
      rmSync(distWeb, { recursive: true, force: true });
    }
  });
});
