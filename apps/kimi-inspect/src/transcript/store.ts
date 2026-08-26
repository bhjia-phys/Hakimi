/**
 * Per-(session, agent) transcript state for the chat view.
 *
 * A thin observable wrapper over the package's L1 convergence path
 * (`applyOperation` on an `AgentState`) — the reducer is NOT re-implemented
 * here. State arrives through exactly two channels:
 *
 *  - REST pages (`applyPage`): the only source of FULL state. A `replace`
 *    page (initial load / full refresh) is the newest slice and replaces
 *    local state wholesale, globals included; a non-replace page is an older
 *    slice fetched with `before_turn` and prepended ahead of the loaded
 *    window (items only — globals stay with the fresher live state).
 *  - WS delta ops (`applyOps`): incremental `transcript.ops` only. Ops are
 *    idempotent upserts plus offset-placed appends, so ops buffered while a
 *    REST refresh is in flight converge when flushed onto the fresh pages.
 *
 * `onGap` surfaces `append` placement gaps so the caller can trigger a full
 * REST refresh (the WS channel carries no snapshots to fall back on).
 */

import {
  applyOperation,
  EMPTY_AGENT_STATE,
  itemId,
  normalizeStandaloneItems,
  placementsFromContinuation,
  type AgentState,
  type StandalonePlacement,
  type TranscriptContinuation,
  type TranscriptItem,
  type TranscriptOperation,
} from '@moonshot-ai/transcript';

import type { TranscriptPage } from './api';

export function countTurns(items: readonly TranscriptItem[]): number {
  let count = 0;
  for (const item of items) if (item.kind === 'turn') count += 1;
  return count;
}

export function oldestTurnId(items: readonly TranscriptItem[]): string | undefined {
  for (const item of items) if (item.kind === 'turn') return item.turnId;
  return undefined;
}

export function hasTurnId(items: readonly TranscriptItem[], turnId: string): boolean {
  return items.some((item) => item.kind === 'turn' && item.turnId === turnId);
}

/**
 * Re-cover a previously loaded window after a full refresh: page backwards
 * until `prevOldestTurnId` (the window's oldest turn before the refresh) is
 * loaded again. A count-based stop silently drops the window's head when new
 * turns arrived meanwhile (the server window shifted, so the same count no
 * longer reaches as far back). Stops at the oldest available page
 * (`hasMoreOlder` false), on a no-progress page, or when `isDisposed`.
 */
export async function recoverLoadedWindow(
  store: TranscriptChatStore,
  prevOldestTurnId: string | undefined,
  fetchPage: (beforeTurn: string) => Promise<TranscriptPage>,
  isDisposed: () => boolean,
  onPageApplied?: (page: TranscriptPage) => void,
): Promise<void> {
  if (prevOldestTurnId === undefined) return;
  while (!hasTurnId(store.getState().items, prevOldestTurnId) && store.getState().hasMoreOlder) {
    const oldest = oldestTurnId(store.getState().items);
    if (oldest === undefined) break;
    const before = countTurns(store.getState().items);
    const page = await fetchPage(oldest);
    if (isDisposed()) return;
    store.applyPage(page);
    onPageApplied?.(page);
    if (countTurns(store.getState().items) === before) break;
  }
}

/**
 * Serialize refresh-style triggers: at most one run in flight; a trigger that
 * arrives while a run is in flight is coalesced into exactly one follow-up run
 * (so a subscribe ack landing mid-load still produces a post-load reconcile
 * instead of being dropped).
 */
export function createCoalescedRunner(run: () => Promise<void>): () => void {
  let running = false;
  let queued = false;
  const kick = (): void => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    void run().finally(() => {
      running = false;
      if (queued) {
        queued = false;
        kick();
      }
    });
  };
  return kick;
}

/**
 * Merge an older page's continuation into the retained placement memory on a
 * prepend: every entry that hydrates against the page's OWN items (ids the
 * page does not carry drop out) fills a placement the retained memory does
 * not already have. An already-placed item keeps its existing placement,
 * which the fresher live state owns; an item the older page merely repeats —
 * loaded into the window without an anchor, e.g. a live-arrived duplicate —
 * gets its missing placement filled from the page. Fresh items without an
 * entry stay unplaced. Returns `current` (same reference) when nothing would
 * be added, so the caller can tell a pure placement fill from no change at
 * all; the map is copied on write: neither the previous state map nor the
 * page's data is mutated or referenced.
 */
