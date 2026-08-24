/**
 * `aitpResearch` domain — wire Models and Ops for the AITP Research Mode.
 *
 * Two models back the Research Mode state:
 *
 * - `AitpModeModel` (checkpointed): holds the mode phase (`inactive` /
 *   `probing` / `ready` / `degraded`), loop status, and the monotonically
 *   increasing revision. It follows conversation undo so entering/exiting
 *   mode and selecting a line can be undone. The `aitp_mode.enter` /
 *   `aitp_mode.exit` / `aitp_mode.set_phase` / `aitp_mode.set_loop_status` /
 *   `aitp_mode.set_line` ops mutate it.
 *
 * - `ResearchModel` (checkpointed): holds the Research working state —
 *   questions, lines, focus, pending checkpoint, and the alert list. It
 *   follows conversation undo so human steering and question lifecycle can be
 *   undone. The `research.create_question` / `research.update_question` /
 *   `research.update_line` / `research.set_focus` / `research.switch_line` /
 *   `research.steer` / `research.propose_checkpoint` /
 *   `research.ack_checkpoint` / `research.reopen_question` /
 *   `research.create_line` ops mutate it.
 *
 * - `ResearchCursorModel` (non-checkpointed): holds the committed cursor and
 *   the global research revision. It does NOT follow conversation undo:
 *   once a checkpoint is committed to AITP, undoing the conversation cannot
 *   retract that external fact. The `research.commit_checkpoint` op advances
 *   it; `research.ack_checkpoint` reconciles the checkpointed working state.
 *
 * Research ops do NOT declare `toEvent`: the `AgentResearchService`
 * explicitly publishes a `research.updated` event carrying the full
 * `ResearchStatusSnapshot` after each direct mutation. Additionally,
 * `AgentResearchService` subscribes to `aitp_mode.updated` and publishes a
 * `research.updated` snapshot on every mode signal, so mode, loop, undo, and
 * degraded transitions all produce a complete snapshot push. Aitp-mode ops
 * keep their `toEvent` (`void` payload) for the lightweight
 * `aitp_mode.updated` signal — this is the single source of the mode signal;
 * `AgentAitpModeService` does not re-publish `aitp_mode.updated` after live
 * ops, but does publish it (plus `agent.status.updated`) on undo / cold
 * restore where `toEvent` is silent. Ops are statically registered (import =
 * register) and extend `PersistedOpMap`. `research.updated` and
 * `aitp_mode.updated` events are declared via `DomainEventMap` augmentation.
 * Scope-agnostic.
 */

import { z } from 'zod';

import {
  defineCheckpointedModel,
  type Checkpointed,
} from '#/agent/contextMemory/conversationTime';
import { defineModel } from '#/wire/model';

import type {
  AitpModePhase,
  ResearchLoopStatus,
  QuestionWorkflow,
  QuestionEpistemic,
  QuestionPersistence,
  ResearchAlert,
  ResearchCommittedCursor,
  ResearchStatusSnapshot,
} from './types';

export interface AitpModeState {
  readonly phase: AitpModePhase;
  readonly loopStatus: ResearchLoopStatus;
  readonly revision: number;
  readonly entryActor?: 'user' | 'model';
  readonly currentLineSlug?: string;
}

export type AitpModeModelState = Checkpointed<AitpModeState>;

export const AitpModeModel = defineCheckpointedModel<AitpModeState>(
  'aitpMode',
  () => ({ phase: 'inactive', loopStatus: 'active', revision: 0 }),
);

const AitpModePhaseSchema = z.enum(['inactive', 'probing', 'ready', 'degraded']);
const ResearchLoopStatusSchema = z.enum(['active', 'paused']);
const EntryActorSchema = z.enum(['user', 'model']);

declare module '#/wire/types' {
  interface PersistedOpMap {
    'aitp_mode.enter': typeof aitpModeEnter;
    'aitp_mode.exit': typeof aitpModeExit;
    'aitp_mode.set_phase': typeof aitpModeSetPhase;
    'aitp_mode.set_loop_status': typeof aitpModeSetLoopStatus;
    'aitp_mode.set_line': typeof aitpModeSetLine;
  }
}

export const aitpModeEnter = AitpModeModel.defineOp('aitp_mode.enter', {
  schema: z.object({
    actor: EntryActorSchema,
    lineSlug: z.string().optional(),
  }),
  apply: (s, p) => {
    if (s.current.phase !== 'inactive') return s;
    return {
      ...s,
      current: {
        ...s.current,
        phase: 'probing',
        revision: s.current.revision + 1,
        entryActor: p.actor,
        currentLineSlug: p.lineSlug,
      },
    };
  },
  toEvent: () => ({ type: 'aitp_mode.updated' as const }),
});

