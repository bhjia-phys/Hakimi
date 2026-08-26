/**
 * The single convergence path for L1.
 *
 * `applyOperation` is a pure, copy-on-write reducer: every op maps
 * `(state, op) → { state', ... }` where `state'` shares untouched branches
 * with `state`. All ops except `append` are state-style and idempotent —
 * replaying, duplicating, or reordering them converges to the same store.
 */

import type { AttachmentId, InteractionId, PromptId, TaskId, TodoId, TurnId } from '../model/ids';
import { turnOrdinal } from '../model/ids';
import type { TranscriptAttachment } from '../model/attachment';
import type { TranscriptFrame } from '../model/frame';
import type { TranscriptInteraction } from '../model/interaction';
import type { TranscriptItem } from '../model/item';
import type { TranscriptMeta, TranscriptMetaMerge } from '../model/meta';
import type { TranscriptPrompt } from '../model/prompt';
import type { TranscriptTask } from '../model/task';
import type { TranscriptTodo } from '../model/todo';
import type { TranscriptStep, TranscriptTurn } from '../model/turn';
import type {
  AgentTranscriptSnapshot,
  AppendOp,
  StandalonePlacementBaselineEntry,
  TranscriptContinuation,
  TranscriptOperation,
  TurnHeader,
  StepHeader,
} from './operation';

/**
 * Remembered placement anchor for one standalone item (marker / taskref).
 * Reducer memory that lets the reducer re-derive the segment order once a
 * successor relation arrives, instead of relying on a second replay pass.
 * Crosses a process boundary only as the JSON-safe `TranscriptContinuation`
 * snapshot field (hydrated back by `placementsFromContinuation`) — the Map
 * itself never travels.
 */
export interface StandalonePlacement {
  readonly beforeTurn?: number;
  readonly beforeItem?: string;
}

/** Mutable-free aggregate state behind one AgentTranscript. */
export interface AgentState {
  readonly items: readonly TranscriptItem[];
  readonly tasks: ReadonlyMap<TaskId, TranscriptTask>;
  /** Global interaction entities (approvals / questions), keyed by id. */
  readonly interactions: ReadonlyMap<InteractionId, TranscriptInteraction>;
  /** Global attachment entities (media metadata), keyed by id. */
  readonly attachments: ReadonlyMap<AttachmentId, TranscriptAttachment>;
  /** Global todo documents (latest state), keyed by id. */
  readonly todos: ReadonlyMap<TodoId, TranscriptTodo>;
  /** Global prompt queue entities, keyed by id. */
  readonly prompts: ReadonlyMap<PromptId, TranscriptPrompt>;
  readonly meta: TranscriptMeta;
  /** Interaction ids currently in 'pending' state (derived index). */
  readonly pendingInteractions: ReadonlySet<InteractionId>;
  /** Set by windowed resets: older turns exist beyond the loaded window. */
  readonly hasMoreOlder: boolean;
  /**
   * Placement anchors remembered per standalone item id, kept even while the
   * item itself has not arrived yet, so successor-first or arbitrarily
   * shuffled application of a beforeItem chain converges on first pass.
   * Optional so hand-constructed legacy states predating this reducer-internal
   * field still typecheck and apply — reducers read it through
   * `placementsOf`, which treats an absent map as empty.
   */
  readonly standalonePlacements?: ReadonlyMap<string, StandalonePlacement>;
}

export const EMPTY_AGENT_STATE: AgentState = {
  items: [],
  tasks: new Map(),
  interactions: new Map(),
  attachments: new Map(),
  todos: new Map(),
  prompts: new Map(),
  meta: {},
  pendingInteractions: new Set(),
  hasMoreOlder: false,
  standalonePlacements: new Map(),
};

/** Shared empty placement memory for states that never carry the field. */
const EMPTY_STANDALONE_PLACEMENTS: ReadonlyMap<string, StandalonePlacement> = new Map();

/**
 * The state's placement memory, tolerating hand-constructed legacy states
 * that predate the field: an absent map reads as empty. Every reducer reads
 * through this instead of touching `state.standalonePlacements` directly, so
 * no code path ever calls `.get`/`.has` on `undefined`.
 */
function placementsOf(state: AgentState): ReadonlyMap<string, StandalonePlacement> {
  return state.standalonePlacements ?? EMPTY_STANDALONE_PLACEMENTS;
}

// ---------------------------------------------------------------- continuation

/** Standalone (marker / taskref) ids present in one item window. */
function standaloneIdsOf(items: readonly TranscriptItem[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.kind !== 'turn') ids.add(itemIdOf(item));
  }
  return ids;
}

/**
 * Resolve one placement's anchors against the standalone ids visible in the
 * item window at hand. `beforeItem` only refines a `beforeTurn` anchor and
 * never travels alone (the wire schema rejects it otherwise), so it is
 * visible only when `beforeTurn` is defined; a self successor (an item
 * cannot precede itself) or one outside the visible set — a paged-out
 * ghost, or a turn id — drops the `beforeItem` edge but keeps the turn
 * anchor; a placement left with no anchor at all carries no information and
 * resolves to undefined.
 */
function visiblePlacement(
  itemId: string,
  placement: StandalonePlacement,
  standaloneIds: ReadonlySet<string>,
): StandalonePlacement | undefined {
  const beforeItem =
    placement.beforeTurn !== undefined &&
    placement.beforeItem !== undefined &&
    placement.beforeItem !== itemId &&
    standaloneIds.has(placement.beforeItem)
      ? placement.beforeItem
      : undefined;
  if (placement.beforeTurn === undefined && beforeItem === undefined) return undefined;
  return { beforeTurn: placement.beforeTurn, beforeItem };
}