function mergedPrependPlacements(
  current: ReadonlyMap<string, StandalonePlacement> | undefined,
  pageItems: readonly TranscriptItem[],
  continuation: TranscriptContinuation | undefined,
): ReadonlyMap<string, StandalonePlacement> | undefined {
  const incoming = placementsFromContinuation(pageItems, continuation);
  if (incoming.size === 0) return current;
  let next: Map<string, StandalonePlacement> | undefined;
  for (const [id, placement] of incoming) {
    if (current?.has(id) === true) continue;
    if (next === undefined) next = new Map(current);
    next.set(id, placement);
  }
  return next ?? current;
}

export class TranscriptChatStore {
  private state: AgentState = EMPTY_AGENT_STATE;
  private readonly listeners = new Set<() => void>();

  /** Called when an `append` op could not be placed — the caller should refresh. */
  onGap: (() => void) | undefined;

  getState(): AgentState {
    return this.state;
  }

  /** `useSyncExternalStore`-compatible subscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Merge one REST page. With `replace`, the page is the newest slice and
   * becomes the whole state (initial load / full refresh) — trusted as the
   * server layout, never re-ordered here; otherwise it is an older slice
   * prepended ahead of the window (deduped by item id), updating only
   * `items`, `hasMoreOlder` and the placement memory (see
   * `mergedPrependPlacements`). The merged window is then re-normalized
   * through the package's `normalizeStandaloneItems`, so a placement the
   * page fills for an already-loaded item re-anchors it on this pass instead
   * of waiting for a later op.
   */
  applyPage(page: TranscriptPage, opts?: { replace?: boolean }): void {
    if (opts?.replace === true) {
      this.state = {
        items: page.items,
        tasks: new Map(page.tasks.map((task) => [task.taskId, task])),
        interactions: new Map(
          page.interactions.map((interaction) => [interaction.interactionId, interaction]),
        ),
        attachments: new Map(
          page.attachments.map((attachment) => [attachment.attachmentId, attachment]),
        ),
        todos: new Map(page.todos.map((todo) => [todo.todoId, todo])),
        // The page contract carries no prompt slice yet; prompt.upsert ops
        // still accumulate through the shared reducer between refreshes.
        prompts: new Map(),
        meta: page.meta,
        pendingInteractions: new Set(page.pendingInteractions),
        hasMoreOlder: page.hasMoreOlder,
        // Hydrate the reducer's placement memory from the page's continuation
        // (absent on legacy servers → empty), exactly like a `reset` op.
        standalonePlacements: placementsFromContinuation(page.items, page.continuation),
      };
      this.notify();
      return;
    }
    const existing = new Set(this.state.items.map(itemId));
    const fresh = page.items.filter((item) => !existing.has(itemId(item)));
    // A pure placement fill counts as a change on its own: a page that
    // repeats only already-loaded items can still supply their missing
    // anchors, and that must not hit the early return (nor skip the notify).
    const placements = mergedPrependPlacements(
      this.state.standalonePlacements,
      page.items,
      page.continuation,
    );
    if (
      fresh.length === 0 &&
      page.hasMoreOlder === this.state.hasMoreOlder &&
      placements === this.state.standalonePlacements
    ) {
      return;
    }
    this.state = {
      ...this.state,
      items: normalizeStandaloneItems([...fresh, ...this.state.items], placements),
      hasMoreOlder: page.hasMoreOlder,
      standalonePlacements: placements,
    };
    this.notify();
  }

  /** Apply incremental WS ops; notifies once per changed batch. */
  applyOps(ops: readonly TranscriptOperation[]): void {
    let changed = false;
    for (const op of ops) {
      const result = applyOperation(this.state, op);
      if (result.gap !== undefined) this.onGap?.();
      if (!result.changed) continue;
      this.state = result.state;
      changed = true;
    }
    if (changed) this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
