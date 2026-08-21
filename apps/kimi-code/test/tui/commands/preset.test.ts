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
  'acme/legacy': {
    provider: 'acme',
    model: 'legacy',
    name: 'Acme Legacy',
    supportEfforts: ['low', 'medium', 'high'],
  },
};

const SUBAGENT_CONFIG = {
  preset: 'fast',
  agents: {
    main: { model: 'acme/mini', thinkingEffort: 'low' },
    explore: { model: 'acme/mini', thinkingEffort: 'low' },
    tower_worker: { model: 'acme/main', thinkingEffort: 'medium' },
    tower_reviewer: { model: 'acme/main', thinkingEffort: 'high' },
  },
  presets: {
    fast: {
      explore: { thinkingEffort: 'minimal' },
      plan: { model: 'acme/mini' },
      tower_worker: { model: 'acme/main' },
      tower_reviewer: { model: 'acme/main' },
    },
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

function makeHost(
  options: {
    hasSession?: boolean;
    subagent?: unknown;
    secondaryModel?: { defaultModel?: string; model?: string };
  } = {},
) {
  const config = {
    defaultModel: 'acme/main',
    subagent: options.subagent === undefined ? SUBAGENT_CONFIG : options.subagent,
    secondaryModel: options.secondaryModel,
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
    expect(routes).toContain('Tower worker');
    expect(routes).toContain('Tower reviewer');

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
    expect(text).toContain('main: model=acme/main  effort=medium');
    expect(text).not.toContain('main: model=acme/mini');
    expect(text).toContain('explore: model=acme/mini  effort=minimal');
    expect(text).toContain('swarm: inherits the selected task profile route');
  });

  it('does not present a configured legacy model as effective while a preset is active', async () => {
    const { host, harness } = makeHost({
      secondaryModel: { defaultModel: 'acme/legacy' },
    });

    await handlePresetCommand(host, 'status');

    expect(harness.setConfig).not.toHaveBeenCalled();
    const text = stripAnsi(
      (host.showStatus as ReturnType<typeof vi.fn>).mock.calls.map(([value]) => String(value)).join('\n'),
    );
    expect(text).toContain('Effective Agent routes (preset > [subagent.agents] > parent):');
    expect(text).not.toContain('legacy compatibility fallback');
  });

  it('summarizes legacy-only routing without claiming parent inheritance', async () => {
    const { host, harness } = makeHost({
      subagent: { agents: { main: { model: 'acme/mini' } } },
      secondaryModel: { defaultModel: 'acme/legacy' },
    });

    await handlePresetCommand(host, 'status');

    expect(harness.setConfig).not.toHaveBeenCalled();
    const text = stripAnsi(
      (host.showStatus as ReturnType<typeof vi.fn>).mock.calls.map(([value]) => String(value)).join('\n'),
    );
    expect(text).toContain('main: model=acme/main  effort=medium');
    expect(text).not.toContain('main: model=acme/mini');
    expect(text).toContain(
      'No canonical subagent model routes configured — legacy compatibility may apply to eligible subagents and Tower workers; otherwise they use the parent model.',
    );
    expect(text).not.toContain('tower_worker: inherits parent');
    expect(text).not.toContain('legacy compatibility fallback: model=acme/legacy');
    expect(text).not.toContain('Effective Agent routes (preset > [subagent.agents] > parent):');
  });

  it('uses the current main rather than agents.main in the main route picker', async () => {
    const { host } = makeHost({
      secondaryModel: { defaultModel: 'acme/legacy' },
    });

    await handlePresetCommand(host, 'edit fast');
    mountedPicker(host).handleInput(DOWN);
    mountedPicker(host).handleInput(ENTER);

    await vi.waitFor(() => {
      expect(host.mountEditorReplacement).toHaveBeenCalledTimes(2);
    });
    const text = stripAnsi(mountedPicker(host).render(100).join('\n'));
    expect(text).toContain('❯ main    acme ← current');
    expect(text).not.toContain('❯ mini    acme ← current');
  });

  it('uses preset then base routes, never the legacy model, in the route picker', async () => {
    const { host } = makeHost({
      secondaryModel: { defaultModel: 'acme/legacy' },
    });

    await handlePresetCommand(host, 'edit fast');
    mountedPicker(host).handleInput(DOWN);
    mountedPicker(host).handleInput(DOWN);
    mountedPicker(host).handleInput(ENTER);

    await vi.waitFor(() => {
      expect(host.mountEditorReplacement).toHaveBeenCalledTimes(2);
    });
    expect(stripAnsi(mountedPicker(host).render(100).join('\n'))).toContain('❯ mini    acme ← current');
  });

  it('documents Tower base-route fallback in the preset picker', async () => {
    const { host } = makeHost({
      subagent: {
        presets: { fast: {} },
        agents: {
          tower_worker: { model: 'acme/main' },
          tower_reviewer: { model: 'acme/main' },
        },
      },
    });

    await handlePresetCommand(host, 'edit fast');
    mountedPicker(host).handleInput(ENTER);
    const text = stripAnsi(mountedPicker(host).render(100).join('\n'));
    expect(text).toContain('[subagent.agents.tower_worker]');
    expect(text).toContain('[subagent.agents.tower_reviewer]');
  });

  it('shows tower-only routes on status without claiming no overrides', async () => {
    const { host, harness } = makeHost({
      subagent: {
        agents: {
          tower_worker: { model: 'acme/main', thinkingEffort: 'medium' },
        },
      },
    });

    await handlePresetCommand(host, 'status');

    expect(harness.setConfig).not.toHaveBeenCalled();
    const text = stripAnsi(
      (host.showStatus as ReturnType<typeof vi.fn>).mock.calls.map(([value]) => String(value)).join('\n'),
    );
    expect(text).toContain('tower_worker: model=acme/main  effort=medium');
    expect(text).not.toContain('No subagent model overrides configured');
  });

  it('creates the first preset from the empty manager without writing config yet', async () => {
    const { host, harness } = makeHost({ subagent: {} });

    await handlePresetCommand(host, '');

    const manager = stripAnsi(mountedPicker(host).render(100).join('\n'));
    expect(manager).toContain('Manage agent preset');
    expect(manager).toContain('No presets configured');
    expect(manager).toContain('Create new preset');
    expect(host.showNotice).not.toHaveBeenCalled();

    mountedPicker(host).handleInput(ENTER);
    expect(stripAnsi(mountedPicker(host).render(100).join('\n'))).toContain(
      'Create agent preset',
    );
    for (const character of 'physics') mountedPicker(host).handleInput(character);
    mountedPicker(host).handleInput(ENTER);

    await vi.waitFor(() => {
      expect(host.mountEditorReplacement).toHaveBeenCalledTimes(3);
    });
    const editor = stripAnsi(mountedPicker(host).render(100).join('\n'));
    expect(editor).toContain('Preset: physics');
    expect(editor).toContain('Explore subagent');
    expect(harness.setConfig).not.toHaveBeenCalled();
  });

  it('returns to the empty manager when preset creation is cancelled', async () => {
    const { host } = makeHost({ subagent: {} });

    await handlePresetCommand(host, '');
    mountedPicker(host).handleInput(ENTER);
    mountedPicker(host).handleInput('\u001B');

    await vi.waitFor(() => {
      expect(host.mountEditorReplacement).toHaveBeenCalledTimes(3);
    });
    const manager = stripAnsi(mountedPicker(host).render(100).join('\n'));
    expect(manager).toContain('Manage agent preset');
    expect(manager).toContain('Create new preset');
  });
});