/**
 * Hydrate the placement memory from a snapshot's continuation. Only entries
 * that name a standalone item (marker / taskref) present in `items` AND keep
 * at least one visible anchor are kept — anything else is dropped instead of
 * failing the consumer. A self `beforeItem` clears (an item cannot precede
 * itself), exactly like the upsert path; a `beforeItem` naming an item
 * outside this window (a paged-out ghost, or a turn id) clears too, keeping
 * the turn anchor, and an entry left anchor-less by that clearing is dropped.
 * A `beforeItem` without `beforeTurn` (a pre-contract entry) never hydrates
 * either — `beforeItem` only refines the turn anchor — so such an entry drops
 * whole. A snapshot without a continuation (legacy peers) hydrates to an
 * empty memory.
 */
export function placementsFromContinuation(
  items: readonly TranscriptItem[],
  continuation: TranscriptContinuation | undefined,
): ReadonlyMap<string, StandalonePlacement> {
  const placements = new Map<string, StandalonePlacement>();
  if (continuation === undefined) return placements;
  const standaloneIds = standaloneIdsOf(items);
  for (const entry of continuation.standalonePlacements) {
    if (!standaloneIds.has(entry.itemId)) continue;
    const placement = visiblePlacement(entry.itemId, entry, standaloneIds);
    if (placement !== undefined) placements.set(entry.itemId, placement);
  }
  return placements;
}

/**
 * Project the placement memory onto exactly these items, in item order: one
 * entry per standalone item whose remembered placement keeps at least one
 * anchor visible inside this window. Placements whose item is absent from
 * `items` (paged out of a windowed snapshot) are NOT exposed, and neither is
 * a `beforeItem` successor outside the window — the edge falls back to its
 * turn anchor instead of leaking a cross-page id — so a consumer only ever
 * hydrates relations between items it can see. Returns undefined when nothing
 * qualifies, so anchor-free snapshots keep their pre-continuation shape.
 */
export function continuationForItems(
  items: readonly TranscriptItem[],
  placements: ReadonlyMap<string, StandalonePlacement> | undefined,
): TranscriptContinuation | undefined {
  if (placements === undefined || placements.size === 0) return undefined;
  const standaloneIds = standaloneIdsOf(items);
  const entries: StandalonePlacementBaselineEntry[] = [];
  for (const item of items) {
    if (item.kind === 'turn') continue;
    const id = itemIdOf(item);
    const placement = placements.get(id);
    if (placement === undefined) continue;
    const visible = visiblePlacement(id, placement, standaloneIds);
    if (visible === undefined) continue;
    entries.push({
      itemId: id,
      beforeTurn: visible.beforeTurn,
      beforeItem: visible.beforeItem,
    });
  }
  return entries.length === 0 ? undefined : { standalonePlacements: entries };
}

/**
 * Narrow a snapshot's continuation to one page of its items: entries naming
 * an item outside the page drop out (their anchor memory travels with the
 * page that carries the item itself), and a `beforeItem` edge whose successor
 * is not on the page falls back to its turn anchor — the page never leaks an
 * id it does not carry. Returns undefined when nothing remains, so pages
 * without anchored standalone items carry no continuation key.
 */
export function filterContinuation(
  snapshot: AgentTranscriptSnapshot,
  items: readonly TranscriptItem[],
): TranscriptContinuation | undefined {
  const continuation = snapshot.continuation;
  if (continuation === undefined) return undefined;
  const pageIds = standaloneIdsOf(items);
  const entries: StandalonePlacementBaselineEntry[] = [];
  for (const entry of continuation.standalonePlacements) {
    if (!pageIds.has(entry.itemId)) continue;
    const placement = visiblePlacement(entry.itemId, entry, pageIds);
    if (placement === undefined) continue;
    entries.push({
      itemId: entry.itemId,
      beforeTurn: placement.beforeTurn,
      beforeItem: placement.beforeItem,
    });
  }
  return entries.length === 0 ? undefined : { standalonePlacements: entries };
}

export interface ApplyResult {
  readonly state: AgentState;
  /** True when the op changed observable state. */
  readonly changed: boolean;
  /** Present when an append failed to land (offset beyond local length). */
  readonly gap?: { readonly expected: number; readonly got: number };
}

export function applyOperation(state: AgentState, op: TranscriptOperation): ApplyResult {
  switch (op.op) {
    case 'reset':
      return applyReset(state, op);
    case 'turn.upsert':
      return applyTurnUpsert(state, op.turn);
    case 'step.upsert':
      return applyStepUpsert(state, op.turnId, op.step);
    case 'frame.upsert':
      return applyFrameUpsert(state, op);
    case 'append':
      return applyAppend(state, op);
    case 'marker.upsert':
      return applyItemUpsert(state, op.item, op.item.markerId, op.beforeTurn, op.beforeItem);
    case 'taskref.upsert':
      return applyItemUpsert(state, op.item, op.item.refId, op.beforeTurn, op.beforeItem);
    case 'task.upsert':
      return applyTaskUpsert(state, op.task);
    case 'interaction.upsert':
      return applyInteractionUpsert(state, op.interaction);
    case 'attachment.upsert':
      return applyAttachmentUpsert(state, op.attachment);
    case 'todo.upsert':
      return applyTodoUpsert(state, op.todo);
    case 'prompt.upsert':
      return applyPromptUpsert(state, op.prompt);
    case 'meta.merge':
      return applyMetaMerge(state, op.meta);
    case 'items.remove':
      return applyItemsRemove(state, op.ids);
  }
}

// ---------------------------------------------------------------- reset

