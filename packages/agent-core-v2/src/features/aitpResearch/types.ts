/**
 * `aitpResearch` domain — pure types and zod-safe DTOs for the AITP Research
 * Mode feature.
 *
 * Defines the three-axis research state model (workflow / epistemic /
 * persistence), the mode lifecycle phases, the Research Loop scientific state
 * layer (phase / action / progress / state change / human gate), the layered
 * Program / Period / Status projection vocabulary (re-exported from the
 * protocol-independent `research` types), the adapter contract types, the
 * `ResearchStatusSnapshot`, and the
 * `HumanSteeringCommand` union. No scoped state — only types and zod schemas.
 * Scope-agnostic.
 */

import { z } from 'zod';
import type { HumanGateKind } from '#/agent/humanGate/humanGate';
import type { GoalContinuationSnapshot } from '#/agent/goal/types';
import type {
  ResearchActionKind,
  ResearchActionStatus,
  ResearchPhase,
  ResearchProgram,
  ResearchProgramTopic,
  ResearchGoalAlignment,
  ResearchGoalAlignmentRelation,
  ResearchGoalProgramBinding,
  ResearchLineWorkstreamAlignment,
  ResearchLineWorkstreamBinding,
  ResearchPeriod,
  ResearchRunStage,
  ResearchSchedulerState,
  ResearchStatusHealth,
  ResearchStatusProjection,
  ResearchPlan,
  ResearchPlanV2,
  ResearchPlanV2Milestone,
  ResearchPlanV2DecisionPoint,
  ResearchPlanV2ActionBinding,
  ResearchActionPlanBinding,
  ResearchPlanningPolicy,
} from '#/features/research/types';

export type AitpModePhase = 'inactive' | 'probing' | 'ready' | 'degraded';

export type ResearchLoopStatus = 'active' | 'paused';

export type AitpModeEntryActor = 'user' | 'model';

export type QuestionWorkflow = 'open' | 'active' | 'deferred' | 'blocked' | 'closed' | 'cancelled';

export type QuestionEpistemic = 'unknown' | 'candidate' | 'supported' | 'contradicted' | 'inconclusive';

export type QuestionPersistence = 'working' | 'pending_commit' | 'committed' | 'degraded';

export interface ResearchLine {
  readonly slug: string;
  readonly title: string;
  readonly objective?: string;
  readonly assessment?: string;
  readonly status: 'active' | 'paused' | 'completed' | 'blocked';
  readonly createdAt: number;
  readonly revision: number;
}

