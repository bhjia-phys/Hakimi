import { describe, expect, it, vi } from 'vitest';

import {
  handleResearchCommand,
  parseResearchCommand,
} from '#/tui/commands/research';
import type { ResearchModeSnapshot } from '@bhjia-phys/hakimi-sdk';

function stripAnsi(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

function makeSnapshot(
  overrides: Partial<ResearchModeSnapshot> = {},
): ResearchModeSnapshot {
  return {
    enabled: false,
    skillsAvailable: true,
    ...overrides,
  };
}

function makeResearchHost(snapshot: ResearchModeSnapshot = makeSnapshot()) {
  let generation = 0;
  const session = {
    getResearch: vi.fn(async () => snapshot),
    commandResearch: vi.fn(async (command: { kind: string }) => ({
      snapshot: { ...snapshot, enabled: command.kind === 'enter_mode' },
    })),
  };
  const researchController = {
    beginRequest: vi.fn(() => ({ session, generation: ++generation })),
    applySnapshot: vi.fn(() => true),
    setSnapshot: vi.fn(),
  };
  const host = {
    state: {
      appState: { permissionMode: 'auto' },
      researchBoard: {
        getSnapshot: () => snapshot,
      },
      editor: { getText: vi.fn(() => '') },
      editorReplacementMounted: false,
      transcriptContainer: { addChild: vi.fn() },
      ui: { requestRender: vi.fn() },
    },
    session,
    requireSession: () => session,
    researchController,
    restoreInputText: vi.fn(),
    showError: vi.fn(),
    showStatus: vi.fn(),
    track: vi.fn(),
  } as unknown as Parameters<typeof handleResearchCommand>[0];
  return { host, session, researchController };
}

describe('parseResearchCommand', () => {
  it('parses empty args as a mode toggle', () => {
    expect(parseResearchCommand('')).toEqual({ kind: 'toggle' });
    expect(parseResearchCommand('   ')).toEqual({ kind: 'toggle' });
  });

  it('parses the supported subcommands', () => {
    expect(parseResearchCommand('status')).toEqual({ kind: 'status' });
    expect(parseResearchCommand('on')).toEqual({ kind: 'on' });
    expect(parseResearchCommand('off')).toEqual({ kind: 'off' });
  });

  it('rejects unexpected arguments after a supported subcommand', () => {
    for (const text of ['on -- my-line', 'off now', 'status please']) {
      const result = parseResearchCommand(text);
      expect(result.kind).toBe('error');
      if (result.kind === 'error') expect(result.restoreInput).toBe(true);
    }
  });

  it('parses retired executor subcommands as explicitly unsupported', () => {
    for (const name of [
      'pause',
      'resume',
      'manage',
      'align',
      'line',
      'edit',
      'focus',
      'defer',
      'block',
      'close',
      'reopen',
      'discard-checkpoint',
      'adopt-conclusion',
    ]) {
      expect(parseResearchCommand(`${name} extra args`)).toEqual({
        kind: 'unsupported',
        subcommand: name,
      });
      expect(parseResearchCommand(name)).toEqual({
        kind: 'unsupported',
        subcommand: name,
      });
    }
  });

  it('returns an error for unknown subcommands', () => {
    const result = parseResearchCommand('frobnicate');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.restoreInput).toBe(true);
      expect(result.message).toContain('/research status');
    }
  });
});

