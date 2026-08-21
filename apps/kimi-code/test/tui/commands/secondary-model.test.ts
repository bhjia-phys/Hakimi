/**
 * Scenario: deprecated /secondary-model command behavior in the interactive TUI.
 * Responsibilities: preserve command resolution while directing users to /preset.
 * Run: pnpm -C apps/kimi-code exec vitest run test/tui/commands/secondary-model.test.ts
 */
import { describe, expect, it, vi } from 'vitest';

import { dispatchInput, type SlashCommandHost } from '#/tui/commands';
import { handleSecondaryModelCommand } from '#/tui/commands/config';

function makeHost() {
  const host = {
    state: { appState: {}, transcriptEntries: [] },
    authFlow: { refreshOAuthProviderModels: vi.fn(async () => undefined) },
    harness: {
      getConfig: vi.fn(async () => ({})),
      setConfig: vi.fn(async () => ({})),
    },
    mountEditorReplacement: vi.fn(),
    showNotice: vi.fn(),
    showError: vi.fn(),
    showStatus: vi.fn(),
  } as unknown as SlashCommandHost & {
    harness: {
      getConfig: ReturnType<typeof vi.fn>;
      setConfig: ReturnType<typeof vi.fn>;
    };
    mountEditorReplacement: ReturnType<typeof vi.fn>;
    showNotice: ReturnType<typeof vi.fn>;
  };
  return { host };
}

describe('handleSecondaryModelCommand', () => {
  it('shows the migration notice without reading or writing config', () => {
    const { host } = makeHost();

    handleSecondaryModelCommand(host, 'ignored-model');

    expect(host.showNotice).toHaveBeenCalledWith('Deprecated: use /preset instead.');
    expect(host.harness.getConfig).not.toHaveBeenCalled();
    expect(host.harness.setConfig).not.toHaveBeenCalled();
    expect(host.authFlow.refreshOAuthProviderModels).not.toHaveBeenCalled();
    expect(host.mountEditorReplacement).not.toHaveBeenCalled();
  });

  it('shows the same migration notice for the legacy alias', () => {
    const { host } = makeHost();

    handleSecondaryModelCommand(host, '');

    expect(host.showNotice).toHaveBeenCalledOnce();
    expect(host.showNotice).toHaveBeenCalledWith('Deprecated: use /preset instead.');
    expect(host.harness.getConfig).not.toHaveBeenCalled();
    expect(host.harness.setConfig).not.toHaveBeenCalled();
  });

  it('dispatches both the hidden command and alias to the migration handler', async () => {
    const { host } = makeHost();
    Object.assign(host, {
      engineV2: false,
      skillCommandMap: new Map<string, string>(),
      pluginCommandMap: new Map<string, string>(),
      track: vi.fn(),
      state: {
        appState: { streamingPhase: 'idle', isCompacting: false },
        transcriptEntries: [],
      },
    });

    dispatchInput(host, '/secondary-model ignored');
    dispatchInput(host, '/subagent-model ignored');

    await vi.waitFor(() => {
      expect(host.showNotice).toHaveBeenCalledTimes(2);
    });
    expect(host.showNotice).toHaveBeenNthCalledWith(1, 'Deprecated: use /preset instead.');
    expect(host.showNotice).toHaveBeenNthCalledWith(2, 'Deprecated: use /preset instead.');
  });
});
