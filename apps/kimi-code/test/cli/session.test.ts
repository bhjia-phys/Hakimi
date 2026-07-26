import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { SessionStore } from '@moonshot-ai/agent-core/session/store';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { importKimiSessions, registerSessionCommand } from '#/cli/sub/session';

describe('hakimi session import-kimi', () => {
  let root: string;
  let sourceHome: string;
  let targetHome: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'hakimi-import-kimi-'));
    sourceHome = join(root, 'kimi-home');
    targetHome = join(root, 'hakimi-home');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('copies current-format sessions, re-buckets them, and leaves credentials behind', async () => {
    await writeSession(join(sourceHome, 'sessions', 'legacy-bucket', 'session-1'), {
      workDir: '/work/physics',
      marker: 'source-wire',
    });
    await mkdir(sourceHome, { recursive: true });
    await writeFile(join(sourceHome, 'config.toml'), 'api_key = "secret"\n', 'utf8');
    await writeFile(join(sourceHome, 'oauth.json'), '{"access_token":"secret"}\n', 'utf8');

    const result = await importKimiSessions({ sourceHome, targetHome });

    expect(result).toMatchObject({
      copied: 1,
      preserved: 0,
      dryRun: false,
      reindex: { scanned: 1, added: 1, repaired: 0 },
    });
    const targetStore = new SessionStore(targetHome);
    const summary = await targetStore.get('session-1');
    expect(summary.workDir).toBe('/work/physics');
    expect(await readFile(join(summary.sessionDir, 'agents', 'main', 'wire.jsonl'), 'utf8')).toBe(
      'source-wire\n',
    );
    await expect(access(join(targetHome, 'config.toml'))).rejects.toThrow();
    await expect(access(join(targetHome, 'oauth.json'))).rejects.toThrow();
  });

  it('supports a dry run and a single-session filter without writing the target home', async () => {
    await writeSession(join(sourceHome, 'sessions', 'bucket-a', 'session-1'), {
      workDir: '/work/one',
    });
    await writeSession(join(sourceHome, 'sessions', 'bucket-b', 'session-2'), {
      workDir: '/work/two',
    });

    const result = await importKimiSessions({
      sourceHome,
      targetHome,
      sessionId: 'session-2',
      dryRun: true,
    });

    expect(result.selected.map((session) => session.id)).toEqual(['session-2']);
    expect(result).toMatchObject({ copied: 1, preserved: 0, dryRun: true });
    await expect(access(targetHome)).rejects.toThrow();
  });

  it('routes --session-id through the Commander subcommand without colliding with the root flag', async () => {
    await writeSession(join(sourceHome, 'sessions', 'bucket-a', 'session-1'), {
      workDir: '/work/one',
    });
    await writeSession(join(sourceHome, 'sessions', 'bucket-b', 'session-2'), {
      workDir: '/work/two',
    });
    const output: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    try {
      const program = new Command('hakimi').exitOverride();
      program.option('-S, --session [id]');
      registerSessionCommand(program);

      await program.parseAsync([
        'node',
        'hakimi',
        'session',
        'import-kimi',
        '--source-home',
        sourceHome,
        '--target-home',
        targetHome,
        '--session-id',
        'session-2',
        '--dry-run',
      ]);
    } finally {
      writeSpy.mockRestore();
    }

    const text = output.join('');
    expect(text).toContain('Selected sessions: 1');
    expect(text).toContain('session-2');
    expect(text).not.toContain('session-1');
  });

  it('is repeatable and never overwrites an already imported session', async () => {
    await writeSession(join(sourceHome, 'sessions', 'source-bucket', 'session-1'), {
      workDir: '/work/repeat',
      marker: 'first-source',
    });
    await importKimiSessions({ sourceHome, targetHome });

    const targetStore = new SessionStore(targetHome);
    const imported = await targetStore.get('session-1');
    const targetWire = join(imported.sessionDir, 'agents', 'main', 'wire.jsonl');
    await writeFile(targetWire, 'hakimi-local-change\n', 'utf8');

    const repeated = await importKimiSessions({ sourceHome, targetHome });

    expect(repeated).toMatchObject({ copied: 0, preserved: 1 });
    expect(await readFile(targetWire, 'utf8')).toBe('hakimi-local-change\n');
  });

  it('rejects a same-id target session from a different workspace', async () => {
    await writeSession(join(sourceHome, 'sessions', 'source-bucket', 'same-id'), {
      workDir: '/work/source',
    });
    const targetStore = new SessionStore(targetHome);
    await writeSession(
      targetStore.sessionDirFor({ id: 'same-id', workDir: '/work/other' }),
      { workDir: '/work/other' },
    );

    await expect(importKimiSessions({ sourceHome, targetHome })).rejects.toThrow(
      /same-id.*different location|incompatible existing session/i,
    );
  });

  it('preserves a conflicting file at the canonical target path', async () => {
    await writeSession(join(sourceHome, 'sessions', 'source-bucket', 'same-id'), {
      workDir: '/work/source',
    });
    const targetStore = new SessionStore(targetHome);
    const targetPath = targetStore.sessionDirFor({
      id: 'same-id',
      workDir: '/work/source',
    });
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, 'do not delete\n', 'utf8');

    await expect(importKimiSessions({ sourceHome, targetHome })).rejects.toThrow(
      /incompatible existing session/i,
    );
    expect(await readFile(targetPath, 'utf8')).toBe('do not delete\n');
  });

  it('rejects identical or nested source and target homes', async () => {
    await expect(
      importKimiSessions({ sourceHome, targetHome: sourceHome }),
    ).rejects.toThrow(/separate, non-nested/i);
    await expect(
      importKimiSessions({ sourceHome, targetHome: join(sourceHome, 'hakimi') }),
    ).rejects.toThrow(/separate, non-nested/i);
  });
});

async function writeSession(
  sessionDir: string,
  options: { readonly workDir: string; readonly marker?: string },
): Promise<void> {
  await mkdir(join(sessionDir, 'agents', 'main'), { recursive: true });
  await writeFile(
    join(sessionDir, 'state.json'),
    `${JSON.stringify({ workDir: options.workDir, title: 'Imported session' }, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    join(sessionDir, 'agents', 'main', 'wire.jsonl'),
    `${options.marker ?? 'wire'}\n`,
    'utf8',
  );
  await mkdir(dirname(sessionDir), { recursive: true });
}