function applyReset(state: AgentState, op: Extract<TranscriptOperation, { op: 'reset' }>): ApplyResult {
  // Pending derives from the global interaction entities (the only channel —
  // interactions are never step frames).
  const pending = new Set<InteractionId>();
  for (const interaction of op.snapshot.interactions) {
    if (interaction.state === 'pending') pending.add(interaction.interactionId);
  }
  return {
    state: {
      items: op.snapshot.items,
      tasks: new Map(op.snapshot.tasks.map((task) => [task.taskId, task])),
      interactions: new Map(
        op.snapshot.interactions.map((interaction) => [interaction.interactionId, interaction]),
      ),
      attachments: new Map(
        op.snapshot.attachments.map((attachment) => [attachment.attachmentId, attachment]),
      ),
      todos: new Map(op.snapshot.todos.map((todo) => [todo.todoId, todo])),
      prompts: new Map(op.snapshot.prompts.map((prompt) => [prompt.promptId, prompt])),
      meta: op.snapshot.meta,
      pendingInteractions: pending,
      hasMoreOlder: op.snapshot.hasMoreOlder ?? false,
      // Hydrate the placement memory from the snapshot's continuation (legacy
      // snapshots carry none → empty). The reset items themselves are trusted
      // as the producer's layout — never normalized here.
      standalonePlacements: placementsFromContinuation(op.snapshot.items, op.snapshot.continuation),
    },
    changed: true,
  };
}

// ---------------------------------------------------------------- turn / step / frame

function turnHeaderToTurn(header: TurnHeader, steps: readonly TranscriptStep[]): TranscriptTurn {
  return { ...header, kind: 'turn', steps: [...steps] };
}

function skeletonTurn(turnId: TurnId): TranscriptTurn {
  return {
    kind: 'turn',
    turnId,
    ordinal: turnOrdinal(turnId),
    state: 'running',
    origin: { kind: 'other' },
    steps: [],
  };
}

function skeletonStep(stepId: string, turnId: TurnId): TranscriptStep {
  const ordinal = Number(stepId.slice(turnId.length + 1)) || 0;
  return { kind: 'step', stepId, turnId, ordinal, state: 'running', frames: [] };
}

function getTurn(state: AgentState, turnId: TurnId): TranscriptTurn | undefined {
  const item = state.items.find((entry) => entry.kind === 'turn' && entry.turnId === turnId);
  return item?.kind === 'turn' ? item : undefined;
}

/** Insert a new turn keeping turns ordered by ordinal; markers stay put. */
function insertTurn(items: readonly TranscriptItem[], turn: TranscriptTurn): readonly TranscriptItem[] {
  const next = [...items];
  let at = next.length;
  for (let i = 0; i < next.length; i += 1) {
    const entry = next[i];
    if (entry?.kind === 'turn' && entry.ordinal > turn.ordinal) {
      at = i;
      break;
    }
  }
  next.splice(at, 0, turn);
  return next;
}

function replaceTurn(
  items: readonly TranscriptItem[],
  turnId: TurnId,
  fn: (turn: TranscriptTurn) => TranscriptTurn,
): readonly TranscriptItem[] {
  return items.map((entry) =>
    entry.kind === 'turn' && entry.turnId === turnId ? fn(entry) : entry,
  );
}

/**
 * Re-insert an existing turn by its new ordinal, carrying its live segment:
 * every placement-less standalone item (marker / taskref) in the gap behind
 * it, up to the next turn. Removing the turn alone would strand those items
 * in place — ahead of whatever turn the correction crosses — so they are cut
 * out together and re-attached immediately after the moved turn. Anchored
 * items inside the gap do NOT follow the turn: they keep their spot in `rest`
 * and their final layout is owned by `normalizeStandaloneSegments` against
 * the absolute `beforeTurn`.
 */
function moveTurnWithLiveSegment(
  items: readonly TranscriptItem[],
  turnId: TurnId,
  nextTurn: TranscriptTurn,
  placements: ReadonlyMap<string, StandalonePlacement>,
): readonly TranscriptItem[] {
  const turnIndex = items.findIndex(
    (entry) => entry.kind === 'turn' && entry.turnId === turnId,
  );
  if (turnIndex < 0) return insertTurn(items, nextTurn);
  // The live segment spans the WHOLE gap behind the turn, not just an
  // unplaced prefix: an anchored item inside the gap must not stop the scan,
  // or the placement-less items beyond it would be stranded in place.
  let gapEnd = turnIndex + 1;
  while (gapEnd < items.length && items[gapEnd]!.kind !== 'turn') gapEnd += 1;
  const liveSegment: TranscriptItem[] = [];
  const rest: TranscriptItem[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const entry = items[index]!;
    if (index === turnIndex) continue;
    if (index > turnIndex && index < gapEnd && !placements.has(itemIdOf(entry))) {
      liveSegment.push(entry);
      continue;
    }
    rest.push(entry);
  }
  const moved = insertTurn(rest, nextTurn);
  const at = moved.findIndex((entry) => entry === nextTurn);
  return [...moved.slice(0, at + 1), ...liveSegment, ...moved.slice(at + 1)];
}

