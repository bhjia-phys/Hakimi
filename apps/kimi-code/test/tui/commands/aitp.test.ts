import { describe, expect, it, vi } from 'vitest';

import { handleAitpCommand } from '#/tui/commands/index';
import type { SlashCommandHost } from '#/tui/commands/dispatch';

function stripAnsi(text: string): string {
  return text.replaceAll(/\[[0-9;]*m/g, '');
}

const AITP_FEATURES = [
  { id: 'physics-memory', enabled: false, source: 'config' },
  { id: 'research-ledger', enabled: false, source: 'config' },
  { id: 'research-action', enabled: false, source: 'config' },
  { id: 'domain-profile', enabled: false, source: 'config' },
  { id: 'workflow-recipe', enabled: false, source: 'config' },
  { id: 'research-harness', enabled: false, source: 'config' },
  { id: 'goal-command', enabled: true, source: 'default' },
];

function makeHost(options: { hasSession?: boolean; aitpEnabled?: boolean } = {}) {
  const harness = {
    getConfig: vi.fn(async () => ({ aitp: { enabled: options.aitpEnabled ?? true } })),
    setConfig: vi.fn(async () => ({})),
    getExperimentalFeatures: vi.fn(async () => AITP_FEATURES),
  };
  const session = {
    id: 'session_test',
    reloadSession: vi.fn(async () => {}),
  };
  const host = {
    harness,
    session: options.hasSession === false ? undefined : session,
    showError: vi.fn(),
    showStatus: vi.fn(),
    track: vi.fn(),
    refreshSlashCommandAutocomplete: vi.fn(),
    reloadCurrentSessionView: vi.fn(async () => {}),
  } as unknown as SlashCommandHost;
  return { host, harness, session };
}

describe('handleAitpCommand', () => {
  it('persists aitp.enabled=false and reloads the session on /aitp off', async () => {
    const { host, harness, session } = makeHost();

    await handleAitpCommand(host, 'off');

    expect(harness.setConfig).toHaveBeenCalledWith({ aitp: { enabled: false } });
    expect(session.reloadSession).toHaveBeenCalled();
    expect(host.reloadCurrentSessionView).toHaveBeenCalled();
    expect(host.track).toHaveBeenCalledWith('aitp_master_switch', { enabled: false });
  });

  it('persists aitp.enabled=true on /aitp on', async () => {
    const { host, harness } = makeHost({ aitpEnabled: false });

    await handleAitpCommand(host, 'on');

    expect(harness.setConfig).toHaveBeenCalledWith({ aitp: { enabled: true } });
  });

  it('reports status without writing config when no argument is given', async () => {
    const { host, harness } = makeHost({ aitpEnabled: false });

    await handleAitpCommand(host, '');

    expect(harness.setConfig).not.toHaveBeenCalled();
    const text = stripAnsi(
      (host.showStatus as ReturnType<typeof vi.fn>).mock.calls.map(([t]) => String(t)).join('\n'),
    );
    expect(text).toContain('off');
    expect(text).toContain('physics-memory');
    expect(text).not.toContain('goal-command');
  });

  it('rejects unknown arguments with a usage hint', async () => {
    const { host, harness } = makeHost();

    await handleAitpCommand(host, 'maybe');

    expect(harness.setConfig).not.toHaveBeenCalled();
    const text = stripAnsi(
      (host.showError as ReturnType<typeof vi.fn>).mock.calls.map(([t]) => String(t)).join('\n'),
    );
    expect(text).toContain('/aitp [on|off|status]');
  });
});
