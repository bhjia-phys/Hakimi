/**
 * L2 transport vocabulary.
 *
 * Operations are volatile — they carry no rendering contract and clients may
 * coalesce or drop them freely within the rules below. There is exactly one
 * non-idempotent op: `append` (must carry `offset`). Everything else is a
 * state-style upsert/merge: duplicates are absorbed, and ops consumed in the
 * producer's causal order (a single sequenced channel per agent) converge to
 * the producer's store.
 *
 * The single convergence path is `AgentTranscript.apply` in `store/`.
 */

import type {
  AgentId,
  FrameId,
  StepId,
  TaskId,
  TurnId,
} from '../model/ids';
import type { TranscriptAttachment } from '../model/attachment';
import type { TranscriptFrame } from '../model/frame';
import type { TranscriptInteraction } from '../model/interaction';
import type { TranscriptItem, TranscriptMarker, TranscriptTaskRef } from '../model/item';
import type { TranscriptMeta, TranscriptMetaMerge } from '../model/meta';
import type { TranscriptPrompt } from '../model/prompt';
import type { TranscriptTask } from '../model/task';
import type { TranscriptTodo } from '../model/todo';
import type { TranscriptStep, TranscriptTurn } from '../model/turn';

/** Turn header as carried in ops: steps always arrive via step.upsert. */
export type TurnHeader = Omit<TranscriptTurn, 'steps'>;
/** Step header as carried in ops: frames always arrive via frame.upsert. */
export type StepHeader = Omit<TranscriptStep, 'frames'>;

export interface ResetOp {
  readonly op: 'reset';
  readonly agentId: AgentId;
  readonly snapshot: AgentTranscriptSnapshot;
}

export interface TurnUpsertOp {
  readonly op: 'turn.upsert';
  readonly turn: TurnHeader;
}

export interface StepUpsertOp {
  readonly op: 'step.upsert';
  readonly turnId: TurnId;
  readonly step: StepHeader;
}

export interface FrameUpsertOp {
  readonly op: 'frame.upsert';
  readonly turnId: TurnId;
  readonly stepId: StepId;
  readonly frame: TranscriptFrame;
}

export type AppendTarget =
  | { readonly type: 'frame'; readonly turnId: TurnId; readonly stepId: StepId; readonly frameId: FrameId }
  | { readonly type: 'task'; readonly taskId: TaskId };

/** The only non-idempotent op. `offset` is the chunk's cumulative position. */
export interface AppendOp {
  readonly op: 'append';
  readonly target: AppendTarget;
  readonly offset: number;
  readonly text: string;
}

export interface MarkerUpsertOp {
  readonly op: 'marker.upsert';
  readonly item: TranscriptMarker;
  /**
   * Placement anchor for out-of-order (backfill) inserts: insert before the
   * first turn with `ordinal >= beforeTurn` (appending when no such turn
   * exists). Absent = append at the end — the live real-time order.
   */
  readonly beforeTurn?: number;
  /**
   * Backfill-only intra-segment anchor: the id of the standalone item that
   * directly followed this one inside the same historical segment. When set
   * it decides the order WITHIN the `beforeTurn` segment — the item lands
   * immediately before the named successor (relocating the successor into
   * the segment first when a live-first append left it outside). Absent on
   * the segment's last item and on every legacy/live op. Requires
   * `beforeTurn`: it only refines the turn anchor's intra-segment order and
   * never travels alone — the wire schema rejects `beforeItem` without
   * `beforeTurn`.
   */
  readonly beforeItem?: string;
}

export interface TaskRefUpsertOp {
  readonly op: 'taskref.upsert';
  readonly item: TranscriptTaskRef;
  /** Same placement anchor as `MarkerUpsertOp.beforeTurn`. */
  readonly beforeTurn?: number;
  /**
   * Same in-segment successor anchor as `MarkerUpsertOp.beforeItem` —
   * including its contract: valid only together with `beforeTurn`.
   */
  readonly beforeItem?: string;
}

export interface TaskUpsertOp {
  readonly op: 'task.upsert';
  readonly task: TranscriptTask;
}

/**
 * Interaction entity upsert — global like `task.upsert`, addressed by id
 * (never placed into a step). Flows at 'turn' grade and up, so even coarse
 * subscribers see pending approvals/questions.
 */
export interface InteractionUpsertOp {
  readonly op: 'interaction.upsert';
  readonly interaction: TranscriptInteraction;
}

