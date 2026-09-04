import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ensureKimiHome, resolveConfigPath, resolveKimiHome } from '#/app/bootstrap/bootstrap';

describe('bootstrap path helpers', () => {
  describe('resolveKimiHome', () => {
    it('uses explicit homeDir when provided', () => {
      expect(resolveKimiHome('/tmp/kimi', { HAKIMI_HOME: '/hakimi', KIMI_CODE_HOME: '/legacy' })).toBe('/tmp/kimi');
    });

    it('falls back to KIMI_CODE_HOME env', () => {
      expect(resolveKimiHome(undefined, { KIMI_CODE_HOME: '/env/kimi' })).toBe('/env/kimi');
    });

    it('prefers HAKIMI_HOME to the legacy home override', () => {
      expect(resolveKimiHome(undefined, { HAKIMI_HOME: '/hakimi', KIMI_CODE_HOME: '/legacy' })).toBe('/hakimi');
    });

    it('uses the Hakimi home by default without discovering or merging legacy data', () => {
      expect(resolveKimiHome(undefined, {}, '/user')).toBe('/user/.hakimi');
    });
  });

  describe('resolveConfigPath', () => {
    it('uses explicit configPath when provided', () => {
      expect(resolveConfigPath({ configPath: '/x/config.toml' })).toBe('/x/config.toml');
    });

    it('joins homeDir with config.toml', () => {
      expect(resolveConfigPath({ homeDir: '/tmp/kimi' })).toBe('/tmp/kimi/config.toml');
    });
  });

  describe('ensureKimiHome', () => {
    let dir: string | undefined;
    afterEach(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it('creates the directory with 0700 permissions', () => {
      dir = join(mkdtempSync(join(tmpdir(), 'kimi-home-')), 'nested');
      ensureKimiHome(dir);
      expect(existsSync(dir)).toBe(true);
    });
  });
});
