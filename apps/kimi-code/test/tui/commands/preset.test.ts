import { describe, expect, it, vi } from 'vitest';

import { handlePresetCommand } from '#/tui/commands/index';
import type { SlashCommandHost } from '#/tui/commands/dispatch';

function stripAnsi(text: string): string {
  return text.replaceAll(/\[[0-9;]+m/g, '');
}

const SUBAGENT_CONFIG = {
  preset: 'fast',
  agents: { explore: { model: 'acme/mini', thinkingEffort: 'low' } },
  presets: {
    fast: { explore: { thinkingEffort: 'minimal' }, plan: { model: 'acme/mini' } },
    deep: { coder: { model: 'acme/main', thinkingEffort: 'high' } },
  },
};

function makeHost(options: { hasSession?: boolean; subagent?: unknown } = {}) {
  const harness = {
    getConfig: vi.fn(async () => ({
      subagent: options.subagent === undefined ? SUBAGENT_CONFIG : options.subagent,
      models: {
        'acme/main': { provider: 'acme', model: 'main' },
        'acme/mini': { provider: 'acme', model: 'mini' },
      },
    })),
    setConfig: vi.fn(async () => ({})),
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
    reloadCurrentSessionView: vi.fn(async () => {}),
  } as unknown as SlashCommandHost;
  return { host, harness, session };
}

describe('handlePresetCommand', () => {
  it('activates a known preset and reloads the session', async () => {
    const { host, harness, session } = makeHost();

    await handlePresetCommand(host, 'deep');

    expect(harness.setConfig).toHaveBeenCalledWith({ subagent: { preset: 'deep' } });
    expect(session.reloadSession).toHaveBeenCalled();
    expect(host.reloadCurrentSessionView).toHaveBeenCalled();
    expect(host.track).toHaveBeenCalledWith('subagent_preset_switch', { preset: 'deep' });
  });

  it('clears the active preset on /preset off', async () => {
    const { host, harness } = makeHost();

    await handlePresetCommand(host, 'off');

    expect(harness.setConfig).toHaveBeenCalledWith({ subagent: { preset: '' } });
    expect(host.track).toHaveBeenCalledWith('subagent_preset_switch', { preset: 'off' });
  });

  it('rejects an unknown preset name without writing config', async () => {
    const { host, harness } = makeHost();

    await handlePresetCommand(host, 'nope');

    expect(harness.setConfig).not.toHaveBeenCalled();
    const text = stripAnsi(
      (host.showError as ReturnType<typeof vi.fn>).mock.calls.map(([t]) => String(t)).join('\n'),
    );
    expect(text).toContain('Unknown preset "nope"');
    expect(text).toContain('fast');
    expect(text).toContain('deep');
  });

  it('shows the active preset and effective overrides on /preset status', async () => {
    const { host, harness } = makeHost();

    await handlePresetCommand(host, 'status');

    expect(harness.setConfig).not.toHaveBeenCalled();
    const text = stripAnsi(
      (host.showStatus as ReturnType<typeof vi.fn>).mock.calls.map(([t]) => String(t)).join('\n'),
    );
    expect(text).toContain('Active subagent preset: fast');
    expect(text).toContain('fast *');
    // preset.fast.explore effort wins over agents.explore; model still from agents.
    expect(text).toContain('explore: model=acme/mini  effort=minimal');
    expect(text).toContain('plan: model=acme/mini');
    expect(text).toContain('coder: inherits parent');
  });

  it('flags an override whose model alias is missing from [models]', async () => {
    const { host } = makeHost({
      subagent: { agents: { explore: { model: 'acme/typo' } } },
    });

    await handlePresetCommand(host, '');

    const text = stripAnsi(
      (host.showStatus as ReturnType<typeof vi.fn>).mock.calls.map(([t]) => String(t)).join('\n'),
    );
    expect(text).toContain('model=acme/typo (not in [models]!)');
  });

  it('reports when no overrides are configured', async () => {
    const { host } = makeHost({ subagent: {} });

    await handlePresetCommand(host, '');

    const text = stripAnsi(
      (host.showStatus as ReturnType<typeof vi.fn>).mock.calls.map(([t]) => String(t)).join('\n'),
    );
    expect(text).toContain('Active subagent preset: none');
    expect(text).toContain('inherit the parent model');
  });
});
