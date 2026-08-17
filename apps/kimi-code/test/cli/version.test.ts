import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createKimiCodeUserAgent,
  getHostPackageJsonPath,
  getHostPackageRoot,
  getUpstreamBase,
  getVersion,
  UpstreamBaseSchema,
} from '#/cli/version';

describe('cli version helpers', () => {
  it('resolves the host package manifest near apps/kimi-code and reads its version', () => {
    const pkgPath = getHostPackageJsonPath();
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

    expect(pkgPath.endsWith(join('apps', 'kimi-code', 'package.json'))).toBe(true);
    expect(getHostPackageRoot()).toBe(dirname(pkgPath));
    expect(getVersion()).toBe(pkg.version);
  });

  it('exposes the recorded upstream Kimi Code baseline', () => {
    expect(getUpstreamBase()).toEqual({
      repository: 'https://github.com/MoonshotAI/kimi-code.git',
      version: '0.35.0',
      commit: '23e68eee8bdfaded522dfabf2c9ad6996939a679',
    });
  });

  it('reads the upstream baseline from upstream-base.json next to the host package', () => {
    const basePath = join(getHostPackageRoot(), 'upstream-base.json');
    const upstream = JSON.parse(readFileSync(basePath, 'utf8')) as Record<string, unknown>;

    expect(getUpstreamBase()).toEqual(upstream);
  });

  it('rejects upstream base metadata with an unknown field', () => {
    expect(() =>
      UpstreamBaseSchema.parse({
        repository: 'https://github.com/MoonshotAI/kimi-code.git',
        version: '0.34.0',
        commit: '01c74e937',
        extra: 'leak',
      }),
    ).toThrow();
  });

  it('rejects upstream base metadata with a non-semver version', () => {
    expect(() =>
      UpstreamBaseSchema.parse({
        repository: 'https://github.com/MoonshotAI/kimi-code.git',
        version: '1.2.3garbage',
        commit: '01c74e937',
      }),
    ).toThrow();
  });

  it('rejects upstream base metadata with a malformed commit', () => {
    expect(() =>
      UpstreamBaseSchema.parse({
        repository: 'https://github.com/MoonshotAI/kimi-code.git',
        version: '0.34.0',
        commit: '7cd64766',
      }),
    ).toThrow();
  });

  it('builds the product user-agent for ad-hoc fetches', () => {
    expect(createKimiCodeUserAgent('1.2.3')).toBe('kimi-code-cli/1.2.3 (hakimi)');
  });
});