export interface ResearchQuestion {
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

export interface ResearchFocus {
  readonly questionId: string;
  readonly boundedAction?: string;
  readonly revision: number;
}

export type ResearchNextStepSource =
  | 'research_action'
  | 'research_run'
  | 'human_gate'
  | 'aitp_maintenance'
  | 'question';

export type ResearchNextStepFreshness = 'current' | 'stale' | 'blocked';

export interface ResearchEffectiveNextStep {
  readonly text: string;
  readonly source: ResearchNextStepSource;
  readonly freshness: ResearchNextStepFreshness;
  readonly observedAt: number;
  readonly derivedFrom: {
    readonly actionId?: string;
    readonly entryId?: string;
    readonly questionId?: string;
    readonly lineSlug?: string;
  };
}

export interface ResearchCheckpointCheckReceipt {
  readonly status: 'clean' | 'findings';
  readonly errors: number;
  readonly warnings: number;
  readonly findingFingerprints: readonly string[];
  readonly errorFindingFingerprints: readonly string[];
  readonly newErrorFindingFingerprints?: readonly string[];
  readonly preExistingErrorFindingFingerprints?: readonly string[];
  readonly checkedAt: number;
}

export type ResearchCheckpointPrepareReceipt =
  | {
      readonly status: 'prepared';
      readonly id: string;
      readonly path: string;
      readonly idempotencyKey?: string;
      readonly workstreams?: readonly string[];
    }
  | {
      readonly status: 'existing';
      /** Derived from the returned path; absent only for an unexpected path shape. */
      readonly id?: string;
      readonly path: string;
      readonly idempotencyKey: string;
      readonly workstreams?: readonly string[];
    };

export interface ResearchCheckpointSaveReceipt {
  readonly status: 'saved' | 'already_saved';
  /** The draft passed to record save, or the canonical path returned by an existing prepare hit. */
  readonly draftPath: string;
  readonly path: string;
  readonly source?: 'record_save' | 'prepare_existing';
}

export interface ResearchCheckpointReceipt {
  readonly prepare?: ResearchCheckpointPrepareReceipt;
  readonly save?: ResearchCheckpointSaveReceipt;
  readonly preSaveCheck?: ResearchCheckpointCheckReceipt;
  readonly postSaveCheck?: ResearchCheckpointCheckReceipt;
}

export interface ResearchDurableCommitCandidate {
  /** The concluded action whose assessed delta this candidate represents. */
  readonly sourceActionId: string;
  /** Exact progress boundary emitted by the same atomic conclusion. */
  readonly progressRecordedAt: number;
  readonly entryKind: AitpEntryKind;
  readonly authority: AitpAuthority;
  readonly provenance: ResearchCommitProvenance;
  readonly rationale: string;
}

export interface ResearchLocalConclusion {
  readonly action: ResearchActionSpec;
  readonly progress: ResearchProgressReport;
  readonly candidate: ResearchDurableCommitCandidate;
  readonly program?: ResearchProgram;
  readonly line?: ResearchLine;
}

export interface ResearchCheckpoint {
  readonly checkpointId: string;
  readonly committedEntryId?: string;
  readonly questionId?: string;
  readonly questionRevision?: number;
  readonly lineSlug?: string;
  /** Exact confirmed binding captured when this checkpoint was proposed. */
  readonly workstreamBinding?: ResearchLineWorkstreamBinding;
  /** Present only for a candidate assessed by ConcludeResearchAction. */
  readonly commitCandidate?: ResearchDurableCommitCandidate;
  readonly assessment?: string;
  readonly nextAction?: string;
  readonly idempotencyKey: string;
  readonly persistence: QuestionPersistence;
  readonly receipt?: ResearchCheckpointReceipt;
  readonly createdAt: number;
}

export interface ResearchLineCreationInput {
  readonly slug: string;
  readonly title: string;
  readonly objective?: string;
  readonly assessment?: string;
}

export interface ResearchLineUpdateInput {
  readonly slug: string;
  readonly expectedRevision?: number;
  readonly title?: string;
  readonly objective?: string;
  readonly status?: ResearchLine['status'];
  readonly assessment?: string;
  readonly reason?: string;
}

export interface ResearchCommittedCursor {
  readonly checkpointId: string;
  readonly entryId?: string;
  readonly receipt?: ResearchCheckpointReceipt;
  readonly committedAt: number;
}

/**
 * Latest observable Hakimi handoff receipt for one committed Entry.
 * This reports only whether a same-turn external-Skill review was requested
 * or unavailable; it never claims a trigger, card, trial, approval, or publish
 * outcome.
 */
export type ResearchDistillationAttention =
  | {
      readonly schema: 'hakimi/research-distillation-attention-0.1';
      readonly status: 'review_requested';
      readonly checkpointId: string;
      readonly entryId: string;
      readonly recordedAt: number;
    }
  | {
      readonly schema: 'hakimi/research-distillation-attention-0.1';
      readonly status: 'handoff_unavailable';
      readonly checkpointId: string;
      readonly entryId: string;
      readonly reason: string;
      readonly recordedAt: number;
    };

// ---------------------------------------------------------------------------
// Research Loop scientific state layer (Phase 1 contract)
//
// A minimal, pure-science state machine layered on top of the existing
// AITP-backed working state. The phase tracks where the agent is in the
// orient→plan→act→evaluate→update→checkpoint cycle. The action spec captures a
// single bounded research action; the progress report records what the agent
// did and learned. No AITP id / hash / revision leaks into the scientific
// state — those are persistence concerns owned by the checkpoint layer.
// ---------------------------------------------------------------------------

// Re-exported from the protocol-independent `research` types; the AITP feature
// keeps these import paths stable while the canonical unions live in
// `features/research/types`.
export type {
  ResearchPhase,
  ResearchActionKind,
  ResearchActionStatus,
  ResearchRunStage,
  ResearchSchedulerState,
  ResearchProgramTopic,
  ResearchProgram,
  ResearchGoalAlignment,
  ResearchGoalAlignmentRelation,
  ResearchGoalProgramBinding,
  ResearchLineWorkstreamAlignment,
  ResearchLineWorkstreamBinding,
  ResearchPeriod,
  ResearchStatusHealth,
  ResearchStatusProjection,
  ResearchPlan,
  ResearchPlanV2,
  ResearchPlanV2Milestone,
  ResearchPlanV2DecisionPoint,
  ResearchPlanV2ActionBinding,
  ResearchActionPlanBinding,
  ResearchPlanningPolicy,
};

export interface ResearchRunState {
  /** Every run observation is attached to the bounded Research Action that owns it. */
  readonly actionId: string;
  readonly campaign: string;
  readonly jobId: string;
  readonly sourcePin?: string;
  readonly binaryPin?: string;
  readonly stage: ResearchRunStage;
  readonly schedulerState: ResearchSchedulerState;
  readonly lastObservedAt: number;
  readonly nextCheckAt?: number;
  readonly terminalState?: 'completed' | 'failed' | 'cancelled';
  readonly artifactRefs: readonly string[];
}

export interface ResearchActionSpec {
  readonly actionId: string;
  readonly observedRunActionId?: string;
  readonly questionId?: string;
  readonly questionRevision?: number;
  readonly lineSlug?: string;
  readonly lineRevision?: number;
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
  readonly researchPlanBinding?: ResearchPlanV2ActionBinding;
  readonly actionPlanBinding?: ResearchActionPlanBinding;
  readonly run?: ResearchRunState;
}

export type ResearchProgressLevel = 'brief' | 'detail' | 'audit';

export interface ResearchProgressDetail {
  readonly assumptions?: readonly string[];
  readonly derivation?: string;
  readonly tests?: readonly string[];
  readonly observations?: readonly string[];
  readonly sources?: readonly string[];
  readonly limitations?: readonly string[];
  readonly detailHint?: string;
  readonly artifactRefs?: readonly string[];
}

export interface ResearchProgressReport {
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
  readonly detail?: ResearchProgressDetail;
  readonly recordedAt: number;
}

export interface ResearchStateChange {
  readonly beforePhase: ResearchPhase;
  readonly afterPhase: ResearchPhase;
  readonly actionId?: string;
  readonly summary: string;
  readonly changedAt: number;
}

export type ResearchHumanGateKind = HumanGateKind;

export interface ResearchHumanGate {
  readonly gateId: string;
  readonly kind: ResearchHumanGateKind;
  readonly actionId?: string;
  readonly questionId?: string;
  readonly prompt: string;
  readonly resolvedAt?: number;
  readonly resolution?: string;
  readonly createdAt: number;
}

export interface ResearchScientificSnapshot {
  readonly phase: ResearchPhase;
  readonly currentAction?: ResearchActionSpec;
  readonly currentRun?: ResearchRunState;
  readonly latestProgress?: ResearchProgressReport;
  readonly recentStateChange?: ResearchStateChange;
  readonly humanGate?: ResearchHumanGate;
}

export interface ResearchGoalSummary {
  readonly goalId?: string;
  readonly objective: string;
  readonly completionCriterion?: string;
  readonly status: 'active' | 'paused' | 'blocked' | 'complete';
  readonly turnBudget?: number;
  readonly remainingTurns?: number;
  readonly terminalReason?: string;
  readonly waitingFor?: {
    readonly taskIds: readonly string[];
    readonly policy: 'any' | 'all';
  };
  readonly continuation?: GoalContinuationSnapshot;
}

export interface ResearchGoalScope {
  readonly programTopicId?: string;
  readonly lineSlug?: string;
  readonly questionId?: string;
}

export interface ResearchGoalBudget {
  readonly tokenBudget: number | null;
  readonly turnBudget: number | null;
  readonly wallClockBudgetMs: number | null;
  readonly remainingTokens: number | null;
  readonly remainingTurns: number | null;
  readonly remainingWallClockMs: number | null;
  readonly tokenBudgetReached: boolean;
  readonly turnBudgetReached: boolean;
  readonly wallClockBudgetReached: boolean;
  readonly overBudget: boolean;
}

export interface ResearchGoalStopCondition {
  readonly code: string;
  readonly reached: boolean;
  readonly reason: string;
}

export interface ResearchGoalPersistenceGuard {
  readonly code: string;
  readonly status: 'clear' | 'blocked' | 'inactive';
  readonly reason: string;
}

/**
 * Domain-specific projection of the one generic Goal that owns continuation.
 * It is derived, never a second scheduler or an AITP Topic Goal.
 */
export interface ResearchGoalProjection {
  readonly schema: 'hakimi/research-goal-0.1';
  readonly goalId: string;
  readonly objective: string;
  readonly completionCriterion?: string;
  readonly scope: ResearchGoalScope;
  readonly nonGoals: readonly string[];
  readonly budget: ResearchGoalBudget;
  readonly stopConditions: readonly ResearchGoalStopCondition[];
  readonly status: 'active' | 'paused' | 'blocked' | 'complete';
  readonly terminalReason?: string;
  readonly waitingFor?: {
    readonly taskIds: readonly string[];
    readonly policy: 'any' | 'all';
  };
  readonly continuation?: {
    readonly state: 'idle' | 'deciding' | 'enqueued' | 'running' | 'held' | 'waiting';
    readonly owner?: string;
    readonly reason?: string;
  };
  readonly programRelation: ResearchGoalAlignment;
  readonly humanGates: readonly ResearchHumanGate[];
  readonly persistenceGuards: readonly ResearchGoalPersistenceGuard[];
  readonly researchRevision: number;
}

export interface ResearchStatusSnapshot {
  readonly mode: AitpModePhase;
  readonly loopStatus: ResearchLoopStatus;
  readonly currentLineSlug?: string;
  readonly currentWorkstreamBinding?: ResearchLineWorkstreamAlignment;
  readonly lineWorkstreamBindings: readonly ResearchLineWorkstreamBinding[];
  readonly currentFocus?: ResearchFocus;
  readonly currentQuestion?: ResearchQuestion;
  readonly questions: readonly ResearchQuestion[];
  readonly lines: readonly ResearchLine[];
  readonly openQuestionCount: number;
  readonly activeQuestionCount: number;
  readonly blockedQuestionCount: number;
  readonly alerts: readonly ResearchAlert[];
  readonly effectiveNextStep?: ResearchEffectiveNextStep;
  readonly goalSummary?: ResearchGoalSummary;
  readonly researchGoal?: ResearchGoalProjection;
  readonly goalAlignment?: ResearchGoalAlignment;
  readonly aitpHealth: AitpAdapterHealth;
  readonly aitpMaintenance?: AitpMaintenanceReceipt;
  readonly pendingCheckpoint?: ResearchCheckpoint;
  readonly localConclusion?: ResearchLocalConclusion;
  readonly latestCommittedCheckpoint?: ResearchCommittedCursor;
  readonly committedCheckpointHistory?: readonly ResearchCommittedCursor[];
  readonly distillationAttention?: ResearchDistillationAttention;
  readonly phase: ResearchPhase;
  readonly currentAction?: ResearchActionSpec;
  readonly currentRun?: ResearchRunState;
  readonly latestProgress?: ResearchProgressReport;
  readonly recentStateChange?: ResearchStateChange;
  readonly humanGate?: ResearchHumanGate;
  readonly program?: ResearchProgram;
  readonly period?: ResearchPeriod;
  readonly researchPlan?: ResearchPlan;
  readonly actionPlan?: ResearchPlan;
  readonly researchPlanV2?: ResearchPlanV2;
  readonly planningPolicy: ResearchPlanningPolicy;
  readonly status?: ResearchStatusProjection;
  readonly revision: number;
}

export type ResearchAlertClassification =
  | 'active_blocker'
  | 'historical_unresolved'
  | 'superseded_by_retry'
  | 'warning';

export type ResearchAlertSource =
  | 'question'
  | 'aitp_failure'
  | 'aitp_check'
  | 'adapter'
  | 'checkpoint';

export type ResearchAlertState = 'active' | 'acknowledged' | 'cleared' | 'superseded';

export interface ResearchAlert {
  readonly fingerprint: string;
  readonly kind: 'contradiction' | 'blocked' | 'reopened' | 'commit_failed' | 'degraded' | 'stale';
  readonly classification?: ResearchAlertClassification;
  readonly source?: ResearchAlertSource;
  readonly state?: ResearchAlertState;
  readonly message: string;
  readonly questionId?: string;
  readonly lineSlug?: string;
  readonly relatedEntryId?: string;
  readonly workstream?: string;
  readonly retryOfEntryId?: string;
  readonly reason?: string;
  readonly createdAt: number;
  readonly acknowledgedAt?: number;
}

export interface AitpAdapterHealth {
  readonly phase: AitpModePhase;
  readonly contractVersion?: string;
  readonly pluginVersion?: string;
  readonly pythonVersion?: string;
  readonly lastCheckAt?: number;
  readonly lastError?: string;
  readonly notInitialized?: boolean;
}

export type AitpMaintenanceStatus = 'ready' | 'degraded';

export type AitpMaintenanceMemoryStatus =
  | AitpEnterResult['memory_status']
  | 'unknown';

export type AitpMaintenanceDegradedReason =
  | 'adapter_not_ready'
  | 'adapter_degraded'
  | 'enter_failed'
  | 'check_unavailable'
  | 'stale_generation'
  | 'workstream_unbound';

export interface AitpMaintenanceWarningSummary {
  readonly level: 'warning';
  readonly code: string;
}

export interface AitpMaintenanceCheckSummary {
  readonly status: 'clean' | 'findings' | 'unavailable';
  readonly counts?: {
    readonly entries: number;
    readonly notes: number;
    readonly errors: number;
    readonly warnings: number;
  };
  readonly findingCodes: readonly string[];
}

export interface AitpMaintenanceFailureSummary {
  readonly entryId: string;
  readonly kind: AitpEntryKind;
  readonly summary: string;
  readonly source: string;
  readonly authority: AitpAuthority;
  readonly createdAt?: number;
  readonly workstream?: string;
}

export interface AitpMaintenanceNextAction {
  readonly text: string;
  readonly entryId: string;
  readonly authority: AitpAuthority;
  readonly createdAt?: number;
  readonly source: string;
}

/**
 * Read-only current-state maintenance derived from one AITP `enter` → `check`
 * cycle. It keeps stable entry references needed to distinguish historical
 * failures from current blockers, while raw paths, hashes, revisions, and
 * transport errors remain outside the Research snapshot.
 */
export interface AitpMaintenanceReceipt {
  readonly status: AitpMaintenanceStatus;
  readonly refreshedAt: number;
  readonly memoryStatus: AitpMaintenanceMemoryStatus;
  readonly workstream?: string;
  readonly topic?: ResearchProgramTopic;
  readonly latestWorkingNoteAt?: number;
  readonly activeNewerThanWorkingNote: boolean | null;
  readonly unresolvedFailureCount: number;
  readonly unresolvedFailures: readonly AitpMaintenanceFailureSummary[];
  readonly nextAction?: string;
  readonly nextActionDetails?: AitpMaintenanceNextAction;
  readonly warningSummaries: readonly AitpMaintenanceWarningSummary[];
  readonly check: AitpMaintenanceCheckSummary;
  readonly degradedReason?: AitpMaintenanceDegradedReason;
}

export type HumanSteeringCommand =
  | { readonly kind: 'set_focus'; readonly questionId: string; readonly expectedRevision: number; readonly boundedAction?: string; readonly reason?: string }
  | { readonly kind: 'update_question'; readonly questionId: string; readonly expectedRevision: number; readonly wording?: string; readonly assessment?: string; readonly priority?: number; readonly workflow?: QuestionWorkflow; readonly epistemic?: QuestionEpistemic; readonly neededEvidence?: readonly string[]; readonly nextBoundedAction?: string; readonly reason?: string }
  | { readonly kind: 'switch_line'; readonly lineSlug: string; readonly expectedRevision: number; readonly reason?: string }
  | { readonly kind: 'pause_loop'; readonly expectedRevision: number; readonly reason?: string }
  | { readonly kind: 'resume_loop'; readonly expectedRevision: number; readonly reason?: string }
  | { readonly kind: 'reopen_question'; readonly questionId: string; readonly expectedRevision: number; readonly reason?: string }
  | { readonly kind: 'defer_question'; readonly questionId: string; readonly expectedRevision: number; readonly reason?: string }
  | { readonly kind: 'block_question'; readonly questionId: string; readonly expectedRevision: number; readonly reason?: string }
  | { readonly kind: 'close_question'; readonly questionId: string; readonly expectedRevision: number; readonly reason?: string };

export interface AitpContractIdentity {
  readonly contractVersion: string;
  readonly pluginVersion: string;
  readonly launcherPath: string;
  readonly pluginRoot: string;
}

export const AitpEntryKindSchema = z.enum([
  'observation', 'result', 'failure', 'decision',
  'source', 'code_change', 'run', 'closeout',
]);
export type AitpEntryKind = z.infer<typeof AitpEntryKindSchema>;

export const AitpAuthoritySchema = z.enum(['human', 'agent', 'source', 'tool']);
export type AitpAuthority = z.infer<typeof AitpAuthoritySchema>;

export const ResearchCommitProvenanceSchema = z.enum([
  'agent_verification',
  'tool_verification',
  'source_assessment',
  'human_assertion',
  'human_decision',
]);
export type ResearchCommitProvenance = z.infer<typeof ResearchCommitProvenanceSchema>;

export const AitpNoteModeSchema = z.enum(['working', 'theory']);
export type AitpNoteMode = z.infer<typeof AitpNoteModeSchema>;

export const AitpWorkstreamSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);