function applyTurnUpsert(state: AgentState, header: TurnHeader): ApplyResult {
  const existing = getTurn(state, header.turnId);
  const placements = placementsOf(state);
  if (existing) {
    if (turnEquals(existing, header)) return { state, changed: false };
    // The header replaces wholesale; the accumulated steps survive.
    const nextTurn = turnHeaderToTurn(header, existing.steps);
    // An ordinal/state update can move a placement group's boundary — or the
    // turn itself may sit on the far side of one. When the ordinal changed the
    // turn itself must move too: an in-place replace would leave the timeline
    // out of ordinal order, so it is removed and re-inserted by its new
    // ordinal — together with its live segment, the placement-less standalone
    // items in the gap behind it, which belong to the turn and must not be
    // stranded ahead of a crossed turn. Either way the segment layout is
    // re-derived on the same pass so the change lands converged; the equality
    // branch above returns before this, so a replay never manufactures a
    // change out of normalization alone.
    const items =
      header.ordinal === existing.ordinal
        ? replaceTurn(state.items, header.turnId, () => nextTurn)
        : moveTurnWithLiveSegment(state.items, header.turnId, nextTurn, placements);
    return {
      state: {
        ...state,
        items: normalizeStandaloneSegments(items, placements),
      },
      changed: true,
    };
  }
  // A newly arrived turn closes the gap its anchored placement groups were
  // waiting in: normalization slots them back ahead of it immediately.
  return {
    state: {
      ...state,
      items: normalizeStandaloneSegments(
        insertTurn(state.items, turnHeaderToTurn(header, [])),
        placements,
      ),
    },
    changed: true,
  };
}

function turnEquals(turn: TranscriptTurn, header: TurnHeader): boolean {
  return (
    turn.ordinal === header.ordinal &&
    turn.state === header.state &&
    turn.prompt === header.prompt &&
    turn.attachmentIds === header.attachmentIds &&
    turn.startedAt === header.startedAt &&
    turn.endedAt === header.endedAt &&
    turn.origin.kind === header.origin.kind &&
    turn.origin.payload === header.origin.payload &&
    turn.usage === header.usage &&
    turn.durationMs === header.durationMs &&
    turn.error === header.error
  );
}

function applyStepUpsert(state: AgentState, turnId: TurnId, header: StepHeader): ApplyResult {
  const turn = getTurn(state, turnId) ?? skeletonTurn(turnId);
  const stepIndex = turn.steps.findIndex((step) => step.stepId === header.stepId);
  let steps: readonly TranscriptStep[];
  let changed = true;
  if (stepIndex >= 0) {
    const current = turn.steps[stepIndex];
    if (current && stepEquals(current, header)) {
      changed = false;
      steps = turn.steps;
    } else {
      steps = turn.steps.map((step) =>
        step.stepId === header.stepId ? { ...header, kind: 'step' as const, frames: step.frames } : step,
      );
    }
  } else {
    steps = [...turn.steps, { ...header, kind: 'step' as const, frames: [] }].toSorted(
      (a, b) => a.ordinal - b.ordinal,
    );
  }
  if (!changed) return { state, changed: false };
  const nextTurn: TranscriptTurn = { ...turn, steps: [...steps] };
  // A step for an unseen turn auto-vivifies a skeleton turn — a new boundary
  // the remembered placements must be consumed against, like any turn insert.
  const items = getTurn(state, turnId)
    ? replaceTurn(state.items, turnId, () => nextTurn)
    : insertTurn(state.items, nextTurn);
  return {
    state: { ...state, items: normalizeStandaloneSegments(items, placementsOf(state)) },
    changed: true,
  };
}

function stepEquals(step: TranscriptStep, header: StepHeader): boolean {
  return (
    step.ordinal === header.ordinal &&
    step.state === header.state &&
    step.startedAt === header.startedAt &&
    step.endedAt === header.endedAt &&
    step.usage === header.usage &&
    step.finishReason === header.finishReason &&
    step.timing === header.timing &&
    step.retry === header.retry &&
    step.endReason === header.endReason &&
    step.endMessage === header.endMessage
  );
}

function applyFrameUpsert(
  state: AgentState,
  op: Extract<TranscriptOperation, { op: 'frame.upsert' }>,
): ApplyResult {
  const turn = getTurn(state, op.turnId) ?? skeletonTurn(op.turnId);
  const step = turn.steps.find((entry) => entry.stepId === op.stepId) ?? skeletonStep(op.stepId, op.turnId);
  const existing = step.frames.findIndex((frame) => frame.frameId === op.frame.frameId);
  let frames: readonly TranscriptFrame[];
  if (existing >= 0) {
    const current = step.frames[existing];
    if (current !== undefined && frameEquals(current, op.frame)) {
      return { state, changed: false };
    }
    frames = step.frames.map((frame) => (frame.frameId === op.frame.frameId ? op.frame : frame));
  } else {
    frames = [...step.frames, op.frame];
  }
  const nextStep: TranscriptStep = { ...step, frames: [...frames] };
  const steps = turn.steps.some((entry) => entry.stepId === op.stepId)
    ? turn.steps.map((entry) => (entry.stepId === op.stepId ? nextStep : entry))
    : [...turn.steps, nextStep].toSorted((a, b) => a.ordinal - b.ordinal);
  const nextTurn: TranscriptTurn = { ...turn, steps };
  // Same consumption as the other turn-touching paths: a frame can be the
  // first fact of its turn, inserting a skeleton boundary.
  const items = getTurn(state, op.turnId)
    ? replaceTurn(state.items, op.turnId, () => nextTurn)
    : insertTurn(state.items, nextTurn);
  return {
    state: { ...state, items: normalizeStandaloneSegments(items, placementsOf(state)) },
    changed: true,
  };
}