export const aitpModeExit = AitpModeModel.defineOp('aitp_mode.exit', {
  schema: z.object({}),
  apply: (s) => {
    if (s.current.phase === 'inactive') return s;
    return {
      ...s,
      current: {
        phase: 'inactive',
        loopStatus: 'active',
        revision: s.current.revision + 1,
        entryActor: undefined,
        currentLineSlug: undefined,
      },
    };
  },
  toEvent: () => ({ type: 'aitp_mode.updated' as const }),
});

export const aitpModeSetPhase = AitpModeModel.defineOp('aitp_mode.set_phase', {
  schema: z.object({
    phase: AitpModePhaseSchema,
  }),
  apply: (s, p) => {
    if (s.current.phase === p.phase) return s;
    return {
      ...s,
      current: {
        ...s.current,
        phase: p.phase,
        revision: s.current.revision + 1,
      },
    };
  },
  toEvent: () => ({ type: 'aitp_mode.updated' as const }),
});

export const aitpModeSetLoopStatus = AitpModeModel.defineOp('aitp_mode.set_loop_status', {
  schema: z.object({
    loopStatus: ResearchLoopStatusSchema,
  }),
  apply: (s, p) => {
    if (s.current.loopStatus === p.loopStatus) return s;
    return {
      ...s,
      current: {
        ...s.current,
        loopStatus: p.loopStatus,
        revision: s.current.revision + 1,
      },
    };
  },
  toEvent: () => ({ type: 'aitp_mode.updated' as const }),
});

export const aitpModeSetLine = AitpModeModel.defineOp('aitp_mode.set_line', {
  schema: z.object({
    lineSlug: z.string(),
  }),
  apply: (s, p) => {
    if (s.current.currentLineSlug === p.lineSlug) return s;
    return {
      ...s,
      current: {
        ...s.current,
        currentLineSlug: p.lineSlug,
        revision: s.current.revision + 1,
      },
    };
  },
  toEvent: () => ({ type: 'aitp_mode.updated' as const }),
});

export interface ResearchWorkingState {
  readonly questions: Readonly<Record<string, ResearchQuestionRecord>>;
  readonly lines: Readonly<Record<string, ResearchLineRecord>>;
  readonly focus: ResearchFocusRecord | null;
  readonly pendingCheckpoint: ResearchCheckpointRecord | null;
  readonly alerts: readonly ResearchAlert[];
  readonly revision: number;
}

export interface ResearchQuestionRecord {
  readonly id: string;
  readonly lineSlug: string;
  readonly wording: string;
  readonly assessment?: string;
  readonly priority: number;
  readonly neededEvidence: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly falsifierRefs: readonly string[];
  readonly nextBoundedAction?: string;
  readonly workflow: QuestionWorkflow;
  readonly epistemic: QuestionEpistemic;
  readonly persistence: QuestionPersistence;
  readonly revision: number;
}

export interface ResearchLineRecord {
  readonly slug: string;
  readonly title: string;
  readonly objective?: string;
  readonly assessment?: string;
  readonly status: 'active' | 'paused' | 'completed' | 'blocked';
  readonly createdAt: number;
  readonly revision: number;
}

export interface ResearchFocusRecord {
  readonly questionId: string;
  readonly boundedAction?: string;
  readonly revision: number;
}

export interface ResearchCheckpointRecord {
  readonly checkpointId: string;
  readonly questionId?: string;
  readonly lineSlug?: string;
  readonly assessment?: string;
  readonly nextAction?: string;
  readonly idempotencyKey: string;
  readonly persistence: QuestionPersistence;
  readonly createdAt: number;
}

export type ResearchModelState = Checkpointed<ResearchWorkingState>;

export const ResearchModel = defineCheckpointedModel<ResearchWorkingState>(
  'research',
  () => ({
    questions: {},
    lines: {},
    focus: null,
    pendingCheckpoint: null,
    alerts: [],
    revision: 0,
  }),
);

const QuestionWorkflowSchema = z.enum([
  'open', 'active', 'deferred', 'blocked', 'closed', 'cancelled',
]);
const QuestionEpistemicSchema = z.enum([
  'unknown', 'candidate', 'supported', 'contradicted', 'inconclusive',
]);