export const AitpErrorEnvelopeSchema = z.object({
  status: z.literal('error'),
  code: z.string().min(1),
  message: z.string(),
}).strict();
export type AitpErrorEnvelope = z.infer<typeof AitpErrorEnvelopeSchema>;

const AitpWarningSchema = z.object({
  code: z.string(),
  path: z.string(),
  message: z.string(),
}).strict();

const AitpEnterCountsSchema = z.object({
  active: z.number().int().nonnegative(),
  superseded: z.number().int().nonnegative(),
  unresolved_failures: z.number().int().nonnegative(),
  malformed: z.number().int().nonnegative(),
  omitted_active: z.number().int().nonnegative(),
  active_newer_than_latest_working_note: z.number().int().nonnegative().nullable(),
}).strict();

const AitpEnterEntrySchema = z.object({
  id: z.string(),
  kind: AitpEntryKindSchema,
  summary: z.string(),
  limitations: z.array(z.string()),
  authority: AitpAuthoritySchema,
  created_at: z.string(),
  refs: z.array(z.record(z.string(), z.unknown())),
  source: z.string(),
  legacy_derived: z.boolean(),
}).strict();

const AitpEnterNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  mode: AitpNoteModeSchema,
  review_state: z.string(),
  created_at: z.string(),
  summary: z.string(),
  source: z.string(),
  legacy_derived: z.boolean(),
}).strict();