function frameEquals(a: TranscriptFrame, b: TranscriptFrame): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'text' && b.kind === 'text') {
    return (
      a.text === b.text &&
      a.role === b.role &&
      a.attachmentIds === b.attachmentIds &&
      a.taskId === b.taskId
    );
  }
  if (a.kind === 'thinking' && b.kind === 'thinking') return a.text === b.text;
  if (a.kind === 'tool' && b.kind === 'tool') {
    return (
      a.state === b.state &&
      a.toolCallId === b.toolCallId &&
      a.name === b.name &&
      a.view === b.view &&
      a.input === b.input &&
      a.output === b.output &&
      a.display === b.display &&
      a.error === b.error &&
      a.inputText === b.inputText &&
      a.progress === b.progress &&
      a.taskId === b.taskId &&
      a.approvalId === b.approvalId &&
      a.todoId === b.todoId &&
      a.agentRefs === b.agentRefs
    );
  }
  if (a.kind === 'notice' && b.kind === 'notice') {
    return a.message === b.message && a.level === b.level && a.detail === b.detail;
  }
  return false;
}

// ---------------------------------------------------------------- append (only non-idempotent op)

function applyAppend(state: AgentState, op: AppendOp): ApplyResult {
  if (op.target.type === 'task') return applyTaskAppend(state, op);
  const { turnId, stepId, frameId } = op.target;
  const turn = getTurn(state, turnId);
  const step = turn?.steps.find((entry) => entry.stepId === stepId);
  const frame = step?.frames.find((entry) => entry.frameId === frameId);
  if (!turn || !step || !frame || (frame.kind !== 'text' && frame.kind !== 'thinking')) {
    return { state, changed: false, gap: { expected: 0, got: op.offset } };
  }
  const merged = appendAtOffset(frame.text, op.offset, op.text);
  if (merged.gap) return { state, changed: false, gap: merged.gap };
  if (!merged.changed) return { state, changed: false };
  const nextFrame = { ...frame, text: merged.text };
  const nextStep: TranscriptStep = {
    ...step,
    frames: step.frames.map((entry) => (entry.frameId === frameId ? nextFrame : entry)),
  };
  const nextTurn: TranscriptTurn = {
    ...turn,
    steps: turn.steps.map((entry) => (entry.stepId === stepId ? nextStep : entry)),
  };
  return {
    state: { ...state, items: replaceTurn(state.items, turnId, () => nextTurn) },
    changed: true,
  };
}

function applyTaskAppend(state: AgentState, op: AppendOp): ApplyResult {
  if (op.target.type !== 'task') throw new Error('unreachable');
  const taskId = op.target.taskId;
  const task = state.tasks.get(taskId);
  const current = task?.outputTail ?? '';
  const merged = appendAtOffset(current, op.offset, op.text);
  if (merged.gap) return { state, changed: false, gap: merged.gap };
  if (!merged.changed) return { state, changed: false };
  const nextTask: TranscriptTask = task
    ? { ...task, outputTail: merged.text }
    : { taskId, kind: 'other', state: 'running', detached: false, outputTail: merged.text };
  const tasks = new Map(state.tasks);
  tasks.set(taskId, nextTask);
  return { state: { ...state, tasks }, changed: true };
}

/**
 * Offset placement, mirroring the web client's alignDelta semantics:
 * `offset > local length` is a gap (caller should re-snapshot); a chunk that
 * is already fully present is a duplicate (no change); a partially present
 * chunk is trimmed to its novel suffix — but only when the overlap region
 * agrees. A chunk behind local state whose overlap does NOT match is a gap
 * too (diverged stream), never a silent rewrite that drops local content.
 */
export function appendAtOffset(
  local: string,
  offset: number,
  chunk: string,
): { text: string; changed: boolean; gap?: { expected: number; got: number } } {
  if (offset > local.length) return { text: local, changed: false, gap: { expected: local.length, got: offset } };
  if (local.slice(offset, offset + chunk.length) === chunk) {
    return { text: local, changed: false };
  }
  const overlap = local.length - offset;
  // The overlap region must agree before trimming: a chunk whose head does
  // not match the local tail at `offset` belongs to a diverged stream, and
  // rewriting from `offset` would silently drop local content (e.g. a stale
  // buffered append landing on a refreshed page).
  if (local.slice(offset) !== chunk.slice(0, overlap)) {
    return { text: local, changed: false, gap: { expected: local.length, got: offset } };
  }
  const novel = overlap > 0 ? chunk.slice(overlap) : chunk;
  if (novel.length === 0) return { text: local, changed: false };
  return { text: local.slice(0, offset) + chunk, changed: true };
}

// ---------------------------------------------------------------- standalone items

/** Index of the first turn at or past `beforeTurn` (list end when none). */
function anchoredIndex(items: readonly TranscriptItem[], beforeTurn: number): number {
  for (let i = 0; i < items.length; i += 1) {
    const entry = items[i];
    if (entry?.kind === 'turn' && entry.ordinal >= beforeTurn) return i;
  }
  return items.length;
}

/**
 * Structural equality over JSON-shaped values — null, primitives, arrays,
 * and plain objects. Browser-safe and dependency-free. Only plain objects
 * (prototype `Object.prototype` or null) recurse by key: class instances
 * (Date, Map, Set, …) expose no enumerable JSON shape, so a key-count
 * comparison would call any two of them equal; they compare equal only by
 * identity (`a === b`).
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((entry, index) => deepEqual(entry, b[index]))
    );
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  if (aKeys.length !== Object.keys(bRecord).length) return false;
  return aKeys.every(
    (key) => Object.hasOwn(bRecord, key) && deepEqual(aRecord[key], bRecord[key]),
  );
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/**
 * Observable-field equality for the standalone items (`marker.upsert` /
 * `taskref.upsert` carry). A replayed op whose item survived a JSON or
 * structuredClone roundtrip holds fresh object references; comparing fields
 * keeps that replay a no-op instead of a replace-in-place.
 */
