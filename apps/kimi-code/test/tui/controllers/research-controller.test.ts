import { Container, type TUI } from '@moonshot-ai/pi-tui';
import { describe, expect, it, vi } from 'vitest';

import { ResearchController } from '#/tui/controllers/research-controller';
import { StreamingUIController } from '#/tui/controllers/streaming-ui';
import { ResearchBoardComponent } from '#/tui/components/chrome/research-board';
import { TodoPanelComponent } from '#/tui/components/chrome/todo-panel';
import type { ResearchModeSnapshot, Session } from '@bhjia-phys/hakimi-sdk';
import type { TUIState } from '#/tui/tui-state';

function makeSnapshot(
  overrides: Partial<ResearchModeSnapshot> = {},
): ResearchModeSnapshot {
  return {
    enabled: true,
    skillsAvailable: true,
    ...overrides,
  };
}

function makeHost(): {
  host: {
    state: TUIState;
    setAppState: (patch: { researchMode?: boolean }) => void;
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
    if (!todoPanel.isEmpty()) todoPanelContainer.addChild(todoPanel);
  });
  const getResearchSession = vi.fn<() => Session | undefined>(() => undefined);
  const host = {
    state,
    setAppState,
    syncTodoPanelSlot,
    getResearchSession,
  } as unknown as {
    state: TUIState;
    setAppState: (patch: { researchMode?: boolean }) => void;
    syncTodoPanelSlot: () => void;
    getResearchSession: () => Session | undefined;
  };
  return { host, todoPanelContainer, todoPanel, researchBoard, ui, getResearchSession };
}
describe('ResearchController', () => {
  it('setSnapshot updates the board and sets researchMode true when enabled', () => {
    const { host, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    const snapshot = makeSnapshot({ enabled: true });
    controller.setSnapshot(snapshot);
    expect(researchBoard.getSnapshot()).toBe(snapshot);
    expect(host.setAppState).toHaveBeenCalledWith(
      expect.objectContaining({ researchMode: true }),
    );
  });

  it('setSnapshot sets researchMode false when disabled', () => {
    const { host } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ enabled: false }));
    expect(host.setAppState).toHaveBeenCalledWith(
      expect.objectContaining({ researchMode: false }),
    );
  });

  it('setSnapshot(null) hides the board and clears researchMode', () => {
    const { host, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot());
    controller.setSnapshot(null);
    expect(researchBoard.isVisible()).toBe(false);
    expect(host.setAppState).toHaveBeenLastCalledWith(
      expect.objectContaining({ researchMode: false }),
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
      expect.objectContaining({ researchMode: false }),
    );
  });

  it('shows the board alongside Todo in the container', () => {
    const { host, todoPanelContainer, todoPanel } = makeHost();
    todoPanel.setTodos([{ title: 'Task 1', status: 'pending' }]);
    todoPanelContainer.addChild(todoPanel);
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ enabled: true }));
    expect(todoPanelContainer.children).toEqual([host.state.researchBoard, todoPanel]);
    expect(todoPanelContainer.render(120).join('\n')).toContain('Task 1');
  });

  it('Todo updates keep the visible board mounted and update its projection', () => {
    const { host, todoPanelContainer, todoPanel, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ enabled: true }));

    const streaming = new StreamingUIController({
      state: host.state,
      syncTodoPanelSlot: host.syncTodoPanelSlot,
    } as unknown as ConstructorParameters<typeof StreamingUIController>[0]);
    streaming.setTodoList([
      { title: 'Investigate evidence', status: 'in_progress' },
      { title: 'Write closeout', status: 'pending' },
    ]);

    expect(todoPanelContainer.children).toEqual([researchBoard, todoPanel]);
    expect(todoPanel.getTodos()).toHaveLength(2);
    expect(researchBoard.getTodos()).toEqual(todoPanel.getTodos());
  });

  it('keeps the Todo panel mounted when the board is hidden', () => {
    const { host, todoPanelContainer, todoPanel } = makeHost();
    todoPanel.setTodos([{ title: 'Task 1', status: 'pending' }]);
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ enabled: true }));
    expect(todoPanelContainer.children).toEqual([host.state.researchBoard, todoPanel]);
    controller.setSnapshot(makeSnapshot({ enabled: false }));
    expect(todoPanelContainer.children).toEqual([todoPanel]);
  });

  it('board hidden does not restore empty Todo panel', () => {
    const { host, todoPanelContainer } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ enabled: true }));
    controller.setSnapshot(makeSnapshot({ enabled: false }));
    expect(todoPanelContainer.children.length).toBe(0);
  });

  it('hydrates a disabled snapshot and keeps the Board hidden', async () => {
    const { host, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    const getResearch = vi.fn(async () => makeSnapshot({ enabled: false }));
    const session = { getResearch } as unknown as Parameters<ResearchController['hydrate']>[0];
    await controller.hydrate(session);
    expect(getResearch).toHaveBeenCalledOnce();
    expect(researchBoard.isVisible()).toBe(false);
    expect(host.state.researchBoard.getSnapshot()?.enabled).toBe(false);
  });

  it('hydrate updates the board from an enabled snapshot', async () => {
    const { host, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    const snapshot = makeSnapshot({ enabled: true });
    const getResearch = vi.fn(async () => snapshot);
    const session = { getResearch } as unknown as Parameters<ResearchController['hydrate']>[0];
    await controller.hydrate(session);
    expect(getResearch).toHaveBeenCalled();
    expect(researchBoard.getSnapshot()).toBe(snapshot);
    expect(researchBoard.isVisible()).toBe(true);
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
    const staleSnapshot = makeSnapshot({ enabled: false });
    const liveSnapshot = makeSnapshot({ enabled: true });

    let resolveGetResearch!: (s: ResearchModeSnapshot) => void;
    const getResearch = vi.fn(
      () => new Promise<ResearchModeSnapshot>((resolve) => { resolveGetResearch = resolve; }),
    );
    const session = { getResearch } as unknown as Parameters<ResearchController['hydrate']>[0];

    // Start hydrate — it suspends on getResearch.
    const hydratePromise = controller.hydrate(session);
    expect(getResearch).toHaveBeenCalledOnce();

    // A live research_mode.updated arrives before the round-trip resolves.
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
    const staleSnapshot = makeSnapshot({ enabled: true });

    let resolveGetResearch!: (s: ResearchModeSnapshot) => void;
    const getResearch = vi.fn(
      () => new Promise<ResearchModeSnapshot>((resolve) => { resolveGetResearch = resolve; }),
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
    controller.setSnapshot(makeSnapshot({ enabled: true }));
    expect(controller.isBoardVisible()).toBe(true);
  });

  it('isBoardVisible returns false when board is hidden', () => {
    const { host } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ enabled: false }));
    expect(controller.isBoardVisible()).toBe(false);
  });

  it('rejects an old command token after a live snapshot supersedes it', () => {
    const { host, researchBoard, getResearchSession } = makeHost();
    const session = { getResearch: vi.fn() } as unknown as Session;
    getResearchSession.mockReturnValue(session);
    const controller = new ResearchController(host);
    controller.bindSession(session);
    const token = controller.beginRequest(session);
    expect(token).toBeDefined();
    const live = makeSnapshot({ enabled: true });
    controller.setSnapshot(live);
    expect(controller.applySnapshot(token!, makeSnapshot({ enabled: false }))).toBe(false);
    expect(researchBoard.getSnapshot()).toBe(live);
  });

  it('drops a hydrate result when the session identity changes', async () => {
    const { host, researchBoard, getResearchSession } = makeHost();
    const oldSession = { getResearch: vi.fn() } as unknown as Session;
    const newSession = { getResearch: vi.fn(async () => makeSnapshot()) } as unknown as Session;
    getResearchSession.mockReturnValue(oldSession);
    let resolveOld!: (snapshot: ResearchModeSnapshot) => void;
    oldSession.getResearch = vi.fn(
      () => new Promise<ResearchModeSnapshot>((resolve) => { resolveOld = resolve; }),
    );
    const controller = new ResearchController(host);
    const hydrate = controller.hydrate(oldSession);
    getResearchSession.mockReturnValue(newSession);
    controller.clear();
    controller.bindSession(newSession);
    const current = makeSnapshot({ enabled: true, skillsAvailable: false });
    controller.setSnapshot(current);
    resolveOld(makeSnapshot({ enabled: false }));
    await hydrate;
    expect(researchBoard.getSnapshot()).toBe(current);
  });

  it('keeps Todo projection and expansion stable across live Research/Todo interleaving', () => {
    const { host, todoPanelContainer, todoPanel, researchBoard } = makeHost();
    const controller = new ResearchController(host);
    controller.setSnapshot(makeSnapshot({ enabled: true }));
    researchBoard.setExpanded(true);
    const streaming = new StreamingUIController({
      state: host.state,
      syncTodoPanelSlot: host.syncTodoPanelSlot,
    } as unknown as ConstructorParameters<typeof StreamingUIController>[0]);
    streaming.setTodoList([{ title: 'Research Todo', status: 'in_progress' }]);
    controller.setSnapshot(makeSnapshot({ enabled: true, skillsAvailable: false }));
    expect(todoPanelContainer.children).toEqual([researchBoard, todoPanel]);
    expect(researchBoard.isExpanded()).toBe(true);
    expect(researchBoard.getTodos()).toEqual([
      { title: 'Research Todo', status: 'in_progress' },
    ]);
    controller.clear();
    expect(todoPanelContainer.children).toEqual([todoPanel]);
  });
});