const AitpEnterPayloadBase = z.object({
  memory_status: z.enum(['available', 'partial', 'not_established']),
  root: z.string(),
  topic: z.object({
    id: z.string(),
    title: z.string(),
    goal: z.object({ text: z.string(), source: z.string() }).strict(),
  }).strict(),
  recent_entries: z.array(AitpEnterEntrySchema),
  unresolved_failures: z.array(AitpEnterEntrySchema),
  next_action: z.union([
    z.object({
      text: z.string(),
      entry_id: z.string(),
      authority: AitpAuthoritySchema,
      created_at: z.string(),
      source: z.string(),
    }).strict(),
    z.object({ status: z.literal('not_established'), source: z.null() }).strict(),
  ]),
  latest_working_note: z.object({
    id: z.string(),
    created_at: z.string(),
    source: z.string(),
  }).strict().nullable(),
  recent_notes: z.array(AitpEnterNoteSchema),
  counts: AitpEnterCountsSchema,
  warnings: z.array(AitpWarningSchema),
}).strict();

export const AitpEnter0_2Schema = AitpEnterPayloadBase.extend({
  schema: z.literal('aitp/enter-0.2'),
}).strict();

export const AitpEnter0_3Schema = AitpEnterPayloadBase.extend({
  schema: z.literal('aitp/enter-0.3'),
  workstream: AitpWorkstreamSchema,
}).strict();