declare module '#/wire/types' {
  interface PersistedOpMap {
    'research.create_line': typeof researchCreateLine;
    'research.update_line': typeof researchUpdateLine;
    'research.create_question': typeof researchCreateQuestion;
    'research.update_question': typeof researchUpdateQuestion;
    'research.set_focus': typeof researchSetFocus;
    'research.switch_line': typeof researchSwitchLine;
    'research.steer': typeof researchSteer;
    'research.propose_checkpoint': typeof researchProposeCheckpoint;
    'research.commit_checkpoint': typeof researchCommitCheckpoint;
    'research.ack_checkpoint': typeof researchAcknowledgeCheckpoint;
    'research.reopen_question': typeof researchReopenQuestion;
  }
}

export const researchCreateLine = ResearchModel.defineOp('research.create_line', {
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    objective: z.string().optional(),
    assessment: z.string().optional(),
    createdAt: z.number(),
  }),
  apply: (s, p) => {
    if (s.current.lines[p.slug] !== undefined) return s;
    const line: ResearchLineRecord = {
      slug: p.slug,
      title: p.title,
      objective: p.objective,
      assessment: p.assessment,
      status: 'active',
      createdAt: p.createdAt,
      revision: 1,
    };
    return {
      ...s,
      current: {
        ...s.current,
        lines: { ...s.current.lines, [p.slug]: line },
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchUpdateLine = ResearchModel.defineOp('research.update_line', {
  schema: z.object({
    slug: z.string(),
    expectedRevision: z.number(),
    title: z.string().optional(),
    objective: z.string().optional(),
    status: z.enum(['active', 'paused', 'completed', 'blocked']).optional(),
    assessment: z.string().optional(),
    reason: z.string().optional(),
  }),
  apply: (s, p) => {
    const existing = s.current.lines[p.slug];
    if (existing === undefined) return s;
    if (p.expectedRevision !== 0 && existing.revision !== p.expectedRevision) return s;
    const updated: ResearchLineRecord = {
      ...existing,
      title: p.title ?? existing.title,
      objective: p.objective ?? existing.objective,
      status: p.status ?? existing.status,
      assessment: p.assessment ?? existing.assessment,
      revision: existing.revision + 1,
    };
    return {
      ...s,
      current: {
        ...s.current,
        lines: { ...s.current.lines, [p.slug]: updated },
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchCreateQuestion = ResearchModel.defineOp('research.create_question', {
  schema: z.object({
    id: z.string(),
    lineSlug: z.string(),
    wording: z.string(),
    assessment: z.string().optional(),
    priority: z.number().default(0),
    neededEvidence: z.array(z.string()).default([]),
  }),
  apply: (s, p) => {
    if (s.current.questions[p.id] !== undefined) return s;
    if (s.current.lines[p.lineSlug] === undefined) return s;
    const question: ResearchQuestionRecord = {
      id: p.id,
      lineSlug: p.lineSlug,
      wording: p.wording,
      assessment: p.assessment,
      priority: p.priority,
      neededEvidence: p.neededEvidence,
      evidenceRefs: [],
      falsifierRefs: [],
      workflow: 'open',
      epistemic: 'unknown',
      persistence: 'working',
      revision: 1,
    };
    return {
      ...s,
      current: {
        ...s.current,
        questions: { ...s.current.questions, [p.id]: question },
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchUpdateQuestion = ResearchModel.defineOp('research.update_question', {
  schema: z.object({
    questionId: z.string(),
    expectedRevision: z.number(),
    wording: z.string().optional(),
    assessment: z.string().optional(),
    priority: z.number().optional(),
    workflow: QuestionWorkflowSchema.optional(),
    epistemic: QuestionEpistemicSchema.optional(),
    neededEvidence: z.array(z.string()).optional(),
    nextBoundedAction: z.string().optional(),
    evidenceRefs: z.array(z.string()).optional(),
    falsifierRefs: z.array(z.string()).optional(),
    reason: z.string().optional(),
    actor: z.enum(['human', 'model']).default('model'),
  }),
  apply: (s, p) => {
    const existing = s.current.questions[p.questionId];
    if (existing === undefined) return s;
    if (p.expectedRevision !== 0 && existing.revision !== p.expectedRevision) return s;
    const updated: ResearchQuestionRecord = {
      ...existing,
      wording: p.wording ?? existing.wording,
      assessment: p.assessment ?? existing.assessment,
      priority: p.priority ?? existing.priority,
      workflow: p.workflow ?? existing.workflow,
      epistemic: p.epistemic ?? existing.epistemic,
      neededEvidence: p.neededEvidence ?? existing.neededEvidence,
      nextBoundedAction: p.nextBoundedAction ?? existing.nextBoundedAction,
      evidenceRefs: p.evidenceRefs ?? existing.evidenceRefs,
      falsifierRefs: p.falsifierRefs ?? existing.falsifierRefs,
      revision: existing.revision + 1,
    };
    return {
      ...s,
      current: {
        ...s.current,
        questions: { ...s.current.questions, [p.questionId]: updated },
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchSetFocus = ResearchModel.defineOp('research.set_focus', {
  schema: z.object({
    questionId: z.string(),
    boundedAction: z.string().optional(),
    expectedRevision: z.number(),
  }),
  apply: (s, p) => {
    const question = s.current.questions[p.questionId];
    if (question === undefined || s.current.lines[question.lineSlug] === undefined) return s;
    if (p.expectedRevision !== 0 && s.current.revision !== p.expectedRevision) return s;
    return {
      ...s,
      current: {
        ...s.current,
        focus: {
          questionId: p.questionId,
          boundedAction: p.boundedAction,
          revision: s.current.revision + 1,
        },
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchSwitchLine = ResearchModel.defineOp('research.switch_line', {
  schema: z.object({
    lineSlug: z.string(),
    expectedRevision: z.number(),
  }),
  apply: (s, p) => {
    if (s.current.lines[p.lineSlug] === undefined) return s;
    if (p.expectedRevision !== 0 && s.current.revision !== p.expectedRevision) return s;
    const focusQuestion = s.current.focus === null
      ? undefined
      : s.current.questions[s.current.focus.questionId];
    const focus = focusQuestion?.lineSlug === p.lineSlug ? s.current.focus : null;
    return {
      ...s,
      current: {
        ...s.current,
        focus,
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchSteer = ResearchModel.defineOp('research.steer', {
  schema: z.object({
    kind: z.enum([
      'set_focus', 'update_question', 'switch_line',
      'pause_loop', 'resume_loop',
      'reopen_question', 'defer_question', 'block_question', 'close_question',
    ]),
    questionId: z.string().optional(),
    lineSlug: z.string().optional(),
    expectedRevision: z.number(),
    boundedAction: z.string().optional(),
    wording: z.string().optional(),
    assessment: z.string().optional(),
    priority: z.number().optional(),
    workflow: QuestionWorkflowSchema.optional(),
    epistemic: QuestionEpistemicSchema.optional(),
    neededEvidence: z.array(z.string()).optional(),
    nextBoundedAction: z.string().optional(),
    reason: z.string().optional(),
    actor: z.enum(['human', 'model']).default('human'),
  }),
  apply: (s, p) => {
    if (p.kind === 'pause_loop' || p.kind === 'resume_loop') return s;
    if (p.expectedRevision !== 0 && s.current.revision !== p.expectedRevision) return s;
    if (p.questionId !== undefined && s.current.questions[p.questionId] === undefined) return s;
    let questions = s.current.questions;
    let focus = s.current.focus;
    const revision = s.current.revision + 1;

    if (p.questionId !== undefined) {
      const existing = questions[p.questionId]!;
      let workflow = existing.workflow;
      if (p.kind === 'defer_question') workflow = 'deferred';
      else if (p.kind === 'block_question') workflow = 'blocked';
      else if (p.kind === 'close_question') workflow = 'closed';
      else if (p.kind === 'reopen_question') workflow = 'open';
      else if (p.workflow !== undefined) workflow = p.workflow;

      questions = {
        ...questions,
        [p.questionId]: {
          ...existing,
          workflow,
          wording: p.wording ?? existing.wording,
          assessment: p.assessment ?? existing.assessment,
          priority: p.priority ?? existing.priority,
          epistemic: p.epistemic ?? existing.epistemic,
          neededEvidence: p.neededEvidence ?? existing.neededEvidence,
          nextBoundedAction: p.nextBoundedAction ?? existing.nextBoundedAction,
          revision: existing.revision + 1,
        },
      };

      if (p.kind === 'set_focus' || (p.kind === 'update_question' && p.questionId === focus?.questionId)) {
        focus = {
          questionId: p.questionId,
          boundedAction: p.kind === 'set_focus'
            ? p.boundedAction
            : p.nextBoundedAction ?? focus?.boundedAction,
          revision,
        };
      }
      if (workflow === 'closed' || workflow === 'cancelled' || workflow === 'deferred') {
        if (focus?.questionId === p.questionId) focus = null;
      }
    }

    return {
      ...s,
      current: {
        ...s.current,
        questions,
        focus,
        revision,
      },
    };
  },
});

export const researchProposeCheckpoint = ResearchModel.defineOp('research.propose_checkpoint', {
  schema: z.object({
    checkpointId: z.string(),
    questionId: z.string().optional(),
    lineSlug: z.string().optional(),
    assessment: z.string().optional(),
    nextAction: z.string().optional(),
    idempotencyKey: z.string(),
    createdAt: z.number(),
  }),
  apply: (s, p) => {
    if (s.current.pendingCheckpoint !== null) return s;
    const question = p.questionId === undefined ? undefined : s.current.questions[p.questionId];
    const line = p.lineSlug === undefined ? undefined : s.current.lines[p.lineSlug];
    if (
      (p.questionId !== undefined && question === undefined) ||
      (p.lineSlug !== undefined && line === undefined) ||
      (question !== undefined && p.lineSlug !== undefined && question.lineSlug !== p.lineSlug)
    ) return s;
    const checkpoint: ResearchCheckpointRecord = {
      checkpointId: p.checkpointId,
      questionId: p.questionId,
      lineSlug: p.lineSlug,
      assessment: p.assessment,
      nextAction: p.nextAction,
      idempotencyKey: p.idempotencyKey,
      persistence: 'pending_commit',
      createdAt: p.createdAt,
    };
    let questions = s.current.questions;
    if (question !== undefined && question.persistence !== 'pending_commit') {
      questions = {
        ...questions,
        [question.id]: {
          ...question,
          persistence: 'pending_commit',
          revision: question.revision + 1,
        },
      };
    }
    return {
      ...s,
      current: {
        ...s.current,
        questions,
        pendingCheckpoint: checkpoint,
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchReopenQuestion = ResearchModel.defineOp('research.reopen_question', {
  schema: z.object({
    questionId: z.string(),
    expectedRevision: z.number(),
    reason: z.string().optional(),
  }),
  apply: (s, p) => {
    const existing = s.current.questions[p.questionId];
    if (existing === undefined) return s;
    if (p.expectedRevision !== 0 && existing.revision !== p.expectedRevision) return s;
    const reopened: ResearchQuestionRecord = {
      ...existing,
      workflow: 'open',
      persistence: 'working',
      revision: existing.revision + 1,
    };
    return {
      ...s,
      current: {
        ...s.current,
        questions: { ...s.current.questions, [p.questionId]: reopened },
        revision: s.current.revision + 1,
      },
    };
  },
});

export interface ResearchCursorState {
  readonly cursor: ResearchCommittedCursor | null;
  readonly revision: number;
}

export const ResearchCursorModel = defineModel<ResearchCursorState>(
  'researchCursor',
  () => ({ cursor: null, revision: 0 }),
);

export const researchCommitCheckpoint = ResearchCursorModel.defineOp('research.commit_checkpoint', {
  schema: z.object({
    checkpointId: z.string(),
    entryId: z.string(),
    committedAt: z.number(),
  }),
  apply: (s, p) => {
    if (
      s.cursor?.checkpointId === p.checkpointId &&
      s.cursor.entryId === p.entryId
    ) {
      return s;
    }
    if (s.cursor !== null) return s;
    return {
      cursor: {
        checkpointId: p.checkpointId,
        entryId: p.entryId,
        committedAt: p.committedAt,
      },
      revision: s.revision + 1,
    };
  },
});

export const researchAcknowledgeCheckpoint = ResearchModel.defineOp('research.ack_checkpoint', {
  schema: z.object({
    checkpointId: z.string(),
    entryId: z.string().optional(),
  }),
  apply: (s, p) => {
    const pending = s.current.pendingCheckpoint;
    if (pending === null || pending.checkpointId !== p.checkpointId) return s;
    const question = pending.questionId === undefined
      ? undefined
      : s.current.questions[pending.questionId];
    const questions = question === undefined || question.persistence === 'committed'
      ? s.current.questions
      : {
          ...s.current.questions,
          [question.id]: {
            ...question,
            persistence: 'committed' as const,
            revision: question.revision + 1,
          },
        };
    return {
      ...s,
      current: {
        ...s.current,
        questions,
        pendingCheckpoint: null,
        revision: s.current.revision + 1,
      },
    };
  },
});

declare module '#/app/event/eventBus' {
  interface DomainEventMap {
    'aitp_mode.updated': void;
    'research.updated': { readonly snapshot: ResearchStatusSnapshot };
  }
}
