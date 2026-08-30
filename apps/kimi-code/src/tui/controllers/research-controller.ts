/**
 * ResearchController — owns the research board's lifecycle and hydration.
 *
 * Session-lifecycle safety: every async Research read or command carries both
 * the session object it started from and a monotonic request generation. Live
 * snapshots and session resets advance that generation, so an older response
 * cannot remount the Board or roll the visible snapshot backwards.
 */

import type { Session, ResearchStatusSnapshot } from '@bhjia-phys/hakimi-sdk';

import type { TUIState } from '../tui-state';

export interface ResearchRequestToken {
  readonly session: Session;
  readonly generation: number;
}

export interface ResearchControllerHost {
  readonly state: TUIState;
  getResearchSession(): Session | undefined;
  setAppState(patch: {
    researchMode?: boolean;
    researchModePhase?: 'inactive' | 'probing' | 'ready' | 'degraded';
    researchLoopStatus?: 'active' | 'paused';
  }): void;
  syncTodoPanelSlot(): void;
}

export class ResearchController {
  private generation = 0;
  private currentSession: Session | undefined;

  constructor(private readonly host: ResearchControllerHost) {}

  /** Bind the session identity used to validate all later async results. */
  bindSession(session: Session | undefined): void {
    if (this.currentSession === session) return;
    this.currentSession = session;
    this.generation++;
  }

  /**
   * Start a TUI-local Research request. A missing/mismatched host session means
   * the request was started during a session transition and must not apply.
   */
  beginRequest(session: Session): ResearchRequestToken | undefined {
    const hostSession = this.host.getResearchSession();
    if (hostSession !== undefined && hostSession !== session) return undefined;
    if (this.currentSession !== session) this.bindSession(session);
    this.generation++;
    return { session, generation: this.generation };
  }

  /** Whether a token still belongs to the current session and request turn. */
  isCurrentRequest(token: ResearchRequestToken): boolean {
    return this.isCurrentSession(token.session) && token.generation === this.generation;
  }

  /** Apply an async response only if it is still the current request. */
  applySnapshot(
    token: ResearchRequestToken,
    snapshot: ResearchStatusSnapshot | null,
  ): boolean {
    if (!this.isCurrentRequest(token)) return false;
    return this.setSnapshot(snapshot, token.session);
  }

  private isCurrentSession(session: Session): boolean {
    const hostSession = this.host.getResearchSession();
    return (
      this.currentSession === session &&
      (hostSession === undefined || hostSession === session)
    );
  }

  /**
   * Hydrate the board when a session is started, resumed, or replaced. An
   * `inactive` snapshot hides the board without probing AITP.
   */
  async hydrate(session: Session): Promise<void> {
    const token = this.beginRequest(session);
    if (token === undefined) return;
    let snapshot: ResearchStatusSnapshot;
    try {
      snapshot = await session.getResearch();
    } catch {
      return;
    }
    this.applySnapshot(token, snapshot);
  }

  /**
   * Live event handler for `research.updated`. Every accepted event supersedes
   * in-flight reads and commands. A lower revision from the same session is
   * ignored even when it arrives through the live path out of order. The
   * optional session is supplied by the subscription so an old Session object
   * cannot update a replacement session with the same id.
   */
  setSnapshot(
    snapshot: ResearchStatusSnapshot | null,
    session?: Session,
  ): boolean {
    if (session !== undefined && !this.isCurrentSession(session)) return false;
    const { state } = this.host;
    const current = state.researchBoard.getSnapshot();
    if (
      snapshot !== null &&
      current !== null &&
      snapshot.revision < current.revision
    ) {
      return false;
    }
    this.generation++;

    state.researchBoard.setSnapshot(snapshot);
    const phase = snapshot?.mode ?? 'inactive';
    this.host.setAppState({
      researchMode: phase !== 'inactive',
      researchModePhase: phase,
      researchLoopStatus: snapshot?.loopStatus,
    });
    this.host.syncTodoPanelSlot();
    state.ui.requestRender();
    return true;
  }

  /** Clear the board and invalidate all requests (session reset / close). */
  clear(): void {
    this.currentSession = undefined;
    this.generation++;
    const { state } = this.host;
    state.researchBoard.clear();
    this.host.setAppState({
      researchMode: false,
      researchModePhase: 'inactive',
      researchLoopStatus: undefined,
    });
    this.host.syncTodoPanelSlot();
    state.ui.requestRender();
  }

  /** Get the current active snapshot revision for optimistic concurrency. */
  getSnapshotRevision(): number | undefined {
    return this.host.state.researchBoard.getSnapshotRevision();
  }

  /** The board is visible and occupying the Todo slot. */
  isBoardVisible(): boolean {
    return this.host.state.researchBoard.isVisible();
  }
}
