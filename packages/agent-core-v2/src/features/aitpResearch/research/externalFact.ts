/**
 * `aitpResearch` domain — `IAitpExternalFactService` contract.
 *
 * Owns the read/write/clean surface of the non-checkpointed external-fact
 * view of AITP checkpoint commits: the committed cursor, the ordered commit
 * history, and the global revision. This is the single facade through which
 * Research code accesses committed AITP facts, so the backing `ResearchCursorModel`
 * stays a replayable wire model while callers never read or mutate it directly.
 * Reads are pure and idempotent: they only project the current wire state and
 * never dispatch an op or publish an event; writes dispatch the
 * `research.commit_checkpoint` op (idempotent on a repeated commit) and never
 * touch the checkpointed `ResearchModel`. The view deliberately does NOT
 * follow conversation undo — a checkpoint committed to AITP is an external
 * fact that `context.undo` cannot retract. Bound at Agent scope.
 */

import { createDecorator } from '#/_base/di/instantiation';

import type { ResearchCommittedCursor } from '../types';

export interface CommitExternalFactInput {
  readonly checkpointId: string;
  readonly entryId: string;
  readonly committedAt: number;
  /** Readonly DTO receipt; the facade converts it to the wire shape. */
  readonly receipt?: ResearchCommittedCursor['receipt'];
}

export interface IAitpExternalFactService {
  readonly _serviceBrand: undefined;

  /** The latest committed cursor, or `null` when nothing has been committed. */
  getCommittedCursor(): ResearchCommittedCursor | null;

  /** Every committed checkpoint/Entry in commit order, oldest first. */
  getCommitHistory(): readonly ResearchCommittedCursor[];

  /** Monotonically increasing count of `research.commit_checkpoint` applies. */
  getRevision(): number;

  /**
   * Append a new commit to both the cursor and the history (idempotent on a
   * repeated checkpoint/Entry, no-op on a same-checkpoint different-Entry
   * conflict).
   */
  commitExternalFact(input: CommitExternalFactInput): void;
}

export const IAitpExternalFactService = createDecorator<IAitpExternalFactService>(
  'aitpExternalFactService',
);