/**
 * Attachment entity upsert — global, addressed by id. Media bytes never
 * travel in ops; the entity carries metadata plus a fetch reference.
 */
export interface AttachmentUpsertOp {
  readonly op: 'attachment.upsert';
  readonly attachment: TranscriptAttachment;
}

/**
 * Todo document upsert — whole-document replace (idempotent). Carries the
 * latest list; point-in-time history stays on `TodoList` tool frames.
 */
export interface TodoUpsertOp {
  readonly op: 'todo.upsert';
  readonly todo: TranscriptTodo;
}

/**
 * Prompt queue entity upsert — global like `task.upsert`, addressed by id
 * (never placed into the timeline). Flows at 'turn' grade and up, so even
 * coarse subscribers see queue state.
 */
export interface PromptUpsertOp {
  readonly op: 'prompt.upsert';
  readonly prompt: TranscriptPrompt;
}

export interface MetaMergeOp {
  readonly op: 'meta.merge';
  readonly meta: TranscriptMetaMerge;
}

/** Structural correction (undo / clear). Removes whole items by id; idempotent. */
export interface ItemsRemoveOp {
  readonly op: 'items.remove';
  readonly ids: readonly string[];
}
export type TranscriptOperation =
  | ResetOp
  | TurnUpsertOp
  | StepUpsertOp
  | FrameUpsertOp
  | AppendOp
  | MarkerUpsertOp
  | TaskRefUpsertOp
  | TaskUpsertOp
  | InteractionUpsertOp
  | AttachmentUpsertOp
  | TodoUpsertOp
  | PromptUpsertOp
  | MetaMergeOp
  | ItemsRemoveOp;

export interface TranscriptOpBatch {
  readonly agentId: AgentId;
  readonly ops: readonly TranscriptOperation[];
}

/**
 * One remembered standalone-placement anchor, in JSON-safe wire form: the
 * reducer-internal placement map re-keyed as an explicit `itemId` entry (a
 * Map cannot cross a process boundary). Mirrors the `beforeTurn` /
 * `beforeItem` anchors of the standalone upsert ops, including their
 * contract: `beforeItem` only refines a `beforeTurn` anchor and never
 * appears without one.
 */
export interface StandalonePlacementBaselineEntry {
  readonly itemId: string;
  readonly beforeTurn?: number;
  readonly beforeItem?: string;
}

/**
 * The reducer continuation of a snapshot: the placement memory a consumer
 * must hydrate to keep applying ops convergently on top of it (an ordinal
 * correction or a `beforeItem` chain re-derives the standalone layout from
 * these anchors). This is reducer convergence state, NOT rendering content —
 * a display-only consumer can ignore it. Optional so pre-continuation peers
 * stay wire-compatible; its absence hydrates as an empty memory.
 */
export interface TranscriptContinuation {
  readonly standalonePlacements: readonly StandalonePlacementBaselineEntry[];
}

/** Full materialized state of one AgentTranscript, as used by `reset`. */
export interface AgentTranscriptSnapshot {
  readonly items: readonly TranscriptItem[];
  readonly tasks: readonly TranscriptTask[];
  /** Global interaction entities (approvals / questions); never paginated. */
  readonly interactions: readonly TranscriptInteraction[];
  /** Global attachment entities (media metadata); never paginated. */
  readonly attachments: readonly TranscriptAttachment[];
  /** Global todo documents (latest state); never paginated. */
  readonly todos: readonly TranscriptTodo[];
  /** Global prompt queue entities; never paginated. */
  readonly prompts: readonly TranscriptPrompt[];
  readonly meta: TranscriptMeta;
  /**
   * When the reset only ships a tail window, this flag tells the consumer
   * older turns exist and must be paged in over REST.
   */
  readonly hasMoreOlder?: boolean;
  /**
   * Reducer continuation for exactly this item window — the standalone
   * placement baseline, not rendering content (see `TranscriptContinuation`).
   * Entries cover only standalone items present in `items`; absent when
   * nothing in the window is anchored (or the producer predates the field).
   */
  readonly continuation?: TranscriptContinuation;
}

export interface AppliedOps {
  /** Ops that were accepted and mutated the store (normalized). */
  readonly accepted: readonly TranscriptOperation[];
  /** Set when an `append` could not be placed (offset beyond local length). */
  readonly gap?: { readonly target: AppendTarget; readonly expected: number; readonly got: number };
}

export interface TranscriptChangeEvent {
  readonly agentId: AgentId;
  readonly ops: readonly TranscriptOperation[];
}
