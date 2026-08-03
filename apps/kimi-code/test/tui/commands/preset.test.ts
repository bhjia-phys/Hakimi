/**
 * Scenario: configure and activate main/subagent/swarm model routes through `/preset`.
 *
 * Responsibilities: keep direct command compatibility, drive the visual
 * preset → route → shared model picker flow, and persist literal route choices.
 * Wiring: a SlashCommandHost boundary with real picker components and mocked
 * SDK/session calls. Run: pnpm exec vitest run apps/kimi-code/test/tui/commands/preset.test.ts
 */

import { describe, expect, it, vi } from 'vitest';

import { handlePresetCommand } from '#/tui/commands/index';
import type { SlashCommandHost } from '#/tui/commands/dispatch';

const ENTER = '\r';
const DOWN = '\u001B[B';
const RIGHT = '\u001B[C';

function stripAnsi(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

const AVAILABLE_MODELS = {
  'acme/main': {
    provider: 'acme',
    model: 'main',
    name: 'Acme Main',
    supportEfforts: ['low', 'medium', 'high'],
  },
  'acme/mini': {
    provider: 'acme',
    model: 'mini',
    name: 'Acme Mini',
    supportEfforts: ['low', 'medium', 'high'],
  },
};

const SUBAGENT_CONFIG = {
  preset: 'fast',
  agents: { explore: { model: 'acme/mini', thinkingEffort: 'low' } },
  presets: {
    fast: { explore: { thinkingEffort: 'minimal' }, plan: { model: 'acme/mini' } },
    deep: {
      main: { model: 'acme/main', thinkingEffort: 'high' },
      coder: { model: 'acme/main', thinkingEffort: 'high' },
      swarm: { model: 'acme/mini', thinkingEffort: 'medium' },
    },
  },
};

interface TestPicker {
  handleInput(data: string): void;
  render(width: number): string[];
}

function makeHost(options: { hasSession?: boolean; subagent?: unknown } = {}) {
  const config = {
    subagent: options.subagent === undefined ? SUBAGENT_CONFIG : options.subagent,
    models: AVAILABLE_MODELS,
  };
  const harness = {
    getConfig: vi.fn(async () => config),
    setConfig: vi.fn(async () => config),
  };
  const session = {
    id: 'session_test',
    setModel: vi.fn(async () => {}),
    setThinking: vi.fn(async () => {}),
    reloadSession: vi.fn(async () => {}),
  };
  const host = {
    state: {
      appState: {
        model: 'acme/main',
        thinkingEffort: 'medium',
        availableModels: AVAILABLE_MODELS,
        availableProviders: { acme: { type: 'openai' } },
        streamingPhase: 'idle',
      },
      transcriptEntries: [],
    },
    authFlow: {
      refreshOAuthProviderModels: vi.fn(async () => undefined),
      activateModelAfterLogin: vi.fn(async () => {}),
    },
    harness,
    session: options.hasSession === false ? undefined : session,
    mountEditorReplacement: vi.fn(),
    restoreEditor: vi.fn(),
    showError: vi.fn(),
    showStatus: vi.fn(),
    showNotice: vi.fn(),
    track: vi.fn(),
    reloadCurrentSessionView: vi.fn(async () => {}),
  } as unknown as SlashCommandHost;
  return { host, harness, session };
}

function mountedPicker(host: SlashCommandHost): TestPicker {
  const mount = host.mountEditorReplacement as ReturnType<typeof vi.fn>;
  return mount.mock.calls.at(-1)?.[0] as TestPicker;
}

describe('handlePresetCommand', () => {
  it('activates a known preset and applies its main route before reloading', async () => {
    const { host, harness, session } = makeHost();

    await handlePresetCommand(host, 'deep');

    expect(harness.setConfig).toHaveBeenCalledWith({
      subagent: { preset: 'deep' },
      defaultModel: 'acme/main',
      thinking: { enabled: true, effort: 'high' },
    });
    expect(session.setModel).not.toHaveBeenCalled();
    expect(session.setThinking).toHaveBeenCalledWith('high');
    expect(session.reloadSession).toHaveBeenCalledOnce();
    expect(host.reloadCurrentSessionView).toHaveBeenCalledOnce();
    expect(host.track).toHaveBeenCalledWith('subagent_preset_switch', { preset: 'deep' });
  });

  it('opens preset then route pickers and saves Explore via the shared model picker', async () => {
    const { host, harness } = makeHost();

    await handlePresetCommand(host, '');
    expect(stripAnsi(mountedPicker(host).render(100).join('\n'))).toContain('Manage agent preset');

    mountedPicker(host).handleInput(ENTER);
    const routes = stripAnsi(mountedPicker(host).render(100).join('\n'));
    expect(routes).toContain('Main agent');
    expect(routes).toContain('Explore subagent');
    expect(routes).toContain('Swarm default');

    mountedPicker(host).handleInput(DOWN);
    mountedPicker(host).handleInput(DOWN);
    mountedPicker(host).handleInput(ENTER);
    await vi.waitFor(() => {
      expect(host.mountEditorReplacement).toHaveBeenCalledTimes(3);
    });
    expect(stripAnsi(mountedPicker(host).render(100).join('\n'))).toContain(
      'Select model for Explore subagent · preset fast',
    );

    mountedPicker(host).handleInput(RIGHT);
    mountedPicker(host).handleInput(RIGHT);
    mountedPicker(host).handleInput(RIGHT);
    mountedPicker(host).handleInput(ENTER);

    await vi.waitFor(() => {
      expect(harness.setConfig).toHaveBeenCalledWith({
        subagent: {
          presets: {
            fast: {
              explore: { model: 'acme/mini', thinkingEffort: 'high' },
            },
          },
        },
      });
    });
  });

  it('opens a new named preset directly with /preset edit', async () => {
    const { host, harness } = makeHost();

    await handlePresetCommand(host, 'edit physics');

    expect(harness.setConfig).not.toHaveBeenCalled();
    const text = stripAnsi(mountedPicker(host).render(100).join('\n'));
    expect(text).toContain('Preset: physics');
    expect(text).toContain('Activate preset');
    expect(text).toContain('Swarm default');
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
      (host.showError as ReturnType<typeof vi.fn>).mock.calls.map(([value]) => String(value)).join('\n'),
    );
    expect(text).toContain('Unknown preset "nope"');
    expect(text).toContain('fast');
    expect(text).toContain('deep');
  });

  it('shows main, Agent, and Swarm routes on /preset status', async () => {
    const { host, harness } = makeHost();

    await handlePresetCommand(host, 'status');

    expect(harness.setConfig).not.toHaveBeenCalled();
    const text = stripAnsi(
      (host.showStatus as ReturnType<typeof vi.fn>).mock.calls.map(([value]) => String(value)).join('\n'),
    );
    expect(text).toContain('Active agent preset: fast');
    expect(text).toContain('fast *');
    expect(text).toContain('main: keeps current/default model');
    expect(text).toContain('explore: model=acme/mini  effort=minimal');
    expect(text).toContain('swarm: inherits the selected task profile route');
  });

  it('explains how to create a preset when none exist', async () => {
    const { host } = makeHost({ subagent: {} });

    await handlePresetCommand(host, '');

    expect(host.showNotice).toHaveBeenCalledWith(
      'No presets configured',
      'Create one with /preset edit <name>, then choose models for Main, subagents, and Swarm.',
    );
  });
});
