import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, '..');
const packagePath = resolve(packageRoot, 'package.json');
const expectedPublishExports = {
  '.': {
    types: './dist/index.d.mts',
    import: './dist/index.mjs',
    default: './dist/index.mjs',
  },
} as const;

type PackageJson = {
  readonly name: string;
  readonly private?: boolean;
  readonly author: string;
  readonly homepage: string;
  readonly repository: { readonly url: string };
  readonly bugs: { readonly url: string };
  readonly files: readonly string[];
  readonly publishConfig: {
    readonly access: string;
    readonly provenance: boolean;
    readonly exports: typeof expectedPublishExports;
  };
};

async function run(command: string, args: readonly string[], cwd: string) {
  try {
    return await execFileAsync(command, args, { cwd });
  } catch (error) {
    const result = error as { readonly stdout?: string; readonly stderr?: string };
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(
      `${command} ${args.join(' ')} failed${output === '' ? '' : `:\n${output}`}`,
      { cause: error },
    );
  }
}

describe('public package identity', () => {
  it('publishes the Hakimi SDK under the public package name', async () => {
    const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as PackageJson;

    expect(pkg).toMatchObject({
      name: '@bhjia-phys/hakimi-sdk',
      author: 'bhjia-phys',
      publishConfig: { access: 'public', provenance: true },
    });
    expect(pkg.private).not.toBe(true);
    expect(pkg.files).toEqual(['dist', 'README.md']);
    expect(pkg.publishConfig.exports).toEqual(expectedPublishExports);
    expect(pkg.homepage).toContain('github.com/bhjia-phys/Hakimi');
    expect(pkg.repository.url).toContain('github.com/bhjia-phys/Hakimi');
    expect(pkg.bugs.url).toContain('github.com/bhjia-phys/Hakimi');
  });

  it('packs and imports only the public SDK surface in an isolated directory', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'hakimi-sdk-pack-'));
    const packDir = join(tempDir, 'pack');
    const installDir = join(tempDir, 'install');

    try {
      await mkdir(packDir);
      await mkdir(installDir);
      await run('pnpm', ['run', 'build'], packageRoot);
      await run('pnpm', ['pack', '--pack-destination', packDir], packageRoot);

      const tarballs = (await readdir(packDir)).filter((entry) => entry.endsWith('.tgz'));
      expect(tarballs).toHaveLength(1);
      const tarballPath = join(packDir, tarballs[0]!);
      const { stdout: listing } = await run('tar', ['-tzf', tarballPath], packageRoot);
      const entries = listing.split('\n').filter(Boolean);

      expect(entries).toContain('package/package.json');
      expect(entries).toContain('package/README.md');
      expect(entries).toContain('package/dist/index.d.mts');
      expect(entries).toContain('package/dist/index.mjs');
      expect(entries.some((entry) => entry.startsWith('package/dist/'))).toBe(true);
      expect(entries.some((entry) => entry.startsWith('package/src/'))).toBe(false);
      expect(entries.some((entry) => entry.startsWith('package/test/'))).toBe(false);

      await run(
        'npm',
        [
          'install',
          '--ignore-scripts',
          '--no-package-lock',
          '--no-audit',
          '--no-fund',
          '--prefix',
          installDir,
          tarballPath,
        ],
        packageRoot,
      );
      const { stdout } = await run(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          "const sdk = await import('@bhjia-phys/hakimi-sdk'); if (typeof sdk.createKimiHarness !== 'function') throw new Error('missing createKimiHarness'); console.log('ok');",
        ],
        installDir,
      );
      expect(stdout.trim()).toBe('ok');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 120_000);
});