export const AitpEnterSchema = z.discriminatedUnion('schema', [
  AitpEnter0_2Schema,
  AitpEnter0_3Schema,
]);

const AitpListEntrySchema = z.object({
  id: z.string(),
  kind: AitpEntryKindSchema,
  status: z.enum(['active', 'superseded']),
  created_at: z.string(),
  authority: AitpAuthoritySchema,
  summary: z.string(),
  legacy_derived: z.boolean(),
  source: z.string(),
}).strict();

const AitpListPayloadBase = z.object({
  root: z.string(),
  count: z.number().int().nonnegative(),
  entries: z.array(AitpListEntrySchema),
  warnings: z.array(AitpWarningSchema),
}).strict();

export const AitpList0_1Schema = AitpListPayloadBase.extend({
  schema: z.literal('aitp/list-0.1'),
}).strict();

export const AitpList0_2Schema = AitpListPayloadBase.extend({
  schema: z.literal('aitp/list-0.2'),
  workstream: AitpWorkstreamSchema,
}).strict();

export const AitpListSchema = z.discriminatedUnion('schema', [
  AitpList0_1Schema,
  AitpList0_2Schema,
]);

const AitpShowBaseSchema = z.object({
  schema: z.literal('aitp/show-0.1'),
  root: z.string(),
  id: z.string(),
  source: z.string(),
  legacy_derived: z.boolean(),
  body: z.string(),
});