describe('handleResearchCommand', () => {
  it('toggle enters the mode when disabled', async () => {
    const { host, session } = makeResearchHost(makeSnapshot({ enabled: false }));
    await handleResearchCommand(host, '');
    expect(session.commandResearch).toHaveBeenCalledWith({ kind: 'enter_mode', actor: 'user' });
    expect(host.track).toHaveBeenCalledWith('research_on');
  });

  it('toggle exits the mode when enabled', async () => {
    const { host, session } = makeResearchHost(makeSnapshot({ enabled: true }));
    await handleResearchCommand(host, '');
    expect(session.commandResearch).toHaveBeenCalledWith({ kind: 'exit_mode' });
    expect(host.track).toHaveBeenCalledWith('research_off');
  });

  it('toggle aborts when the snapshot read fails', async () => {
    const { host, session } = makeResearchHost();
    session.getResearch.mockRejectedValueOnce(new Error('boom'));
    await handleResearchCommand(host, '');
    expect(session.commandResearch).not.toHaveBeenCalled();
    expect(host.showError).toHaveBeenCalledOnce();
  });

  it('on sends enter_mode with the user actor', async () => {
    const { host, session } = makeResearchHost();
    await handleResearchCommand(host, 'on');
    expect(session.commandResearch).toHaveBeenCalledWith({ kind: 'enter_mode', actor: 'user' });
    expect(host.showStatus).toHaveBeenCalledWith(expect.stringContaining('Research memory mode on'));
  });

  it('off sends exit_mode', async () => {
    const { host, session } = makeResearchHost(makeSnapshot({ enabled: true }));
    await handleResearchCommand(host, 'off');
    expect(session.commandResearch).toHaveBeenCalledWith({ kind: 'exit_mode' });
    expect(host.showStatus).toHaveBeenCalledWith(expect.stringContaining('off'));
  });

  it('never sends legacy executor commands', async () => {
    const { host, session } = makeResearchHost(makeSnapshot({ enabled: true }));
    for (const args of ['pause', 'resume', 'manage', 'align clear', 'line a', 'focus q1 -- x', 'close q1']) {
      await handleResearchCommand(host, args);
    }
    expect(session.commandResearch).not.toHaveBeenCalled();
  });

  it('status prints mode, skill availability, and the read-only history note', async () => {
    const { host } = makeResearchHost(makeSnapshot({ enabled: true, skillsAvailable: true }));
    await handleResearchCommand(host, 'status');
    const addChild = host.state.transcriptContainer.addChild as ReturnType<typeof vi.fn>;
    expect(addChild).toHaveBeenCalledOnce();
    const text = stripAnsi(addChild.mock.calls[0]?.[0].render(120).join('\n'));
    expect(text).toContain('Research memory mode: on');
    expect(text).toContain('AITP Skills: available');
    expect(text).toContain('read-only');
    expect(host.track).toHaveBeenCalledWith('research_status', { enabled: true });
  });

  it('status reports the off state without pretending legacy state is live', async () => {
    const { host } = makeResearchHost(makeSnapshot({ enabled: false, skillsAvailable: false }));
    await handleResearchCommand(host, 'status');
    const addChild = host.state.transcriptContainer.addChild as ReturnType<typeof vi.fn>;
    const text = stripAnsi(addChild.mock.calls[0]?.[0].render(120).join('\n'));
    expect(text).toContain('Research memory mode: off');
    expect(text).toContain('AITP Skills: unavailable');
    expect(text).not.toContain('loop:');
  });

  it('unsupported subcommands explain the retirement and restore the input', async () => {
    const { host, session } = makeResearchHost();
    await handleResearchCommand(host, 'manage');
    expect(session.commandResearch).not.toHaveBeenCalled();
    expect(host.showStatus).toHaveBeenCalledWith(expect.stringContaining('retired'));
    expect(host.restoreInputText).toHaveBeenCalledWith('/research manage');
  });

  it('parse errors restore the input', async () => {
    const { host } = makeResearchHost();
    await handleResearchCommand(host, 'on garbage');
    expect(host.showError).toHaveBeenCalledOnce();
    expect(host.restoreInputText).toHaveBeenCalledWith('/research on garbage');
  });

  it('command errors surface as errors, not silent drops', async () => {
    const { host, session } = makeResearchHost();
    session.commandResearch.mockRejectedValueOnce(new Error('research.retired'));
    await handleResearchCommand(host, 'on');
    expect(host.showError).toHaveBeenCalledOnce();
    expect(host.track).not.toHaveBeenCalledWith('research_on');
  });

  it('drops the response when the request was superseded', async () => {
    const { host, researchController, session } = makeResearchHost();
    researchController.applySnapshot.mockReturnValue(false);
    await handleResearchCommand(host, 'on');
    expect(session.commandResearch).toHaveBeenCalledOnce();
    expect(host.showStatus).not.toHaveBeenCalled();
  });
});
