import { describe, expect, it, vi } from 'vitest';

import { SessionEventHandler } from '#/tui/controllers/session-event-handler';
import { getBuiltInPalette } from '#/tui/theme';

function makeHost() {
  const researchController = {
    setSnapshot: vi.fn(),
    clear: vi.fn(),
    hydrate: vi.fn(async () => {}),
    getSnapshotRevision: vi.fn(() => undefined),
    isBoardVisible: vi.fn(() => false),
  };
  const host = {
    state: {
      appState: {
        sessionId: 's1',
        streamingPhase: 'idle',
        model: 'kimi-model',
        permissionMode: 'auto',
      },
      queuedMessages: [],
      queuedMessageDispatchPending: false,
      theme: { palette: getBuiltInPalette('dark') },
      toolOutputExpanded: false,
      todoPanel: { getTodos: vi.fn(() => []) },
      transcriptContainer: { addChild: vi.fn() },
      ui: { requestRender: vi.fn() },
    },
    session: { id: 's1' },
    aborted: false,
    sessionEventUnsubscribe: undefined,
    streamingUI: {
      setTurnId: vi.fn(),
      flushNow: vi.fn(),
      resetToolUi: vi.fn(),
      finalizeTurn: vi.fn(),
      hasActiveTurn: vi.fn(() => false),
      hasThinkingDraft: vi.fn(() => false),
      flushThinkingToTranscript: vi.fn(),
      appendAssistantDelta: vi.fn(),
      scheduleFlush: vi.fn(),
      beginCompaction: vi.fn(),
      endCompaction: vi.fn(),
      cancelCompaction: vi.fn(),
    },
    requireSession: vi.fn(),
    setAppState: vi.fn(),
    patchLivePane: vi.fn(),
    resetLivePane: vi.fn(),
    showError: vi.fn(),
    showStatus: vi.fn(),
    showNotice: vi.fn(),
    track: vi.fn(),
    recordSessionActivity: vi.fn(),
    noteStepUsage: vi.fn(),
    noteCompactionFinished: vi.fn(),
    mountEditorReplacement: vi.fn(),
    restoreEditor: vi.fn(),
    restoreInputText: vi.fn(),
    appendTranscriptEntry: vi.fn(),
    refreshSkillCommands: vi.fn(async () => {}),
    sendNormalUserInput: vi.fn(),
    sendQueuedMessage: vi.fn(),
    shiftQueuedMessage: vi.fn(),
    btwPanelController: { routeEvent: vi.fn(() => false) },
    tasksBrowserController: {},
    researchController,
  };
  return { host: host as any, researchController };
}

describe('SessionEventHandler research events', () => {
  it('research.updated directly updates the board with the event snapshot', () => {
    const { host, researchController } = makeHost();
    const handler = new SessionEventHandler(host);
    const snapshot = { mode: 'ready', loopStatus: 'active', revision: 3 } as any;
    handler.handleEvent(
      { type: 'research.updated', sessionId: 's1', agentId: 'main', snapshot } as any,
      vi.fn(),
    );
    expect(researchController.setSnapshot).toHaveBeenCalledWith(snapshot);
    expect(researchController.hydrate).not.toHaveBeenCalled();
  });

  it('aitp_mode.updated refreshes current-session skills without hydrating research', () => {
    const { host, researchController } = makeHost();
    const handler = new SessionEventHandler(host);
    handler.handleEvent(
      { type: 'aitp_mode.updated', sessionId: 's1', agentId: 'main' } as any,
      vi.fn(),
    );
    // The live board is only driven by research.updated full snapshots — the
    // mode-toggle event refreshes slash commands, not an async getResearch hydrate.
    expect(host.refreshSkillCommands).toHaveBeenCalledWith(host.session);
    expect(researchController.hydrate).not.toHaveBeenCalled();
    expect(researchController.setSnapshot).not.toHaveBeenCalled();
  });
});
