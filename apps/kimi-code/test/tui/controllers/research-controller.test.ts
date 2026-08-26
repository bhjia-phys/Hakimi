import { Container, type TUI } from '@moonshot-ai/pi-tui';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ResearchController } from '#/tui/controllers/research-controller';
import { StreamingUIController } from '#/tui/controllers/streaming-ui';
import { ResearchBoardComponent } from '#/tui/components/chrome/research-board';
import { TodoPanelComponent } from '#/tui/components/chrome/todo-panel';
import { setExperimentalFeatures } from '#/tui/commands/experimental-flags';
import type { ResearchStatusSnapshot, Session } from '@moonshot-ai/kimi-code-sdk';
import type { TUIState } from '#/tui/tui-state';

function makeSnapshot(
  overrides: Partial<ResearchStatusSnapshot> = {},
): ResearchStatusSnapshot {
  return {
    mode: 'ready',
    loopStatus: 'active',
    currentLineSlug: 'test-line',
    currentFocus: { questionId: 'q1', revision: 1 },
    currentQuestion: {
      id: 'q1',
      lineSlug: 'test-line',
      wording: 'What is the mechanism?',
      priority: 1,
      neededEvidence: [],
      evidenceRefs: [],
      falsifierRefs: [],
      nextBoundedAction: 'Run experiment A',
      workflow: 'active',
      epistemic: 'candidate',
      persistence: 'working',
      revision: 1,
    },
    questions: [],
    lines: [],
    openQuestionCount: 1,
    activeQuestionCount: 1,
    blockedQuestionCount: 0,
    alerts: [],
    aitpHealth: { phase: 'ready' },
    phase: 'action_executing',
    revision: 1,
    ...overrides,
  };
}

