import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getBinDir,
  getDataDir,
  getInputHistoryFile,
  getLogDir,
  getUpdateInstallStateFile,
  getUpdateStateFile,
} from '#/utils/paths';

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env['HAKIMI_HOME'];
  delete process.env['KIMI_CODE_HOME'];
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('getDataDir', () => {
  it('returns ~/.hakimi when no home env var is set', () => {
    expect(getDataDir()).toBe(join(homedir(), '.hakimi'));
  });

  it('returns HAKIMI_HOME when set', () => {
    process.env['HAKIMI_HOME'] = '/tmp/hakimi-test-data';
    expect(getDataDir()).toBe('/tmp/hakimi-test-data');
  });

  it('returns KIMI_CODE_HOME when set', () => {
    process.env['KIMI_CODE_HOME'] = '/tmp/kimi-test-data';
    expect(getDataDir()).toBe('/tmp/kimi-test-data');
  });

  it('returns KIMI_CODE_HOME even if it is a relative path', () => {
    process.env['KIMI_CODE_HOME'] = 'relative/path';
    expect(getDataDir()).toBe('relative/path');
  });

  it('prefers HAKIMI_HOME over KIMI_CODE_HOME', () => {
    process.env['HAKIMI_HOME'] = '/hakimi';
    process.env['KIMI_CODE_HOME'] = '/kimi-code';
    expect(getDataDir()).toBe('/hakimi');
  });
});

describe('getLogDir', () => {
  it('returns <dataDir>/logs', () => {
    expect(getLogDir()).toBe(join(homedir(), '.hakimi', 'logs'));
  });

  it('respects KIMI_CODE_HOME', () => {
    process.env['KIMI_CODE_HOME'] = '/z';
    expect(getLogDir()).toBe(join('/z', 'logs'));
  });
});

describe('getBinDir', () => {
  it('returns <dataDir>/bin', () => {
    expect(getBinDir()).toBe(join(homedir(), '.kimi-code', 'bin'));
  });

  it('respects KIMI_CODE_HOME', () => {
    process.env['KIMI_CODE_HOME'] = '/custom-bin-home';
    expect(getBinDir()).toBe(join('/custom-bin-home', 'bin'));
  });
});

describe('getUpdateStateFile', () => {
  it('returns <dataDir>/updates/latest.json', () => {
    expect(getUpdateStateFile()).toBe(join(homedir(), '.hakimi', 'updates', 'latest.json'));
  });

  it('respects KIMI_CODE_HOME', () => {
    process.env['KIMI_CODE_HOME'] = '/updates-home';
    expect(getUpdateStateFile()).toBe(join('/updates-home', 'updates', 'latest.json'));
  });
});

describe('getUpdateInstallStateFile', () => {
  it('returns <dataDir>/updates/install.json', () => {
    expect(getUpdateInstallStateFile()).toBe(
      join(homedir(), '.hakimi', 'updates', 'install.json'),
    );
  });

  it('respects KIMI_CODE_HOME', () => {
    process.env['KIMI_CODE_HOME'] = '/updates-home';
    expect(getUpdateInstallStateFile()).toBe(join('/updates-home', 'updates', 'install.json'));
  });
});

describe('getInputHistoryFile', () => {
  it('returns <dataDir>/user-history/<md5(workDir)>.jsonl', () => {
    const workDir = '/home/user/project';
    const hash = createHash('md5').update(workDir, 'utf-8').digest('hex');
    expect(getInputHistoryFile(workDir)).toBe(
      join(homedir(), '.hakimi', 'user-history', `${hash}.jsonl`),
    );
  });

  it('respects KIMI_CODE_HOME', () => {
    process.env['KIMI_CODE_HOME'] = '/custom/data';
    const hash = createHash('md5').update('/proj', 'utf-8').digest('hex');
    expect(getInputHistoryFile('/proj')).toBe(
      join('/custom/data', 'user-history', `${hash}.jsonl`),
    );
  });
});
