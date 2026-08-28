import type { ResearchStatusSnapshot } from '../../api/types';

export interface ResearchRequestState {
  researchBySession: Record<string, ResearchStatusSnapshot>;
  researchVersionBySession: Record<string, number>;
  researchRequestGenerationBySession: Record<string, number>;
}

export interface ResearchRequestToken {
  generation: number;
  liveVersion: number;
}

/** Start any Research GET or mutation. One shared per-session generation keeps
 * responses from overlapping reads and writes from committing out of order. */
export function beginResearchRequest(
  state: ResearchRequestState,
  sessionId: string,
): ResearchRequestToken {
  const generation = (state.researchRequestGenerationBySession[sessionId] ?? 0) + 1;
  state.researchRequestGenerationBySession = {
    ...state.researchRequestGenerationBySession,
    [sessionId]: generation,
  };
  return {
    generation,
    liveVersion: state.researchVersionBySession[sessionId] ?? 0,
  };
}

/** Commit only the latest Research request, and never replace a live WS update
 * that arrived after the request started. */
export function applyResearchResponseIfCurrent(
  state: ResearchRequestState,
  sessionId: string,
  token: ResearchRequestToken,
  snapshot: ResearchStatusSnapshot,
): boolean {
  if (state.researchRequestGenerationBySession[sessionId] !== token.generation) {
    return false;
  }
  if ((state.researchVersionBySession[sessionId] ?? 0) !== token.liveVersion) {
    return false;
  }
  state.researchBySession = {
    ...state.researchBySession,
    [sessionId]: snapshot,
  };
  return true;
}

export interface ResearchRequestCoordinator {
  read: (
    state: ResearchRequestState,
    sessionId: string,
    request: () => Promise<ResearchStatusSnapshot>,
  ) => Promise<ResearchStatusSnapshot>;
  mutate: (
    state: ResearchRequestState,
    sessionId: string,
    request: () => Promise<ResearchStatusSnapshot>,
  ) => Promise<ResearchStatusSnapshot>;
}

/** Coordinate Research HTTP work per session. Mutations run serially, and reads
 * requested after a mutation starts wait for the full mutation queue to settle.
 * The generation token also invalidates a read that was already in flight when
 * a mutation began. Different sessions remain independent. */
export function createResearchRequestCoordinator(): ResearchRequestCoordinator {
  const mutationTailBySession = new Map<string, Promise<void>>();

  function currentOrResponse(
    state: ResearchRequestState,
    sessionId: string,
    snapshot: ResearchStatusSnapshot,
  ): ResearchStatusSnapshot {
    return state.researchBySession[sessionId] ?? snapshot;
  }

  async function read(
    state: ResearchRequestState,
    sessionId: string,
    request: () => Promise<ResearchStatusSnapshot>,
  ): Promise<ResearchStatusSnapshot> {
    // A second mutation may be queued while this read is awaiting the first.
    // Keep following the current tail until the complete queue is drained.
    while (mutationTailBySession.has(sessionId)) {
      await mutationTailBySession.get(sessionId);
    }

    const token = beginResearchRequest(state, sessionId);
    const snapshot = await request();
    return applyResearchResponseIfCurrent(state, sessionId, token, snapshot)
      ? snapshot
      : currentOrResponse(state, sessionId, snapshot);
  }

  function mutate(
    state: ResearchRequestState,
    sessionId: string,
    request: () => Promise<ResearchStatusSnapshot>,
  ): Promise<ResearchStatusSnapshot> {
    const previousMutation = mutationTailBySession.get(sessionId) ?? Promise.resolve();
    const response = previousMutation.then(async () => {
      const token = beginResearchRequest(state, sessionId);
      const snapshot = await request();
      return applyResearchResponseIfCurrent(state, sessionId, token, snapshot)
        ? snapshot
        : currentOrResponse(state, sessionId, snapshot);
    });
    const settled = response.then(
      () => undefined,
      () => undefined,
    );
    mutationTailBySession.set(sessionId, settled);
    void settled.then(() => {
      if (mutationTailBySession.get(sessionId) === settled) {
        mutationTailBySession.delete(sessionId);
      }
    });
    return response;
  }

  return { read, mutate };
}
