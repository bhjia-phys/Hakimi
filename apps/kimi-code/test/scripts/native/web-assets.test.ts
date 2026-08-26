import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { assertWebAssets } from '../../../scripts/check-web-assets.mjs';
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

const TEST_COMMIT = '0123456789abcdef0123456789abcdef01234567';

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function recordTestProvenance(appRoot: string) {
  return recordWebProvenance({
    repository: 'code-app',
    commit: TEST_COMMIT,
    target: join(appRoot, 'dist-web'),
    output: join(appRoot, 'web-base.json'),
  });
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
      await expect(collectWebAssets({ appRoot, target: 'test-target' })).rejects.toThrow(
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
      await expect(collectWebAssets({ appRoot, target: 'test-target' })).rejects.toThrow(
        /Web 产物无效：boot\.js/,
      );

      writeFileSync(join(distWeb, 'boot.js'), 'console.log("boot");\n');
      writeFileSync(
        join(distWeb, 'index.html'),
        '<title>Hakimi Web</title>\n<<<<<<< HEAD\n<script src="/boot.js"></script>\n=======\n>>>>>>> branch\n',
      );
      await expect(collectWebAssets({ appRoot, target: 'test-target' })).rejects.toThrow(
        /未解决的 Git 冲突标记/,
      );

      writeFileSync(
        join(distWeb, 'index.html'),
        '<title>Hakimi Web</title><script src="/assets/missing-abc12345.js" data-src="/boot.js"></script>',
      );
      await expect(collectWebAssets({ appRoot, target: 'test-target' })).rejects.toThrow(
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
      await expect(collectWebAssets({ appRoot, target: 'test-target' })).rejects.toThrow(
        /本地入口必须使用以 \/ 开头的路径/,
      );

      writeFileSync(
        join(distWeb, 'index.html'),
        '<!-- <title>Hakimi Web</title> --><script src="/boot.js"></script>',
      );
      await expect(collectWebAssets({ appRoot, target: 'test-target' })).rejects.toThrow(
        /index\.html 未包含 Hakimi Web 标题/,
      );

      writeFileSync(
        join(distWeb, 'index.html'),
        '<title>Hakimi Web</title><script src="/boot.js"></script>',
      );
      writeFileSync(join(distWeb, 'boot.js'), 'console.log("Kimi Code");\n');
      await expect(collectWebAssets({ appRoot, target: 'test-target' })).rejects.toThrow(
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

      const { manifestJson } = await collectWebAssets({ appRoot, target: 'test-target' });

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
  it('requires explicit source identity and records a deterministic sorted manifest', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-provenance-record-'));
    const distWeb = writeMinimalBundle(appRoot);
    try {
      mkdirSync(join(distWeb, 'assets'), { recursive: true });
      writeFileSync(join(distWeb, 'assets', 'z.js'), 'console.log("z");\n');
      writeFileSync(join(distWeb, 'assets', 'a.js'), 'console.log("a");\n');

      expect(() => parseRecordWebProvenanceArgs([])).toThrow(
        /--repository and --commit are required/,
      );
      expect(() =>
        parseRecordWebProvenanceArgs([
          '--repository',
          'code-app',
          '--repository',
          'other',
          '--commit',
          TEST_COMMIT,
        ]),
      ).toThrow(/--repository may only be specified once/);
      await expect(
        recordWebProvenance({
          repository: 'other',
          commit: TEST_COMMIT,
          target: distWeb,
          output: join(appRoot, 'web-base.json'),
        }),
      ).rejects.toThrow(/repository 必须是 "code-app"/);
      await expect(
        recordWebProvenance({
          repository: 'code-app',
          commit: TEST_COMMIT.toUpperCase(),
          target: distWeb,
          output: join(appRoot, 'web-base.json'),
        }),
      ).rejects.toThrow(/40 位小写 Git SHA/);

      const first = await recordTestProvenance(appRoot);
      const firstText = readFileSync(join(appRoot, 'web-base.json'), 'utf8');
      const second = await recordTestProvenance(appRoot);
      const secondText = readFileSync(join(appRoot, 'web-base.json'), 'utf8');

      expect(second).toEqual(first);
      expect(secondText).toBe(firstText);
      expect(first).toMatchObject({
        repository: 'code-app',
        commit: TEST_COMMIT,
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
      await expect(
        assertWebAssets(distWeb, join(appRoot, 'web-base.json')),
      ).resolves.toHaveLength(4);
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('rejects missing or incomplete provenance and patch-version drift', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'kimi-web-provenance-schema-'));
    const distWeb = writeMinimalBundle(appRoot);
    const provenancePath = join(appRoot, 'web-base.json');
    try {
      await expect(assertWebAssets(distWeb, provenancePath)).rejects.toThrow(
        /Web provenance 缺失/,
      );

      writeTestProvenance(appRoot, {});
      await expect(assertWebAssets(distWeb, provenancePath)).rejects.toThrow(/repository/);

      await recordTestProvenance(appRoot);
      const invalidRepository = readTestProvenance(appRoot);
      invalidRepository.repository = 'other';
      writeTestProvenance(appRoot, invalidRepository);
      await expect(assertWebAssets(distWeb, provenancePath)).rejects.toThrow(
        /repository 必须是 "code-app"/,
      );

      await recordTestProvenance(appRoot);
      const invalidCommit = readTestProvenance(appRoot);
      invalidCommit.commit = TEST_COMMIT.toUpperCase();
      writeTestProvenance(appRoot, invalidCommit);
      await expect(assertWebAssets(distWeb, provenancePath)).rejects.toThrow(
        /40 位小写 Git SHA/,
      );

      await recordTestProvenance(appRoot);
      const stalePatch = readTestProvenance(appRoot);
      stalePatch.brandingPatchVersion = WEB_BRANDING_PATCH_VERSION + 1;
      writeTestProvenance(appRoot, stalePatch);
      await expect(assertWebAssets(distWeb, provenancePath)).rejects.toThrow(
        /brandingPatchVersion/,
      );

      await recordTestProvenance(appRoot);
      const missingFiles = readTestProvenance(appRoot);
      delete missingFiles.bundle.files;
      writeTestProvenance(appRoot, missingFiles);
      await expect(assertWebAssets(distWeb, provenancePath)).rejects.toThrow(
        /必须包含 files 清单/,
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
      await expect(assertWebAssets(distWeb, provenancePath)).rejects.toThrow(/必须按 path 排序/);

      await recordTestProvenance(appRoot);
      const malformedHash = readTestProvenance(appRoot);
      malformedHash.bundle.files[0].sha256 = 'invalid';
      writeTestProvenance(appRoot, malformedHash);
      await expect(assertWebAssets(distWeb, provenancePath)).rejects.toThrow(
        /sha256 必须是 64 位小写摘要/,
      );

      await recordTestProvenance(appRoot);
      const inconsistent = readTestProvenance(appRoot);
      inconsistent.bundle.files[0].sha256 = '0'.repeat(64);
      writeTestProvenance(appRoot, inconsistent);
      await expect(assertWebAssets(distWeb, provenancePath)).rejects.toThrow(
        /bundle\.sha256 与记录的文件清单不一致/,
      );

      inconsistent.bundle.sha256 = sha256(`${JSON.stringify(inconsistent.bundle.files)}\n`);
      writeTestProvenance(appRoot, inconsistent);
      await expect(assertWebAssets(distWeb, provenancePath)).rejects.toThrow(
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
      await expect(assertWebAssets(distWeb, provenancePath)).rejects.toThrow(
        /boot\.js 的 sha256 不匹配/,
      );

      writeFileSync(join(distWeb, 'boot.js'), 'console.log("boot");\n');
      writeFileSync(extraAsset, 'body {}\n');
      await expect(assertWebAssets(distWeb, provenancePath)).rejects.toThrow(
        /当前 bundle 有 3 个文件/,
      );

      await recordTestProvenance(appRoot);
      rmSync(extraAsset);
      await expect(assertWebAssets(distWeb, provenancePath)).rejects.toThrow(
        /当前 bundle 有 2 个文件/,
      );
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
