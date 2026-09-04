import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SlashCommandHost } from '#/tui/commands/dispatch';
import { findBuiltInSlashCommand, resolveSlashCommandAvailability } from '#/tui/commands/registry';
import type { KimiSlashCommand } from '#/tui/commands/types';
import {
  handleRemoteCommand,
  parseRemoteSlashArgs,
  tokenizeRemoteArgs,
} from '#/tui/commands/remote';

const mocks = vi.hoisted(() => ({
  runRemoteControl: vi.fn(),
}));

vi.mock('#/cli/sub/remote/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/cli/sub/remote/index')>();
  return { ...actual, runRemoteControl: mocks.runRemoteControl };
});

function makeHost() {
  return {
    session: { id: 'session-1' },
    showError: vi.fn(),
    setExitForegroundTask: vi.fn(),
    stop: vi.fn(async () => {}),
  } as unknown as SlashCommandHost & {
    showError: ReturnType<typeof vi.fn>;
    setExitForegroundTask: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  mocks.runRemoteControl.mockReset();
  process.exitCode = undefined;
});

describe('remote slash command registration', () => {
  it('is visible by default, argument-free in completion, and idle-only', () => {
    const command = findBuiltInSlashCommand('remote') as KimiSlashCommand | undefined;
    expect(command).toBeDefined();
    expect(command?.argumentHint).toBeUndefined();
    expect(command?.experimentalFlag).toBeUndefined();
    expect(command?.availability).toBe('idle-only');
    expect(resolveSlashCommandAvailability(command!, '')).toBe('idle-only');
  });
});

describe('parseRemoteSlashArgs', () => {
  it('strictly parses optional ttl and quoted absolute cloudflared paths', () => {
    expect(parseRemoteSlashArgs('')).toEqual({ ttl: undefined, cloudflared: undefined });
    expect(
      parseRemoteSlashArgs('--ttl=30m --cloudflared "/opt/Cloudflare Tunnel/cloudflared"'),
    ).toEqual({
      ttl: '30m',
      cloudflared: '/opt/Cloudflare Tunnel/cloudflared',
    });
  });

  it('preserves Windows drive and UNC backslashes inside double quotes', () => {
    expect(
      tokenizeRemoteArgs(String.raw`--cloudflared "C:\Program Files\cloudflared.exe"`),
    ).toEqual(['--cloudflared', String.raw`C:\Program Files\cloudflared.exe`]);
    expect(
      tokenizeRemoteArgs(String.raw`--cloudflared "\\server\share\cloudflared.exe"`),
    ).toEqual(['--cloudflared', String.raw`\\server\share\cloudflared.exe`]);
  });

  it.each([
    '--port 1234',
    '--ttl',
    '--ttl 1h --ttl 2h',
    '--cloudflared cloudflared',
    '--cloudflared "/unterminated',
  ])('rejects invalid input: %s', (args) => {
    expect(() => parseRemoteSlashArgs(args)).toThrow();
  });
});

describe('handleRemoteCommand', () => {
  it('reports no active session without stopping the TUI', async () => {
    const host = makeHost();
    host.session = undefined;

    await handleRemoteCommand(host, '');

    expect(host.showError).toHaveBeenCalledOnce();
    expect(host.setExitForegroundTask).not.toHaveBeenCalled();
    expect(host.stop).not.toHaveBeenCalled();
  });

  it('keeps parse errors on the TUI and does not register a takeover', async () => {
    const host = makeHost();

    await handleRemoteCommand(host, '--ttl forever');

    expect(host.showError).toHaveBeenCalledWith(expect.stringContaining('invalid --ttl'));
    expect(host.setExitForegroundTask).not.toHaveBeenCalled();
    expect(host.stop).not.toHaveBeenCalled();
  });

  it('fully stops the TUI before the shared runner starts without an experiment gate', async () => {
    const host = makeHost();

    await handleRemoteCommand(host, '--ttl 30m --cloudflared /opt/cloudflared');

    expect(host.setExitForegroundTask).toHaveBeenCalledOnce();
    expect(host.stop).toHaveBeenCalledOnce();
    expect(mocks.runRemoteControl).not.toHaveBeenCalled();

    const task = host.setExitForegroundTask.mock.calls[0]![0] as () => Promise<void>;
    await task();
    expect(mocks.runRemoteControl).toHaveBeenCalledWith({
      sessionId: 'session-1',
      port: 58627,
      ttlMs: 30 * 60 * 1_000,
      cloudflaredPath: '/opt/cloudflared',
      logLevel: 'silent',
    });
  });
});