function sameStandaloneItem(a: TranscriptItem, b: TranscriptItem): boolean {
  if (a === b) return true;
  if (a.kind === 'marker' && b.kind === 'marker') {
    return (
      a.markerId === b.markerId &&
      a.marker === b.marker &&
      a.at === b.at &&
      deepEqual(a.payload, b.payload)
    );
  }
  if (a.kind === 'taskref' && b.kind === 'taskref') {
    return a.refId === b.refId && a.taskId === b.taskId && a.at === b.at;
  }
  return false;
}

function applyItemUpsert(
  state: AgentState,
  item: TranscriptItem,
  id: string,
  beforeTurn?: number,
  beforeItem?: string,
): ApplyResult {
  // A self-anchor is meaningless (an item cannot precede itself) — treat it
  // as absent so the op can never move the item.
  const anchorItem = beforeItem === id ? undefined : beforeItem;

  // Anchored ops (either anchor set) record their placement up front, even
  // when the item itself is absent or the successor has not landed: the
  // remembered relation is what makes successor-first / shuffled application
  // of a chain converge on the first pass. An unanchored (live) op keeps any
  // previously remembered placement instead of dropping it.
  let placements = placementsOf(state);
  let placementChanged = false;
  if (beforeTurn !== undefined || anchorItem !== undefined) {
    const existing = placements.get(id);
    if (
      existing === undefined ||
      existing.beforeTurn !== beforeTurn ||
      existing.beforeItem !== anchorItem
    ) {
      const next = new Map(placements);
      next.set(id, { beforeTurn, beforeItem: anchorItem });
      placements = next;
      placementChanged = true;
    }
  }

  // Upsert the item itself: replace in place when present (never move — the
  // normalization below owns ordering); insert at the turn anchor when new
  // and anchored, append otherwise. The exact landing slot does not matter
  // for placed items: normalization derives their final position.
  const currentIndex = state.items.findIndex((entry) => itemIdOf(entry) === id);
  let items = state.items;
  let itemChanged = false;
  if (currentIndex >= 0) {
    if (!sameStandaloneItem(state.items[currentIndex]!, item)) {
      const replaced = [...state.items];
      replaced[currentIndex] = item;
      items = replaced;
      itemChanged = true;
    }
  } else {
    const anchor = placements.get(id)?.beforeTurn;
    const inserted = [...state.items];
    inserted.splice(anchor === undefined ? inserted.length : anchoredIndex(inserted, anchor), 0, item);
    items = inserted;
    itemChanged = true;
  }

  const normalized = normalizeStandaloneSegments(items, placements);
  if (!placementChanged && !itemChanged && normalized === items) {
    return { state, changed: false };
  }
  return {
    state: { ...state, items: normalized, standalonePlacements: placements },
    changed: true,
  };
}

/**
 * Derive the intra-segment order of one `beforeTurn` group from the
 * successor graph (`placement.beforeItem`). Heads (present ids nothing points
 * at) emit first, in their current relative order, each followed down its
 * successor chain; anything still unvisited (cycles, or nodes whose chain
 * passes through a missing id) keeps the current relative order as a stable
 * fallback — so legacy siblings without `beforeItem` are never reshuffled.
 */
function orderSegmentGroup(
  ids: readonly string[],
  placements: ReadonlyMap<string, StandalonePlacement>,
): readonly string[] {
  const members = new Set(ids);
  const hasIncoming = new Set<string>();
  for (const id of ids) {
    const successor = placements.get(id)?.beforeItem;
    if (successor !== undefined && members.has(successor)) hasIncoming.add(successor);
  }
  const ordered: string[] = [];
  const visited = new Set<string>();
  const walk = (start: string): void => {
    let node: string | undefined = start;
    while (node !== undefined && members.has(node) && !visited.has(node)) {
      visited.add(node);
      ordered.push(node);
      node = placements.get(node)?.beforeItem;
    }
  };
  for (const id of ids) {
    if (!hasIncoming.has(id)) walk(id);
  }
  for (const id of ids) walk(id);
  return ordered;
}

/**
 * Re-derive the standalone layout from the remembered placements, rebuilding
 * gap by gap. Turns keep their position and split the timeline into gaps; a
 * `beforeTurn` group belongs to the gap closed by the first turn with
 * `ordinal >= beforeTurn` (an anchor past every turn belongs to the tail
 * gap, where the engine's next live turn lands), and groups within one gap
 * emit in ascending anchor order. Inside a gap the anchored groups emit
 * FIRST, then the gap's placement-less standalone items in their current
 * relative order: those are live items that arrived while the backfill was
 * still reading, and the historical segment takes precedence over them
 * without displacing them from their gap. The anchor-less group stays the
 * live tail. Returns `items` itself (same reference) when the derived layout
 * matches exactly, so a replay that moves nothing is not a visible change.
 */
