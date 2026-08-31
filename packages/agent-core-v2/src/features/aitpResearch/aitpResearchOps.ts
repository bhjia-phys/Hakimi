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
 *   questions, lines, focus, pending checkpoint, the alert list, and the
 *   scientific state layer (phase / current action / latest progress / recent
 *   state change / human gate). It follows conversation undo so human
 *   steering and question lifecycle can be undone. The
 *   `research.create_question` / `research.update_question` /
 *   `research.update_line` / `research.set_focus` / `research.switch_line` /
 *   `research.steer` / `research.propose_checkpoint` /
 *   `research.ack_checkpoint` / `research.reopen_question` /
 *   `research.upsert_alert` / `research.clear_alert` /
 *   `research.ack_alert` / `research.create_line` ops, the
 *   scientific-loop ops `research.plan_action` / `research.start_action` /
 *   `research.complete_action` / `research.record_progress` /
 *   `research.set_phase` / `research.request_human_decision` /
 *   `research.resolve_human_decision`, and the local layered-state ops
 *   `research.set_program` / `research.confirm_goal_alignment` /
 *   `research.clear_goal_alignment` / `research.start_period` /
 *   `research.update_period` / `research.end_period` (the topic-bound
 *   program, explicit Goal-to-Program binding, and auditable period window;
 *   created/updated only at clear semantic points by `AgentResearchService`)
 *   mutate it. Alert production is
 *   owned by
 *   `AgentResearchService`, while these alert ops provide replayable state
 *   transitions.
 *
 * - `ResearchCursorModel` (non-checkpointed): holds the committed cursor
 *   (latest commit), an ordered `history` of every committed checkpoint/Entry,
 *   and the global research revision. It does NOT follow conversation undo:
 *   once a checkpoint is committed to AITP, undoing the conversation cannot
 *   retract that external fact. The `research.commit_checkpoint` op appends a
 *   new commit to both `cursor` and `history` (idempotent on a repeated
 *   checkpoint/Entry); `research.ack_checkpoint` reconciles the checkpointed
 *   working state.
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
  ResearchActionKind,
  ResearchActionStatus,
  ResearchRunState,
  ResearchAlert,
  ResearchCheckpointReceipt,
  ResearchCommittedCursor,
  ResearchHumanGateKind,
  ResearchPhase,
  ResearchProgram,
  ResearchGoalProgramBinding,
  ResearchPeriod,
  ResearchStatusSnapshot,
} from './types';
import {
  PLAN_ACTION_PHASES,
  isLiveForegroundAction,
  isPhaseTransitionValid,
  isUnresolvedHumanGate,
} from './transitions/researchTransitionAuthority';

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
  readonly phase: ResearchPhase;
  readonly currentAction: ResearchActionSpecRecord | null;
  readonly currentRun: ResearchRunStateRecord | null;
  readonly latestProgress: ResearchProgressReportRecord | null;
  readonly recentStateChange: ResearchStateChangeRecord | null;
  readonly humanGate: ResearchHumanGateRecord | null;
  readonly program: ResearchProgramRecord | null;
  readonly goalProgramBinding?: ResearchGoalProgramBindingRecord | null;
  readonly period: ResearchPeriodRecord | null;
  readonly periodHistory: readonly ResearchPeriodRecord[];
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
  readonly committedEntryId?: string;
  readonly questionId?: string;
  readonly questionRevision?: number;
  readonly lineSlug?: string;
  readonly assessment?: string;
  readonly nextAction?: string;
  readonly idempotencyKey: string;
  readonly persistence: QuestionPersistence;
  readonly receipt?: ResearchCheckpointReceipt;
  readonly createdAt: number;
}

export interface ResearchRunStateRecord extends ResearchRunState {}

export interface ResearchActionSpecRecord {
  readonly actionId: string;
  readonly questionId?: string;
  readonly lineSlug?: string;
  readonly kind: ResearchActionKind;
  readonly purpose: string;
  readonly expectedEvidence: readonly string[];
  readonly stopCondition: string;
  readonly allowedToolKinds: readonly string[];
  readonly retryOfEntryId?: string;
  readonly status: ResearchActionStatus;
  readonly createdAt: number;
  readonly completedAt?: number;
  readonly requiresHumanApproval: boolean;
  readonly run?: ResearchRunStateRecord;
}

export interface ResearchProgressDetailRecord {
  readonly assumptions?: readonly string[];
  readonly derivation?: string;
  readonly tests?: readonly string[];
  readonly observations?: readonly string[];
  readonly sources?: readonly string[];
  readonly limitations?: readonly string[];
  readonly detailHint?: string;
  readonly artifactRefs?: readonly string[];
}

