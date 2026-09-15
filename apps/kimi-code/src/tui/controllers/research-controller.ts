/**
 * ResearchController — owns the research board's lifecycle and hydration.
 *
 * Research Mode is a lightweight toggle (local knowledge + official AITP
 * Skills visibility); the snapshot is just `{ enabled, skillsAvailable }`.
 * The legacy executor's revision/optimistic-concurrency machinery is gone.
 *
 * Session-lifecycle safety: every async Research read or command carries both
 * the session object it started from and a monotonic request generation. Live
 * snapshots and session resets advance that generation, so an older response
 * cannot remount the Board or roll the visible snapshot backwards.
 */

import type { Session, ResearchModeSnapshot } from '@bhjia-phys/hakimi-sdk';

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
    snapshot: ResearchModeSnapshot | null,
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
   * Hydrate the board when a session is started, resumed, or replaced. A
   * disabled snapshot hides the board without probing anything else.
   */
  async hydrate(session: Session): Promise<void> {
    const token = this.beginRequest(session);
    if (token === undefined) return;
    let snapshot: ResearchModeSnapshot;
    try {
      snapshot = await session.getResearch();
    } catch {
      return;
    }
    this.applySnapshot(token, snapshot);
  }

  /**
   * Live event handler for `research_mode.updated`. Every accepted event
   * supersedes in-flight reads and commands. The optional session is supplied
   * by the subscription so an old Session object cannot update a replacement
   * session with the same id.
   */
  setSnapshot(
    snapshot: ResearchModeSnapshot | null,
    session?: Session,
  ): boolean {
    if (session !== undefined && !this.isCurrentSession(session)) return false;
    this.generation++;

    this.host.state.researchBoard.setSnapshot(snapshot);
    this.host.setAppState({
      researchMode: snapshot?.enabled ?? false,
    });
    this.host.syncTodoPanelSlot();
    this.host.state.ui.requestRender();
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
    });
    this.host.syncTodoPanelSlot();
    state.ui.requestRender();
  }

  /** The board is visible and occupying the Todo slot. */
  isBoardVisible(): boolean {
    return this.host.state.researchBoard.isVisible();
  }
}