export const AitpShow0_1Schema = z.discriminatedUnion('status', [
  AitpShowBaseSchema.extend({
    status: z.enum(['active', 'superseded']),
    frontmatter: z.record(z.string(), z.unknown()),
  }).strict(),
  AitpShowBaseSchema.extend({
    status: z.literal('malformed'),
    frontmatter: z.null(),
    warning: AitpWarningSchema,
  }).strict(),
]);

export const AitpShowSchema = AitpShow0_1Schema;

export const AitpCheckFindingSchema = z.object({
  level: z.enum(['error', 'warning']),
  code: z.string(),
  path: z.string(),
  message: z.string(),
}).strict();

const AitpCheckCountsBaseSchema = z.object({
  entries: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
}).strict();

const AitpCheckCounts0_2Schema = AitpCheckCountsBaseSchema.extend({
  by_code: z.record(z.string(), z.object({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
  }).strict()),
  outside_scope: z.object({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
  }).strict(),
}).strict();

const AitpCheckPayloadBase = z.object({
  root: z.string(),
  status: z.enum(['clean', 'findings']),
  findings: z.array(AitpCheckFindingSchema),
}).strict();

export const AitpCheckReport0_1Schema = AitpCheckPayloadBase.extend({
  schema: z.literal('aitp/check-report-0.1'),
  counts: AitpCheckCountsBaseSchema,
}).strict();