function makeHost(): {
  host: {
    state: TUIState;
    setAppState: (patch: {
      researchMode?: boolean;
      researchModePhase?: 'inactive' | 'probing' | 'ready' | 'degraded';
      researchLoopStatus?: 'active' | 'paused';
    }) => void;
    syncTodoPanelSlot: () => void;
    getResearchSession: () => Session | undefined;
  };
  todoPanelContainer: Container;
  todoPanel: TodoPanelComponent;
  researchBoard: ResearchBoardComponent;
  ui: { requestRender: () => void };
  getResearchSession: ReturnType<typeof vi.fn>;
} {
  const todoPanelContainer = new Container();
  const todoPanel = new TodoPanelComponent();
  const researchBoard = new ResearchBoardComponent();
  const ui = { requestRender: vi.fn() };
  const state = {
    researchBoard,
    todoPanel,
    todoPanelContainer,
    ui,
  } as unknown as TUIState;
  const setAppState = vi.fn();
  const syncTodoPanelSlot = vi.fn(() => {
    researchBoard.setTodos(todoPanel.getTodos());
    todoPanelContainer.clear();
    if (researchBoard.isVisible()) todoPanelContainer.addChild(researchBoard);
    else if (!todoPanel.isEmpty()) todoPanelContainer.addChild(todoPanel);
  });
  const getResearchSession = vi.fn<() => Session | undefined>(() => undefined);
  const host = {
    state,
    setAppState,
    syncTodoPanelSlot,
    getResearchSession,
  } as unknown as {
    state: TUIState;
    setAppState: (patch: {
      researchMode?: boolean;
      researchModePhase?: 'inactive' | 'probing' | 'ready' | 'degraded';
      researchLoopStatus?: 'active' | 'paused';
    }) => void;
    syncTodoPanelSlot: () => void;
    getResearchSession: () => Session | undefined;
  };
  return { host, todoPanelContainer, todoPanel, researchBoard, ui, getResearchSession };
}
describe('ResearchController', () => {
  beforeEach(() => {
    setExperimentalFeatures([
      { id: 'aitp_research_mode', enabled: true },
    ]);
  });

  it('setSnapshot updates the board and sets researchMode true when mode is ready', () => {
    const { host, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    const snapshot = makeSnapshot({ mode: 'ready' });
    controller.setSnapshot(snapshot);
    expect(researchBoard.getSnapshot()).toBe(snapshot);
    expect(host.setAppState).toHaveBeenCalledWith(
      expect.objectContaining({ researchMode: true, researchModePhase: 'ready', researchLoopStatus: 'active' }),
    );
  });

  it('setSnapshot sets researchMode false when mode is inactive', () => {
    const { host } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ mode: 'inactive' }));
    expect(host.setAppState).toHaveBeenCalledWith(
      expect.objectContaining({ researchMode: false, researchModePhase: 'inactive' }),
    );
  });

  it('applySnapshot preserves unresolved human attention in the board projection', () => {
    const { host, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    const session = { getResearch: vi.fn() } as unknown as Session;
    const token = controller.beginRequest(session);
    const gate = {
      gateId: 'gate-1',
      kind: 'review' as const,
      prompt: 'Review the derivation before continuing.',
      createdAt: 10,
    };
    const alert = {
      fingerprint: 'alert-fingerprint',
      kind: 'contradiction' as const,
      message: 'The latest result conflicts with prior evidence.',
      createdAt: 11,
    };
    const snapshot = makeSnapshot({
      phase: 'awaiting_human',
      humanGate: gate,
      alerts: [alert],
      revision: 2,
    });

    expect(token).toBeDefined();
    expect(controller.applySnapshot(token!, snapshot)).toBe(true);
    expect(researchBoard.getSnapshot()).toBe(snapshot);
    expect(researchBoard.getSnapshot()?.humanGate).toEqual(gate);
    expect(researchBoard.getSnapshot()?.alerts).toEqual([alert]);
    expect(host.setAppState).toHaveBeenCalledWith(
      expect.objectContaining({ researchMode: true, researchModePhase: 'ready' }),
    );
  });

  it('clear clears the board and sets researchMode false', () => {
    const { host, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot());
    expect(researchBoard.isVisible()).toBe(true);
    controller.clear();
    expect(researchBoard.isEmpty()).toBe(true);
    expect(host.setAppState).toHaveBeenCalledWith(
      expect.objectContaining({ researchMode: false, researchModePhase: 'inactive' }),
    );
  });

  it('getSnapshotRevision returns the current revision', () => {
    const { host } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ revision: 42 }));
    expect(controller.getSnapshotRevision()).toBe(42);
  });

  it('board visible takes priority over Todo in the container', () => {
    const { host, todoPanelContainer, todoPanel } = makeHost();
    todoPanel.setTodos([{ title: 'Task 1', status: 'pending' }]);
    todoPanelContainer.addChild(todoPanel);
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ mode: 'ready' }));
    // Container should have the research board, not the todo panel
    expect(todoPanelContainer.children.length).toBe(1);
    expect(todoPanelContainer.children[0]).toBe(host.state.researchBoard);
    // Todo state should be preserved
    expect(todoPanel.getTodos().length).toBe(1);
  });

  it('Todo updates keep the visible board mounted and update its projection', () => {
    const { host, todoPanelContainer, todoPanel, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ mode: 'ready' }));

    const streaming = new StreamingUIController({
      state: host.state,
      syncTodoPanelSlot: host.syncTodoPanelSlot,
    } as unknown as ConstructorParameters<typeof StreamingUIController>[0]);
    streaming.setTodoList([
      { title: 'Investigate evidence', status: 'in_progress' },
      { title: 'Write closeout', status: 'pending' },
    ]);

    expect(todoPanelContainer.children).toEqual([researchBoard]);
    expect(todoPanel.getTodos()).toHaveLength(2);
    expect(researchBoard.getTodos()).toEqual(todoPanel.getTodos());
  });

  it('board hidden restores Todo panel when it has items', () => {
    const { host, todoPanelContainer, todoPanel } = makeHost();
    todoPanel.setTodos([{ title: 'Task 1', status: 'pending' }]);
    const controller = new ResearchController(host);
    // First show the board
    controller.setSnapshot(makeSnapshot({ mode: 'ready' }));
    expect(todoPanelContainer.children[0]).toBe(host.state.researchBoard);
    // Then hide it (mode becomes inactive)
    controller.setSnapshot(makeSnapshot({ mode: 'inactive' }));
    // Todo panel should be restored
    expect(todoPanelContainer.children[0]).toBe(todoPanel);
  });

  it('board hidden does not restore empty Todo panel', () => {
    const { host, todoPanelContainer } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ mode: 'ready' }));
    controller.setSnapshot(makeSnapshot({ mode: 'inactive' }));
    expect(todoPanelContainer.children.length).toBe(0);
  });

  it('hydrate does not call getResearch when flag is off', async () => {
    setExperimentalFeatures([]);
    const { host } = makeHost();
    const controller = new ResearchController(host);
    const getResearch = vi.fn();
    const session = { getResearch } as unknown as Parameters<ResearchController['hydrate']>[0];
    await controller.hydrate(session);
    expect(getResearch).not.toHaveBeenCalled();
  });

  it('hydrate calls getResearch and updates board when flag is on', async () => {
    const { host, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    const snapshot = makeSnapshot({ mode: 'ready' });
    const getResearch = vi.fn(async () => snapshot);
    const session = { getResearch } as unknown as Parameters<ResearchController['hydrate']>[0];
    await controller.hydrate(session);
    expect(getResearch).toHaveBeenCalled();
    expect(researchBoard.getSnapshot()).toBe(snapshot);
  });

  it('hydrate swallows getResearch errors', async () => {
    const { host } = makeHost();
    const controller = new ResearchController(host);
    const getResearch = vi.fn(async () => {
      throw new Error('not available');
    });
    const session = { getResearch } as unknown as Parameters<ResearchController['hydrate']>[0];
    await controller.hydrate(session);
    // Should not throw, should not update board
    expect(host.state.researchBoard.getSnapshot()).toBeNull();
  });

  it('live setSnapshot beats stale hydrate result', async () => {
    const { host, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    const staleSnapshot = makeSnapshot({ mode: 'ready', revision: 1 });
    const liveSnapshot = makeSnapshot({ mode: 'ready', revision: 2 });

    let resolveGetResearch!: (s: ResearchStatusSnapshot) => void;
    const getResearch = vi.fn(
      () => new Promise<ResearchStatusSnapshot>((resolve) => { resolveGetResearch = resolve; }),
    );
    const session = { getResearch } as unknown as Parameters<ResearchController['hydrate']>[0];

    // Start hydrate — it suspends on getResearch.
    const hydratePromise = controller.hydrate(session);
    expect(getResearch).toHaveBeenCalledOnce();

    // A live research.updated arrives before the round-trip resolves.
    controller.setSnapshot(liveSnapshot);
    expect(researchBoard.getSnapshot()).toBe(liveSnapshot);

    // The stale getResearch now resolves.
    resolveGetResearch(staleSnapshot);
    await hydratePromise;

    // The stale snapshot must be discarded — the board keeps the live one.
    expect(researchBoard.getSnapshot()).toBe(liveSnapshot);
  });

  it('clear beats stale hydrate result', async () => {
    const { host, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    const staleSnapshot = makeSnapshot({ mode: 'ready', revision: 1 });

    let resolveGetResearch!: (s: ResearchStatusSnapshot) => void;
    const getResearch = vi.fn(
      () => new Promise<ResearchStatusSnapshot>((resolve) => { resolveGetResearch = resolve; }),
    );
    const session = { getResearch } as unknown as Parameters<ResearchController['hydrate']>[0];

    // Start hydrate — it suspends on getResearch.
    const hydratePromise = controller.hydrate(session);

    // Session resets and clears the board before hydrate resolves.
    controller.clear();
    expect(researchBoard.isEmpty()).toBe(true);

    // The stale getResearch now resolves.
    resolveGetResearch(staleSnapshot);
    await hydratePromise;

    // The board must still be empty — stale snapshot discarded.
    expect(researchBoard.isEmpty()).toBe(true);
    expect(researchBoard.getSnapshot()).toBeNull();
  });

  it('isBoardVisible returns true when board is visible', () => {
    const { host } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ mode: 'ready' }));
    expect(controller.isBoardVisible()).toBe(true);
  });

  it('isBoardVisible returns false when board is hidden', () => {
    const { host } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ mode: 'inactive' }));
    expect(controller.isBoardVisible()).toBe(false);
  });

  it('setSnapshot with probing mode mounts the board in the Todo slot immediately', () => {
    const { host, todoPanelContainer, todoPanel } = makeHost();
    todoPanel.setTodos([{ title: 'Task 1', status: 'pending' }]);
    todoPanelContainer.addChild(todoPanel);
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ mode: 'probing' }));
    // Board is in the container synchronously — no async event needed.
    expect(todoPanelContainer.children[0]).toBe(host.state.researchBoard);
    expect(host.setAppState).toHaveBeenCalledWith(
      expect.objectContaining({ researchMode: true, researchModePhase: 'probing' }),
    );
  });

  it('returns no mutation revision for an inactive snapshot', () => {
    const { host } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ mode: 'inactive', revision: 8 }));
    expect(controller.getSnapshotRevision()).toBeUndefined();
  });

  it('rejects a lower revision without replacing the visible snapshot', () => {
    const { host, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    const current = makeSnapshot({ revision: 5 });
    const stale = makeSnapshot({ revision: 4, currentLineSlug: 'stale-line' });
    expect(controller.setSnapshot(current)).toBe(true);
    expect(controller.setSnapshot(stale)).toBe(false);
    expect(researchBoard.getSnapshot()).toBe(current);
  });

  it('rejects an old command token after a live snapshot supersedes it', () => {
    const { host, researchBoard, getResearchSession } = makeHost();
    const session = { getResearch: vi.fn() } as unknown as Session;
    getResearchSession.mockReturnValue(session);
    const controller = new ResearchController(host);
    controller.bindSession(session);
    const token = controller.beginRequest(session);
    expect(token).toBeDefined();
    const live = makeSnapshot({ revision: 3, currentLineSlug: 'live-line' });
    controller.setSnapshot(live);
    expect(controller.applySnapshot(token!, makeSnapshot({ revision: 2 }))).toBe(false);
    expect(researchBoard.getSnapshot()).toBe(live);
  });

  it('drops a hydrate result when the session identity changes', async () => {
    const { host, researchBoard, getResearchSession } = makeHost();
    const oldSession = { getResearch: vi.fn() } as unknown as Session;
    const newSession = { getResearch: vi.fn(async () => makeSnapshot({ revision: 1 })) } as unknown as Session;
    getResearchSession.mockReturnValue(oldSession);
    let resolveOld!: (snapshot: ResearchStatusSnapshot) => void;
    oldSession.getResearch = vi.fn(
      () => new Promise<ResearchStatusSnapshot>((resolve) => { resolveOld = resolve; }),
    );
    const controller = new ResearchController(host);
    const hydrate = controller.hydrate(oldSession);
    getResearchSession.mockReturnValue(newSession);
    controller.clear();
    controller.bindSession(newSession);
    const current = makeSnapshot({ revision: 1, currentLineSlug: 'new-line' });
    controller.setSnapshot(current);
    resolveOld(makeSnapshot({ revision: 9, currentLineSlug: 'old-line' }));
    await hydrate;
    expect(researchBoard.getSnapshot()).toBe(current);
  });

  it('keeps Todo projection and expansion stable across live Research/Todo interleaving', () => {
    const { host, todoPanelContainer, todoPanel, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ revision: 1 }));
    researchBoard.setExpanded(true);
    const streaming = new StreamingUIController({
      state: host.state,
      syncTodoPanelSlot: host.syncTodoPanelSlot,
    } as unknown as ConstructorParameters<typeof StreamingUIController>[0]);
    streaming.setTodoList([{ title: 'Research Todo', status: 'in_progress' }]);
    controller.setSnapshot(makeSnapshot({ revision: 2, currentLineSlug: 'new-line' }));
    expect(todoPanelContainer.children).toEqual([researchBoard]);
    expect(researchBoard.isExpanded()).toBe(true);
    expect(researchBoard.getTodos()).toEqual([
      { title: 'Research Todo', status: 'in_progress' },
    ]);
    controller.clear();
    expect(todoPanelContainer.children).toEqual([todoPanel]);
  });
});