function normalizeStandaloneSegments(
  items: readonly TranscriptItem[],
  placements: ReadonlyMap<string, StandalonePlacement>,
): readonly TranscriptItem[] {
  const groups = new Map<number | undefined, string[]>();
  const byId = new Map<string, TranscriptItem>();
  for (const entry of items) {
    if (entry.kind === 'turn') continue;
    const id = itemIdOf(entry);
    byId.set(id, entry);
    const placement = placements.get(id);
    if (placement === undefined) continue;
    const group = groups.get(placement.beforeTurn);
    if (group === undefined) groups.set(placement.beforeTurn, [id]);
    else group.push(id);
  }
  if (groups.size === 0) return items;
  const numericKeys = [...groups.keys()]
    .filter((key): key is number => key !== undefined)
    .sort((a, b) => a - b);

  // Lazy copy-on-write: emit the canonical layout entry by entry, comparing
  // against the current array; only allocate once a difference shows.
  let matched = 0;
  let next: TranscriptItem[] | undefined;
  const emit = (entry: TranscriptItem): void => {
    if (next !== undefined) {
      next.push(entry);
      return;
    }
    if (items[matched] === entry) {
      matched += 1;
      return;
    }
    next = [...items.slice(0, matched), entry];
  };
  let keyIndex = 0;
  const flushGroup = (key: number | undefined): void => {
    for (const id of orderSegmentGroup(groups.get(key)!, placements)) emit(byId.get(id)!);
  };
  // Close one gap: its anchored groups first, then the unplaced items the
  // scan collected inside it. `undefined` closes the tail gap and takes
  // every remaining group.
  let unplaced: TranscriptItem[] = [];
  const flushGap = (closingOrdinal: number | undefined): void => {
    while (
      keyIndex < numericKeys.length &&
      (closingOrdinal === undefined || numericKeys[keyIndex]! <= closingOrdinal)
    ) {
      flushGroup(numericKeys[keyIndex]!);
      keyIndex += 1;
    }
    for (const entry of unplaced) emit(entry);
    unplaced = [];
  };
  for (const entry of items) {
    if (entry.kind === 'turn') {
      flushGap(entry.ordinal);
      emit(entry);
    } else if (!placements.has(itemIdOf(entry))) {
      unplaced.push(entry);
    }
  }
  flushGap(undefined);
  if (groups.has(undefined)) flushGroup(undefined);
  return next ?? items;
}

/**
 * The canonical standalone layout, for consumers that merge items and
 * placements OUTSIDE the reducer (e.g. a client store prepending an older
 * REST page): re-derives the segment order from the placement memory exactly
 * like every reducer mutation path does. Items are only re-ordered — the map
 * is read, never written — and `items` itself (same reference) is returned
 * when the derived layout already matches, so a converged merge stays a
 * no-op. An absent map reads as empty, exactly like `placementsOf` treats a
 * legacy state.
 */
export function normalizeStandaloneItems(
  items: readonly TranscriptItem[],
  placements: ReadonlyMap<string, StandalonePlacement> | undefined,
): readonly TranscriptItem[] {
  return normalizeStandaloneSegments(items, placements ?? EMPTY_STANDALONE_PLACEMENTS);
}

function itemIdOf(item: TranscriptItem): string {
  switch (item.kind) {
    case 'turn':
      return item.turnId;
    case 'marker':
      return item.markerId;
    case 'taskref':
      return item.refId;
  }
}

function applyItemsRemove(state: AgentState, ids: readonly string[]): ApplyResult {
  const drop = new Set(ids);
  const removedTurns = state.items.filter(
    (entry): entry is TranscriptTurn => entry.kind === 'turn' && drop.has(entry.turnId),
  );
  const items = state.items.filter((entry) => !drop.has(itemIdOf(entry)));
  // Forget the removed items' remembered placements too, so a later re-add
  // starts clean instead of inheriting a stale successor relation. Survivors
  // whose successor edge points into the drop set keep their turn anchor but
  // lose the dangling edge — and one whose edge was its only anchor loses the
  // entry outright. The edge can outlive its target (removed earlier, or
  // never arrived), so a remove that deletes no item can still clean a hidden
  // placement and must count as a change.
  let placements = placementsOf(state);
  const touchesPlacements =
    ids.some((id) => placements.has(id)) ||
    [...placements.values()].some(
      (placement) => placement.beforeItem !== undefined && drop.has(placement.beforeItem),
    );
  if (touchesPlacements) {
    const next = new Map<string, StandalonePlacement>();
    for (const [id, placement] of placements) {
      if (drop.has(id)) continue;
      if (placement.beforeItem === undefined || !drop.has(placement.beforeItem)) {
        next.set(id, placement);
        continue;
      }
      // The dropped successor edge keeps the turn anchor when there is one —
      // but when the edge was the placement's ONLY anchor, an anchor-less
      // entry carries no placement information and dies with the edge instead
      // of lingering as hidden state.
      if (placement.beforeTurn !== undefined) next.set(id, { beforeTurn: placement.beforeTurn });
    }
    placements = next;
  }
  // Compare against the resolved memory, not the raw field: a legacy state
  // without the field reads as the shared empty map, and an untouched remove
  // must stay a no-op for it instead of manufacturing a placement write.
  if (items.length === state.items.length && placements === placementsOf(state)) {
    return { state, changed: false };
  }
  // Removing a turn kills the interaction ENTITIES anchored to a tool call
  // inside it (they die with their anchor), pending entries included.
  let pending = state.pendingInteractions;
  let interactions = state.interactions;
  if (removedTurns.length > 0) {
    const anchoredToolCallIds = new Set<string>();
    const nextPending = new Set(pending);
    const deadEntityIds = new Set<InteractionId>();
    for (const turn of removedTurns) {
      for (const step of turn.steps) {
        for (const frame of step.frames) {
          if (frame.kind === 'tool') anchoredToolCallIds.add(frame.toolCallId);
        }
      }
    }
    for (const interaction of interactions.values()) {
      if (interaction.toolCallId !== undefined && anchoredToolCallIds.has(interaction.toolCallId)) {
        deadEntityIds.add(interaction.interactionId);
        nextPending.delete(interaction.interactionId);
      }
    }
    if (deadEntityIds.size > 0) {
      const nextInteractions = new Map(interactions);
      for (const id of deadEntityIds) nextInteractions.delete(id);
      interactions = nextInteractions;
    }
    pending = nextPending;
  }
  // Re-derive the standalone layout on the merged timeline: removing a turn
  // merges the two gaps it separated, and the surviving placements decide the
  // combined segment's order (anchored groups first by ascending anchor, then
  // the live tail) — the same rule every other mutation path applies.
  const normalized = normalizeStandaloneSegments(items, placements);
  return {
    state: { ...state, items: normalized, interactions, pendingInteractions: pending, standalonePlacements: placements },
    changed: true,
  };
}