export const AitpCheckReport0_2Schema = AitpCheckPayloadBase.extend({
  schema: z.literal('aitp/check-report-0.2'),
  counts: AitpCheckCounts0_2Schema,
  workstream: AitpWorkstreamSchema,
}).strict();

export const AitpCheckReportSchema = z.discriminatedUnion('schema', [
  AitpCheckReport0_1Schema,
  AitpCheckReport0_2Schema,
]);

export const AitpRecordPrepare0_Schema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('prepared'),
    id: z.string(),
    path: z.string(),
    save_command: z.string(),
  }).strict(),
  z.object({
    status: z.literal('existing'),
    path: z.string(),
    idempotency_key: z.string(),
  }).strict(),
]);
export type AitpRecordPrepareResult = z.infer<typeof AitpRecordPrepare0_Schema>;

export const AitpRecordSave0_Schema = z.object({
  status: z.enum(['saved', 'already_saved']),
  path: z.string(),
}).strict();
export type AitpRecordSaveResult = z.infer<typeof AitpRecordSave0_Schema>;

export const AitpNotePrepare0_Schema = z.object({
  status: z.literal('prepared'),
  id: z.string(),
  path: z.string(),
  save_command: z.string(),
}).strict();
export type AitpNotePrepareResult = z.infer<typeof AitpNotePrepare0_Schema>;