export interface ResearchProgressReportRecord {
  readonly headline: string;
  readonly question?: string;
  readonly motivation: string;
  readonly workPerformed: string;
  readonly result: string;
  readonly mainlineImpact: string;
  readonly uncertainties: readonly string[];
  readonly nextAction?: string;
  readonly phaseChange?: { readonly from: ResearchPhase; readonly to: ResearchPhase };
  readonly humanDecision?: string;
  readonly detail?: ResearchProgressDetailRecord;
  readonly recordedAt: number;
}

export interface ResearchStateChangeRecord {
  readonly beforePhase: ResearchPhase;
  readonly afterPhase: ResearchPhase;
  readonly actionId?: string;
  readonly summary: string;
  readonly changedAt: number;
}

export interface ResearchHumanGateRecord {
  readonly gateId: string;
  readonly kind: ResearchHumanGateKind;
  readonly actionId?: string;
  readonly questionId?: string;
  readonly prompt: string;
  readonly resolvedAt?: number;
  readonly resolution?: string;
  readonly createdAt: number;
}

export interface ResearchProgramRecord extends Omit<ResearchProgram, 'observedRevision'> {
  /** Absent only in a replayed record written before observedRevision existed. */
  readonly observedRevision?: number;
}

export interface ResearchGoalProgramBindingRecord extends ResearchGoalProgramBinding {}

export interface ResearchPeriodRecord extends ResearchPeriod {}

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
    phase: 'idle',
    currentAction: null,
    currentRun: null,
    latestProgress: null,
    recentStateChange: null,
    humanGate: null,
    program: null,
    goalProgramBinding: null,
    period: null,
    periodHistory: [],
  }),
);

const QuestionWorkflowSchema = z.enum([
  'open', 'active', 'deferred', 'blocked', 'closed', 'cancelled',
]);
const QuestionEpistemicSchema = z.enum([
  'unknown', 'candidate', 'supported', 'contradicted', 'inconclusive',
]);

const ResearchPhaseSchema = z.enum([
  'idle', 'orienting', 'gap_analysis', 'action_planned', 'action_executing',
  'evaluating', 'state_updated', 'checkpoint_pending', 'awaiting_human',
]);
const ResearchActionKindSchema = z.enum([
  'experiment', 'derivation', 'literature_review', 'data_analysis', 'simulation', 'other',
]);
const ResearchHumanGateKindSchema = z.enum(['approval', 'review', 'decision']);

const StringListSchema = z.array(z.string().max(500)).max(50);
const ShortTextSchema = z.string().max(2000);
const LongTextSchema = z.string().max(8000);