// ---------------------------------------------------------------- tasks / meta

function applyTaskUpsert(state: AgentState, task: TranscriptTask): ApplyResult {
  const current = state.tasks.get(task.taskId);
  if (current && taskEquals(current, task)) return { state, changed: false };
  const tasks = new Map(state.tasks);
  tasks.set(task.taskId, task);
  return { state: { ...state, tasks }, changed: true };
}

function applyInteractionUpsert(
  state: AgentState,
  interaction: TranscriptInteraction,
): ApplyResult {
  const current = state.interactions.get(interaction.interactionId);
  if (current && interactionEquals(current, interaction)) return { state, changed: false };
  const interactions = new Map(state.interactions);
  interactions.set(interaction.interactionId, interaction);
  let pending = state.pendingInteractions;
  if (interaction.state === 'pending') {
    if (!pending.has(interaction.interactionId)) {
      const next = new Set(pending);
      next.add(interaction.interactionId);
      pending = next;
    }
  } else if (pending.has(interaction.interactionId)) {
    const next = new Set(pending);
    next.delete(interaction.interactionId);
    pending = next;
  }
  return { state: { ...state, interactions, pendingInteractions: pending }, changed: true };
}

function interactionEquals(a: TranscriptInteraction, b: TranscriptInteraction): boolean {
  return (
    a.interactionKind === b.interactionKind &&
    a.toolCallId === b.toolCallId &&
    a.state === b.state &&
    a.request === b.request &&
    a.response === b.response
  );
}

function applyAttachmentUpsert(
  state: AgentState,
  attachment: TranscriptAttachment,
): ApplyResult {
  const current = state.attachments.get(attachment.attachmentId);
  if (current && attachmentEquals(current, attachment)) return { state, changed: false };
  const attachments = new Map(state.attachments);
  attachments.set(attachment.attachmentId, attachment);
  return { state: { ...state, attachments }, changed: true };
}

function attachmentEquals(a: TranscriptAttachment, b: TranscriptAttachment): boolean {
  return (
    a.mediaType === b.mediaType &&
    a.name === b.name &&
    a.size === b.size &&
    a.source === b.source &&
    a.placeholder === b.placeholder
  );
}

function applyTodoUpsert(state: AgentState, todo: TranscriptTodo): ApplyResult {
  const current = state.todos.get(todo.todoId);
  if (current && todoEquals(current, todo)) return { state, changed: false };
  const todos = new Map(state.todos);
  todos.set(todo.todoId, todo);
  return { state: { ...state, todos }, changed: true };
}

function todoEquals(a: TranscriptTodo, b: TranscriptTodo): boolean {
  return a.items === b.items && a.updatedAt === b.updatedAt;
}

function applyPromptUpsert(state: AgentState, prompt: TranscriptPrompt): ApplyResult {
  const current = state.prompts.get(prompt.promptId);
  if (current && promptEquals(current, prompt)) return { state, changed: false };
  const prompts = new Map(state.prompts);
  prompts.set(prompt.promptId, prompt);
  return { state: { ...state, prompts }, changed: true };
}

function promptEquals(a: TranscriptPrompt, b: TranscriptPrompt): boolean {
  return (
    a.status === b.status &&
    a.userMessageId === b.userMessageId &&
    a.content === b.content &&
    a.createdAt === b.createdAt &&
    a.finishedAt === b.finishedAt &&
    a.steeredAt === b.steeredAt
  );
}

function taskEquals(a: TranscriptTask, b: TranscriptTask): boolean {
  return (
    a.kind === b.kind &&
    a.state === b.state &&
    a.detached === b.detached &&
    a.description === b.description &&
    a.agentId === b.agentId &&
    a.outputTail === b.outputTail &&
    a.startedAt === b.startedAt &&
    a.endedAt === b.endedAt &&
    a.resultSummary === b.resultSummary &&
    a.error === b.error &&
    a.stateReason === b.stateReason &&
    a.usage === b.usage
  );
}

function applyMetaMerge(state: AgentState, meta: TranscriptMetaMerge): ApplyResult {
  // `null` clears a mode badge (the mode exited); an absent key keeps it.
  const modes =
    meta.modes !== undefined
      ? {
          plan: meta.modes.plan === null ? undefined : (meta.modes.plan ?? state.meta.modes?.plan),
          swarm: meta.modes.swarm === null ? undefined : (meta.modes.swarm ?? state.meta.modes?.swarm),
        }
      : state.meta.modes;
  // The agent status arrives in slices (`agent.status.updated` carries only
  // the fields that changed), so the key merges one level deep instead of
  // replacing wholesale — a replace would drop fields from earlier slices.
  const agent =
    meta.agent !== undefined ? { ...state.meta.agent, ...meta.agent } : state.meta.agent;
  const next: TranscriptMeta = {
    goal: meta.goal === null ? undefined : (meta.goal ?? state.meta.goal),
    activity: meta.activity ?? state.meta.activity,
    modes: modes !== undefined && modes.plan === undefined && modes.swarm === undefined ? undefined : modes,
    agent,
  };
  if (
    next.goal === state.meta.goal &&
    next.activity === state.meta.activity &&
    next.modes === state.meta.modes &&
    next.agent === state.meta.agent
  ) {
    return { state, changed: false };
  }
  return { state: { ...state, meta: next }, changed: true };
}