export const AitpNoteSave0_Schema = z.object({
  status: z.enum(['saved', 'already_saved']),
  path: z.string(),
}).strict();
export type AitpNoteSaveResult = z.infer<typeof AitpNoteSave0_Schema>;

export type AitpEnterResult = z.infer<typeof AitpEnterSchema>;
export type AitpListResult = z.infer<typeof AitpListSchema>;
export type AitpShowResult = z.infer<typeof AitpShowSchema>;
export type AitpCheckReport = z.infer<typeof AitpCheckReportSchema>;
export type AitpCheckFinding = z.infer<typeof AitpCheckFindingSchema>;

export function parseEnterResult(raw: unknown): AitpEnterResult {
  return AitpEnterSchema.parse(raw);
}

export function parseListResult(raw: unknown): AitpListResult {
  return AitpListSchema.parse(raw);
}

export function parseShowResult(raw: unknown): AitpShowResult {
  return AitpShowSchema.parse(raw);
}

export function parseCheckReport(raw: unknown): AitpCheckReport {
  return AitpCheckReportSchema.parse(raw);
}

export function parseRecordPrepareResult(raw: unknown): AitpRecordPrepareResult {
  return AitpRecordPrepare0_Schema.parse(raw);
}

export function parseRecordSaveResult(raw: unknown): AitpRecordSaveResult {
  return AitpRecordSave0_Schema.parse(raw);
}

export function parseNotePrepareResult(raw: unknown): AitpNotePrepareResult {
  return AitpNotePrepare0_Schema.parse(raw);
}

export function parseNoteSaveResult(raw: unknown): AitpNoteSaveResult {
  return AitpNoteSave0_Schema.parse(raw);
}

export function parseErrorEnvelope(raw: unknown): AitpErrorEnvelope {
  return AitpErrorEnvelopeSchema.parse(raw);
}

export const QuestionWorkflowSchema = z.enum([
  'open', 'active', 'deferred', 'blocked', 'closed', 'cancelled',
]);
export const QuestionEpistemicSchema = z.enum([
  'unknown', 'candidate', 'supported', 'contradicted', 'inconclusive',
]);
export const QuestionPersistenceSchema = z.enum([
  'working', 'pending_commit', 'committed', 'degraded',
]);

export const ResearchPhaseSchema = z.enum([
  'idle', 'orienting', 'gap_analysis', 'action_planned', 'action_executing',
  'evaluating', 'state_updated', 'checkpoint_pending', 'awaiting_human',
]);

export const ResearchActionKindSchema = z.enum([
  'experiment', 'derivation', 'literature_review', 'data_analysis', 'simulation', 'other',
]);

export const ResearchActionStatusSchema = z.enum([
  'planned', 'in_progress', 'completed', 'abandoned',
]);

export const ResearchHumanGateKindSchema = z.enum(['approval', 'review', 'decision']);

export const ResearchProgressLevelSchema = z.enum(['brief', 'detail', 'audit']);