const ResearchCheckpointCheckReceiptSchema = z.object({
  status: z.enum(['clean', 'findings']),
  errors: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  findingFingerprints: StringListSchema,
  errorFindingFingerprints: StringListSchema,
  newErrorFindingFingerprints: StringListSchema.optional(),
  preExistingErrorFindingFingerprints: StringListSchema.optional(),
  checkedAt: z.number(),
}).strict();
const ResearchCheckpointPrepareReceiptSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('prepared'),
    id: z.string(),
    path: z.string(),
    idempotencyKey: z.string().optional(),
    workstreams: StringListSchema.optional(),
  }).strict(),
  z.object({
    status: z.literal('existing'),
    id: z.string().optional(),
    path: z.string(),
    idempotencyKey: z.string(),
    workstreams: StringListSchema.optional(),
  }).strict(),
]);
const ResearchCheckpointSaveReceiptSchema = z.object({
  status: z.enum(['saved', 'already_saved']),
  draftPath: z.string(),
  path: z.string(),
  source: z.enum(['record_save', 'prepare_existing']).optional(),
}).strict();
const ResearchCheckpointReceiptSchema = z.object({
  prepare: ResearchCheckpointPrepareReceiptSchema.optional(),
  save: ResearchCheckpointSaveReceiptSchema.optional(),
  preSaveCheck: ResearchCheckpointCheckReceiptSchema.optional(),
  postSaveCheck: ResearchCheckpointCheckReceiptSchema.optional(),
}).strict();

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
    'research.bind_checkpoint_receipt': typeof researchBindCheckpointReceipt;
    'research.commit_checkpoint': typeof researchCommitCheckpoint;
    'research.ack_checkpoint': typeof researchAcknowledgeCheckpoint;
    'research.reopen_question': typeof researchReopenQuestion;
    'research.upsert_alert': typeof researchUpsertAlert;
    'research.clear_alert': typeof researchClearAlert;
    'research.ack_alert': typeof researchAcknowledgeAlert;
    'research.plan_action': typeof researchPlanAction;
    'research.begin_action': typeof researchBeginAction;
    'research.start_action': typeof researchStartAction;
    'research.complete_action': typeof researchCompleteAction;
    'research.observe_run': typeof researchObserveRun;
    'research.record_progress': typeof researchRecordProgress;
    'research.set_phase': typeof researchSetPhase;
    'research.request_human_decision': typeof researchRequestHumanDecision;
    'research.resolve_human_decision': typeof researchResolveHumanDecision;
    'research.set_program': typeof researchSetProgram;
    'research.confirm_goal_alignment': typeof researchConfirmGoalAlignment;
    'research.clear_goal_alignment': typeof researchClearGoalAlignment;
    'research.start_period': typeof researchStartPeriod;
    'research.update_period': typeof researchUpdatePeriod;
    'research.end_period': typeof researchEndPeriod;
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
    return {
      ...s,
      current: {
        ...s.current,
        focus: null,
        phase: 'idle',
        currentAction: null,
        currentRun: null,
        latestProgress: null,
        recentStateChange: null,
        humanGate: null,
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
    committedEntryId: z.string().optional(),
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
      committedEntryId: p.committedEntryId,
      questionId: p.questionId,
      questionRevision: question === undefined
        ? undefined
        : question.revision + (question.persistence === 'pending_commit' ? 0 : 1),
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

export const researchBindCheckpointEntry = ResearchModel.defineOp('research.bind_checkpoint_entry', {
  schema: z.object({
    checkpointId: z.string(),
    entryId: z.string(),
  }),
  apply: (s, p) => {
    const pending = s.current.pendingCheckpoint;
    if (pending === null || pending.checkpointId !== p.checkpointId) return s;
    if (pending.committedEntryId !== undefined) return s;
    return {
      ...s,
      current: {
        ...s.current,
        pendingCheckpoint: {
          ...pending,
          committedEntryId: p.entryId,
        },
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchBindCheckpointReceipt = ResearchModel.defineOp('research.bind_checkpoint_receipt', {
  schema: z.object({
    checkpointId: z.string(),
    receipt: ResearchCheckpointReceiptSchema,
  }).strict(),
  apply: (s, p) => {
    const pending = s.current.pendingCheckpoint;
    if (pending === null || pending.checkpointId !== p.checkpointId) return s;
    const currentReceipt = pending.receipt;
    const nextReceipt: ResearchCheckpointReceipt = {
      prepare: p.receipt.prepare ?? currentReceipt?.prepare,
      save: p.receipt.save ?? currentReceipt?.save,
      preSaveCheck: p.receipt.preSaveCheck ?? currentReceipt?.preSaveCheck,
      postSaveCheck: p.receipt.postSaveCheck ?? currentReceipt?.postSaveCheck,
    };
    if (sameCheckpointReceipt(currentReceipt, nextReceipt)) return s;
    return {
      ...s,
      current: {
        ...s.current,
        pendingCheckpoint: { ...pending, receipt: nextReceipt },
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

export const researchUpsertAlert = ResearchModel.defineOp('research.upsert_alert', {
  schema: z.object({
    fingerprint: z.string().min(1),
    kind: z.enum(['contradiction', 'blocked', 'reopened', 'commit_failed', 'degraded', 'stale']),
    classification: z.enum(['active_blocker', 'historical_unresolved', 'superseded_by_retry', 'warning']).optional(),
    source: z.enum(['question', 'aitp_failure', 'aitp_check', 'adapter', 'checkpoint']).optional(),
    state: z.enum(['active', 'acknowledged', 'cleared', 'superseded']).optional(),
    message: z.string(),
    questionId: z.string().optional(),
    lineSlug: z.string().optional(),
    relatedEntryId: z.string().optional(),
    workstream: z.string().optional(),
    retryOfEntryId: z.string().optional(),
    reason: z.string().optional(),
    createdAt: z.number(),
  }),
  apply: (s, p) => {
    const classification = p.classification ?? (p.kind === 'blocked' ? 'active_blocker' : 'warning');
    const source = p.source ?? (p.questionId === undefined ? 'adapter' : 'question');
    const requestedState = p.state ?? 'active';
    const existingIndex = s.current.alerts.findIndex((alert) => alert.fingerprint === p.fingerprint);
    if (existingIndex === -1) {
      const alert: ResearchAlert = {
        fingerprint: p.fingerprint,
        kind: p.kind,
        classification,
        source,
        state: requestedState,
        message: p.message,
        questionId: p.questionId,
        lineSlug: p.lineSlug,
        relatedEntryId: p.relatedEntryId,
        workstream: p.workstream,
        retryOfEntryId: p.retryOfEntryId,
        reason: p.reason,
        createdAt: p.createdAt,
      };
      return {
        ...s,
        current: {
          ...s.current,
          alerts: [...s.current.alerts, alert],
          revision: s.current.revision + 1,
        },
      };
    }

    const existing = s.current.alerts[existingIndex]!;
    const recurring = existing.state === 'cleared' && requestedState === 'active';
    const nextState = !recurring && existing.acknowledgedAt !== undefined && requestedState === 'active'
      ? 'acknowledged'
      : requestedState;
    const nextAcknowledgedAt = recurring ? undefined : existing.acknowledgedAt;
    if (
      existing.kind === p.kind &&
      existing.classification === classification &&
      existing.source === source &&
      existing.state === nextState &&
      existing.acknowledgedAt === nextAcknowledgedAt &&
      existing.message === p.message &&
      existing.questionId === p.questionId &&
      existing.lineSlug === p.lineSlug &&
      existing.relatedEntryId === p.relatedEntryId &&
      existing.workstream === p.workstream &&
      existing.retryOfEntryId === p.retryOfEntryId &&
      existing.reason === p.reason
    ) return s;

    const alerts = [...s.current.alerts];
    alerts[existingIndex] = {
      ...existing,
      kind: p.kind,
      classification,
      source,
      state: nextState,
      acknowledgedAt: nextAcknowledgedAt,
      message: p.message,
      questionId: p.questionId,
      lineSlug: p.lineSlug,
      relatedEntryId: p.relatedEntryId,
      workstream: p.workstream,
      retryOfEntryId: p.retryOfEntryId,
      reason: p.reason,
    };
    return {
      ...s,
      current: {
        ...s.current,
        alerts,
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchClearAlert = ResearchModel.defineOp('research.clear_alert', {
  schema: z.object({ fingerprint: z.string().min(1) }),
  apply: (s, p) => {
    const existingIndex = s.current.alerts.findIndex((alert) => alert.fingerprint === p.fingerprint);
    if (existingIndex === -1) return s;
    const existing = s.current.alerts[existingIndex]!;
    if (existing.state === 'cleared') return s;
    const alerts = [...s.current.alerts];
    alerts[existingIndex] = {
      ...existing,
      state: 'cleared',
    };
    return {
      ...s,
      current: {
        ...s.current,
        alerts,
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchAcknowledgeAlert = ResearchModel.defineOp('research.ack_alert', {
  schema: z.object({
    fingerprint: z.string().min(1),
    acknowledgedAt: z.number(),
  }),
  apply: (s, p) => {
    const existingIndex = s.current.alerts.findIndex((alert) => alert.fingerprint === p.fingerprint);
    if (existingIndex === -1) return s;
    const existing = s.current.alerts[existingIndex]!;
    if (existing.acknowledgedAt !== undefined) return s;
    const alerts = [...s.current.alerts];
    alerts[existingIndex] = {
      ...existing,
      state: 'acknowledged',
      acknowledgedAt: p.acknowledgedAt,
    };
    return {
      ...s,
      current: {
        ...s.current,
        alerts,
        revision: s.current.revision + 1,
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Research Loop scientific state ops (Phase 1)
//
// These ops mutate the scientific state layer (phase / action / progress /
// state change / human gate) without touching AITP persistence. Phase and
// invariant checks live in the `transitions/researchTransitionAuthority`
// module; ops that violate them are no-ops (return state unchanged), so they
// replay safely. The service layer performs the pre-dispatch validation
// (throws on invalid transitions, missing actions, wrong action status, or
// mismatched gates) so callers get clear errors on live calls while replay
// stays idempotent.
// ---------------------------------------------------------------------------

export const researchPlanAction = ResearchModel.defineOp('research.plan_action', {
  schema: z.object({
    actionId: z.string(),
    questionId: z.string().optional(),
    lineSlug: z.string().optional(),
    kind: ResearchActionKindSchema,
    purpose: LongTextSchema,
    expectedEvidence: StringListSchema,
    stopCondition: ShortTextSchema,
    allowedToolKinds: StringListSchema,
    retryOfEntryId: z.string().optional(),
    requiresHumanApproval: z.boolean(),
    createdAt: z.number(),
  }),
  apply: (s, p) => {
    if (!PLAN_ACTION_PHASES.includes(s.current.phase)) return s;
    if (isLiveForegroundAction(s.current.currentAction)) return s;
    if (isUnresolvedHumanGate(s.current.humanGate)) return s;
    const question = p.questionId === undefined ? undefined : s.current.questions[p.questionId];
    if (p.questionId !== undefined && question === undefined) return s;
    if (p.lineSlug !== undefined && s.current.lines[p.lineSlug] === undefined) return s;
    if (question !== undefined && p.lineSlug !== undefined && question.lineSlug !== p.lineSlug) return s;
    const action: ResearchActionSpecRecord = {
      actionId: p.actionId,
      questionId: p.questionId,
      lineSlug: p.lineSlug,
      kind: p.kind,
      purpose: p.purpose,
      expectedEvidence: p.expectedEvidence,
      stopCondition: p.stopCondition,
      allowedToolKinds: p.allowedToolKinds,
      retryOfEntryId: p.retryOfEntryId,
      status: 'planned',
      createdAt: p.createdAt,
      requiresHumanApproval: p.requiresHumanApproval,
    };
    return {
      ...s,
      current: {
        ...s.current,
        phase: 'action_planned',
        currentAction: action,
        currentRun: null,
        revision: s.current.revision + 1,
      },
    };
  },
});

/**
 * Atomic fast path for a non-gated bounded action. The strict plan/start Ops
 * remain available for explicit approval workflows; this Op prevents the
 * common BeginResearchAction path from leaving a planned action behind if a
 * second dispatch would fail.
 */
export const researchBeginAction = ResearchModel.defineOp('research.begin_action', {
  schema: z.object({
    actionId: z.string(),
    questionId: z.string().optional(),
    lineSlug: z.string().optional(),
    kind: ResearchActionKindSchema,
    purpose: LongTextSchema,
    expectedEvidence: StringListSchema,
    stopCondition: ShortTextSchema,
    allowedToolKinds: StringListSchema,
    retryOfEntryId: z.string().optional(),
    requiresHumanApproval: z.literal(false),
    createdAt: z.number(),
  }),
  apply: (s, p) => {
    if (!PLAN_ACTION_PHASES.includes(s.current.phase)) return s;
    if (isLiveForegroundAction(s.current.currentAction)) return s;
    if (isUnresolvedHumanGate(s.current.humanGate)) return s;
    const question = p.questionId === undefined ? undefined : s.current.questions[p.questionId];
    if (p.questionId !== undefined && question === undefined) return s;
    if (p.lineSlug !== undefined && s.current.lines[p.lineSlug] === undefined) return s;
    if (question !== undefined && p.lineSlug !== undefined && question.lineSlug !== p.lineSlug) return s;
    const action: ResearchActionSpecRecord = {
      actionId: p.actionId,
      questionId: p.questionId,
      lineSlug: p.lineSlug,
      kind: p.kind,
      purpose: p.purpose,
      expectedEvidence: p.expectedEvidence,
      stopCondition: p.stopCondition,
      allowedToolKinds: p.allowedToolKinds,
      retryOfEntryId: p.retryOfEntryId,
      status: 'in_progress',
      createdAt: p.createdAt,
      requiresHumanApproval: false,
    };
    return {
      ...s,
      current: {
        ...s.current,
        phase: 'action_executing',
        currentAction: action,
        currentRun: null,
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchStartAction = ResearchModel.defineOp('research.start_action', {
  schema: z.object({
    actionId: z.string(),
    startedAt: z.number(),
  }),
  apply: (s, p) => {
    const action = s.current.currentAction;
    if (action === null || action.actionId !== p.actionId) return s;
    if (s.current.phase !== 'action_planned') return s;
    if (action.status !== 'planned') return s;
    return {
      ...s,
      current: {
        ...s.current,
        phase: 'action_executing',
        currentAction: { ...action, status: 'in_progress' },
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchCompleteAction = ResearchModel.defineOp('research.complete_action', {
  schema: z.object({
    actionId: z.string(),
    status: z.enum(['completed', 'abandoned']),
    completedAt: z.number(),
  }),
  apply: (s, p) => {
    const action = s.current.currentAction;
    if (action === null || action.actionId !== p.actionId) return s;
    if (s.current.phase !== 'action_executing') return s;
    if (action.status !== 'in_progress') return s;
    return {
      ...s,
      current: {
        ...s.current,
        phase: 'evaluating',
        currentAction: { ...action, status: p.status, completedAt: p.completedAt },
        revision: s.current.revision + 1,
      },
    };
  },
});

const ResearchRunStageSchema = z.enum([
  'queued', 'running', 'scf', 'band', 'analyzing', 'completed', 'failed', 'unknown',
]);
const ResearchSchedulerStateSchema = z.enum([
  'pending', 'running', 'completed', 'failed', 'cancelled', 'unknown',
]);

export const researchObserveRun = ResearchModel.defineOp('research.observe_run', {
  schema: z.object({
    actionId: z.string(),
    campaign: z.string().min(1).max(500),
    jobId: z.string().min(1).max(200),
    sourcePin: z.string().max(500).optional(),
    binaryPin: z.string().max(500).optional(),
    stage: ResearchRunStageSchema,
    schedulerState: ResearchSchedulerStateSchema,
    lastObservedAt: z.number(),
    nextCheckAt: z.number().optional(),
    terminalState: z.enum(['completed', 'failed', 'cancelled']).optional(),
    artifactRefs: StringListSchema,
  }).strict(),
  apply: (s, p) => {
    if (s.current.phase !== 'action_executing') return s;
    if (s.current.currentAction?.actionId !== p.actionId) return s;
    if (s.current.currentAction.status !== 'in_progress') return s;
    const currentRun: ResearchRunStateRecord = {
      actionId: p.actionId,
      campaign: p.campaign,
      jobId: p.jobId,
      sourcePin: p.sourcePin,
      binaryPin: p.binaryPin,
      stage: p.stage,
      schedulerState: p.schedulerState,
      lastObservedAt: p.lastObservedAt,
      nextCheckAt: p.nextCheckAt,
      terminalState: p.terminalState,
      artifactRefs: p.artifactRefs,
    };
    const currentAction = s.current.currentAction === null
      ? null
      : { ...s.current.currentAction, run: currentRun };
    return {
      ...s,
      current: {
        ...s.current,
        currentAction,
        currentRun,
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchRecordProgress = ResearchModel.defineOp('research.record_progress', {
  schema: z.object({
    headline: ShortTextSchema,
    question: ShortTextSchema.optional(),
    motivation: LongTextSchema,
    workPerformed: LongTextSchema,
    result: LongTextSchema,
    mainlineImpact: LongTextSchema,
    uncertainties: StringListSchema,
    nextAction: ShortTextSchema.optional(),
    phaseChange: z.object({
      from: ResearchPhaseSchema,
      to: ResearchPhaseSchema,
    }).optional(),
    humanDecision: ShortTextSchema.optional(),
    detail: z.object({
      assumptions: StringListSchema.optional(),
      derivation: LongTextSchema.optional(),
      tests: StringListSchema.optional(),
      observations: StringListSchema.optional(),
      sources: StringListSchema.optional(),
      limitations: StringListSchema.optional(),
      detailHint: ShortTextSchema.optional(),
      artifactRefs: StringListSchema.optional(),
    }).optional(),
    recordedAt: z.number(),
  }),
  apply: (s, p) => {
    const phase = p.phaseChange !== undefined
      ? (isPhaseTransitionValid(p.phaseChange.from, p.phaseChange.to) ? p.phaseChange.to : s.current.phase)
      : s.current.phase;
    const progress: ResearchProgressReportRecord = {
      headline: p.headline,
      question: p.question,
      motivation: p.motivation,
      workPerformed: p.workPerformed,
      result: p.result,
      mainlineImpact: p.mainlineImpact,
      uncertainties: p.uncertainties,
      nextAction: p.nextAction,
      phaseChange: p.phaseChange,
      humanDecision: p.humanDecision,
      detail: p.detail,
      recordedAt: p.recordedAt,
    };
    const stateChange: ResearchStateChangeRecord | null = p.phaseChange !== undefined
      ? {
          beforePhase: p.phaseChange.from,
          afterPhase: phase,
          actionId: s.current.currentAction?.actionId,
          summary: p.headline,
          changedAt: p.recordedAt,
        }
      : s.current.recentStateChange;
    return {
      ...s,
      current: {
        ...s.current,
        phase,
        latestProgress: progress,
        recentStateChange: stateChange,
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchSetPhase = ResearchModel.defineOp('research.set_phase', {
  schema: z.object({
    phase: ResearchPhaseSchema,
    reason: ShortTextSchema.optional(),
    changedAt: z.number(),
  }),
  apply: (s, p) => {
    if (s.current.phase === p.phase) return s;
    if (!isPhaseTransitionValid(s.current.phase, p.phase)) return s;
    const stateChange: ResearchStateChangeRecord = {
      beforePhase: s.current.phase,
      afterPhase: p.phase,
      actionId: s.current.currentAction?.actionId,
      summary: p.reason ?? `Phase: ${s.current.phase} → ${p.phase}`,
      changedAt: p.changedAt,
    };
    return {
      ...s,
      current: {
        ...s.current,
        phase: p.phase,
        recentStateChange: stateChange,
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchRequestHumanDecision = ResearchModel.defineOp('research.request_human_decision', {
  schema: z.object({
    gateId: z.string(),
    kind: ResearchHumanGateKindSchema,
    actionId: z.string().optional(),
    questionId: z.string().optional(),
    prompt: LongTextSchema,
    createdAt: z.number(),
  }),
  apply: (s, p) => {
    if (p.actionId !== undefined && s.current.currentAction?.actionId !== p.actionId) return s;
    if (p.questionId !== undefined && s.current.questions[p.questionId] === undefined) return s;
    if (isUnresolvedHumanGate(s.current.humanGate)) return s;
    const gate: ResearchHumanGateRecord = {
      gateId: p.gateId,
      kind: p.kind,
      actionId: p.actionId,
      questionId: p.questionId,
      prompt: p.prompt,
      createdAt: p.createdAt,
    };
    return {
      ...s,
      current: {
        ...s.current,
        phase: 'awaiting_human',
        humanGate: gate,
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchResolveHumanDecision = ResearchModel.defineOp('research.resolve_human_decision', {
  schema: z.object({
    gateId: z.string(),
    resolution: ShortTextSchema,
    nextPhase: ResearchPhaseSchema,
    changedAt: z.number(),
  }),
  apply: (s, p) => {
    const gate = s.current.humanGate;
    if (
      s.current.phase !== 'awaiting_human' ||
      gate === null ||
      gate.gateId !== p.gateId ||
      gate.resolvedAt !== undefined ||
      !isPhaseTransitionValid('awaiting_human', p.nextPhase) ||
      (p.nextPhase === 'action_executing' &&
        (s.current.currentAction === null || s.current.currentAction.status !== 'in_progress'))
    ) return s;

    const stateChange: ResearchStateChangeRecord = {
      beforePhase: 'awaiting_human',
      afterPhase: p.nextPhase,
      actionId: s.current.currentAction?.actionId,
      summary: p.resolution,
      changedAt: p.changedAt,
    };
    return {
      ...s,
      current: {
        ...s.current,
        phase: p.nextPhase,
        humanGate: {
          ...gate,
          resolvedAt: p.changedAt,
          resolution: p.resolution,
        },
        recentStateChange: stateChange,
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchSetProgram = ResearchModel.defineOp('research.set_program', {
  schema: z.union([
    z.object({
      topicId: z.string().min(1).max(200),
      title: z.string().min(1).max(500),
      goalText: z.string().max(8000),
      goalSource: z.string().max(500),
      establishedAt: z.number(),
      observedRevision: z.number().int().positive().optional(),
    }).strict(),
    z.object({ clear: z.literal(true) }).strict(),
  ]),
  apply: (s, p) => {
    if ('clear' in p) {
      if (s.current.program === null && s.current.goalProgramBinding === null) return s;
      return {
        ...s,
        current: {
          ...s.current,
          program: null,
          goalProgramBinding: null,
          revision: s.current.revision + 1,
        },
      };
    }
    const program = s.current.program;
    const priorObservedRevision = program?.observedRevision ?? 1;
    const sameTopic = program?.topicId === p.topicId;
    const contentsChanged = sameTopic && (
      program.title !== p.title ||
      program.goalText !== p.goalText ||
      program.goalSource !== p.goalSource
    );
    const observedRevision = p.observedRevision ?? (
      sameTopic ? priorObservedRevision + (contentsChanged ? 1 : 0) : 1
    );
    if (
      program !== null &&
      sameTopic &&
      !contentsChanged &&
      program.establishedAt === p.establishedAt &&
      priorObservedRevision === observedRevision
    ) return s;
    const next: ResearchProgramRecord = {
      topicId: p.topicId,
      title: p.title,
      goalText: p.goalText,
      goalSource: p.goalSource,
      establishedAt: p.establishedAt,
      observedRevision,
    };
    return {
      ...s,
      current: {
        ...s.current,
        program: next,
        revision: s.current.revision + 1,
      },
    };
  },
});

const ResearchGoalAlignmentRelationSchema = z.enum([
  'same_program_goal',
  'goal_parent_of_program',
  'goal_milestone_in_program',
  'unrelated',
]);

const ResearchGoalAlignmentBindingSchema = z.object({
  relation: ResearchGoalAlignmentRelationSchema,
  goalId: z.string().min(1).max(200),
  topicId: z.string().min(1).max(200),
  observedRevision: z.number().int().positive(),
  confirmedAt: z.number(),
}).strict();

const ResearchGoalAlignmentMutationSchema = ResearchGoalAlignmentBindingSchema.extend({
  expectedRevision: z.number().int().nonnegative(),
}).strict();

export const researchConfirmGoalAlignment = ResearchModel.defineOp('research.confirm_goal_alignment', {
  schema: ResearchGoalAlignmentMutationSchema,
  apply: (s, p) => {
    const program = s.current.program;
    if (
      s.current.revision !== p.expectedRevision ||
      program === null ||
      program.topicId !== p.topicId ||
      (program.observedRevision ?? 1) !== p.observedRevision
    ) return s;
    const binding: ResearchGoalProgramBindingRecord = {
      relation: p.relation,
      goalId: p.goalId,
      topicId: p.topicId,
      observedRevision: p.observedRevision,
      confirmedAt: p.confirmedAt,
    };
    const current = s.current.goalProgramBinding;
    if (
      current !== undefined &&
      current !== null &&
      current.relation === binding.relation &&
      current.goalId === binding.goalId &&
      current.topicId === binding.topicId &&
      current.observedRevision === binding.observedRevision &&
      current.confirmedAt === binding.confirmedAt
    ) return s;
    return {
      ...s,
      current: {
        ...s.current,
        goalProgramBinding: binding,
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchClearGoalAlignment = ResearchModel.defineOp('research.clear_goal_alignment', {
  schema: z.object({
    expectedRevision: z.number().int().nonnegative(),
    goalId: z.string().min(1).max(200),
    topicId: z.string().min(1).max(200),
    observedRevision: z.number().int().positive(),
  }).strict(),
  apply: (s, p) => {
    const program = s.current.program;
    if (
      s.current.revision !== p.expectedRevision ||
      program === null ||
      program.topicId !== p.topicId ||
      (program.observedRevision ?? 1) !== p.observedRevision ||
      s.current.goalProgramBinding === undefined ||
      s.current.goalProgramBinding === null
    ) return s;
    return {
      ...s,
      current: {
        ...s.current,
        goalProgramBinding: null,
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchStartPeriod = ResearchModel.defineOp('research.start_period', {
  schema: z.object({
    id: z.string().min(1).max(200),
    lineSlug: z.string().min(1).max(200),
    startedAt: z.number(),
  }),
  apply: (s, p) => {
    const open = s.current.period;
    if (open !== null && open.endedAt === undefined) {
      if (open.lineSlug === p.lineSlug) return s;
      const closed: ResearchPeriodRecord = { ...open, endedAt: p.startedAt };
      const next: ResearchPeriodRecord = {
        id: p.id,
        lineSlug: p.lineSlug,
        startedAt: p.startedAt,
        loopCount: 0,
      };
      return {
        ...s,
        current: {
          ...s.current,
          period: next,
          periodHistory: [...s.current.periodHistory, closed],
          revision: s.current.revision + 1,
        },
      };
    }
    const next: ResearchPeriodRecord = {
      id: p.id,
      lineSlug: p.lineSlug,
      startedAt: p.startedAt,
      loopCount: 0,
    };
    return {
      ...s,
      current: {
        ...s.current,
        period: next,
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchUpdatePeriod = ResearchModel.defineOp('research.update_period', {
  schema: z.object({
    id: z.string().min(1).max(200),
    loopCount: z.number().int().nonnegative().optional(),
    currentQuestionId: z.string().min(1).max(200).nullable().optional(),
    summary: z.string().max(2000).nullable().optional(),
  }),
  apply: (s, p) => {
    const open = s.current.period;
    if (open === null || open.id !== p.id || open.endedAt !== undefined) return s;
    const nextQuestionId = p.currentQuestionId === undefined
      ? open.currentQuestionId
      : p.currentQuestionId ?? undefined;
    const nextSummary = p.summary === undefined ? open.summary : p.summary ?? undefined;
    if (
      (p.loopCount === undefined || p.loopCount === open.loopCount) &&
      nextQuestionId === open.currentQuestionId &&
      nextSummary === open.summary
    ) return s;
    const next: ResearchPeriodRecord = {
      ...open,
      loopCount: p.loopCount ?? open.loopCount,
      currentQuestionId: nextQuestionId,
      summary: nextSummary,
    };
    return {
      ...s,
      current: {
        ...s.current,
        period: next,
        revision: s.current.revision + 1,
      },
    };
  },
});

export const researchEndPeriod = ResearchModel.defineOp('research.end_period', {
  schema: z.object({
    endedAt: z.number(),
  }),
  apply: (s, p) => {
    const open = s.current.period;
    if (open === null || open.endedAt !== undefined) return s;
    const closed: ResearchPeriodRecord = { ...open, endedAt: p.endedAt };
    return {
      ...s,
      current: {
        ...s.current,
        period: null,
        periodHistory: [...s.current.periodHistory, closed],
        revision: s.current.revision + 1,
      },
    };
  },
});

export interface ResearchCursorState {
  readonly cursor: ResearchCommittedCursor | null;
  readonly history: readonly ResearchCommittedCursor[];
  readonly revision: number;
}

export const ResearchCursorModel = defineModel<ResearchCursorState>(
  'researchCursor',
  () => ({ cursor: null, history: [], revision: 0 }),
);

export const researchCommitCheckpoint = ResearchCursorModel.defineOp('research.commit_checkpoint', {
  schema: z.object({
    checkpointId: z.string(),
    entryId: z.string(),
    receipt: ResearchCheckpointReceiptSchema.optional(),
    committedAt: z.number(),
  }),
  apply: (s, p) => {
    // Same checkpoint + same Entry is idempotent (already committed).
    if (s.history.some((c) => c.checkpointId === p.checkpointId && c.entryId === p.entryId)) {
      return s;
    }
    // Same checkpoint + different Entry is rejected (no-op; the service throws).
    if (s.history.some((c) => c.checkpointId === p.checkpointId)) {
      return s;
    }
    const committed: ResearchCommittedCursor = {
      checkpointId: p.checkpointId,
      entryId: p.entryId,
      receipt: p.receipt,
      committedAt: p.committedAt,
    };
    return {
      cursor: committed,
      history: [...s.history, committed],
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
    if (p.entryId !== undefined && pending.committedEntryId !== undefined && pending.committedEntryId !== p.entryId) return s;
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

function sameCheckpointReceipt(
  left: ResearchCheckpointReceipt | undefined,
  right: ResearchCheckpointReceipt,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

declare module '#/app/event/eventBus' {
  interface DomainEventMap {
    'aitp_mode.updated': void;
    'research.updated': { readonly snapshot: ResearchStatusSnapshot };
  }
}
