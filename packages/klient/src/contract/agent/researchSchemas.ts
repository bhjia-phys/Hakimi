/**
 * Shared AITP Research Mode wire schemas — the snapshot / question / line /
 * focus / checkpoint / alert / steering-command vocabulary used by the
 * research service contracts in `./research.ts`. Mirrors the engine types in
 * `agent-core-v2/src/features/aitpResearch/types.ts` and
 * `agent-core-v2/src/features/aitpResearch/research/agentResearch.ts`.
 */

import { z } from 'zod';

// ── enums ───────────────────────────────────────────────────────────────────

export const aitpModePhaseSchema = z.enum(['inactive', 'probing', 'ready', 'degraded']);
export const researchLoopStatusSchema = z.enum(['active', 'paused']);
export const researchPlanningPolicySchema = z.enum(['collaborative', 'dreaming']);
export const questionWorkflowSchema = z.enum([
  'open',
  'active',
  'deferred',
  'blocked',
  'closed',
  'cancelled',
]);
export const questionEpistemicSchema = z.enum([
  'unknown',
  'candidate',
  'supported',
  'contradicted',
  'inconclusive',
]);
export const questionPersistenceSchema = z.enum([
  'working',
  'pending_commit',
  'committed',
  'degraded',
]);
export const researchLineStatusSchema = z.enum(['active', 'paused', 'completed', 'blocked']);
export const researchAlertKindSchema = z.enum([
  'contradiction',
  'blocked',
  'reopened',
  'commit_failed',
  'degraded',
  'stale',
]);

// ── composite schemas ───────────────────────────────────────────────────────

export const researchLineSchema = z.object({
  slug: z.string(),
  title: z.string(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  status: researchLineStatusSchema,
  createdAt: z.number(),
  revision: z.number(),
});
export type ResearchLine = z.infer<typeof researchLineSchema>;

export const researchLineWorkstreamBindingSchema = z.object({
  confirmationId: z.string().min(1).max(200),
  lineSlug: z.string().min(1).max(200),
  workstream: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  topicId: z.string().min(1).max(200),
  observedRevision: z.number().int().positive(),
  confirmedBy: z.enum(['user', 'main_agent']),
  confirmedAt: z.number(),
}).strict();
export type ResearchLineWorkstreamBinding = z.infer<
  typeof researchLineWorkstreamBindingSchema
>;

export const researchLineWorkstreamBindingStatusSchema = z.enum([
  'unbound',
  'unavailable',
  'bound',
  'stale',
  'conflict',
]);

export const researchLineWorkstreamAlignmentSchema = z.object({
  lineSlug: z.string().min(1).max(200),
  status: researchLineWorkstreamBindingStatusSchema,
  reason: z.string(),
  binding: researchLineWorkstreamBindingSchema.optional(),
}).strict().superRefine((alignment, context) => {
  if (alignment.status !== 'unbound' && alignment.binding === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['binding'],
      message: 'Every non-unbound Line-workstream alignment requires its stored binding.',
    });
  }
  if (alignment.status === 'unbound' && alignment.binding !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['binding'],
      message: 'An unbound Line-workstream alignment cannot carry a binding.',
    });
  }
  if (
    alignment.status !== 'unbound'
    && alignment.status !== 'conflict'
    && alignment.binding !== undefined
    && alignment.binding.lineSlug !== alignment.lineSlug
  ) {
    context.addIssue({
      code: 'custom',
      path: ['binding', 'lineSlug'],
      message: 'A non-conflicting Line-workstream alignment must carry a binding for the same Line.',
    });
  }
});
export type ResearchLineWorkstreamAlignment = z.infer<
  typeof researchLineWorkstreamAlignmentSchema
>;

export const researchQuestionSchema = z.object({
  id: z.string(),
  lineSlug: z.string(),
  wording: z.string(),
  assessment: z.string().optional(),
  priority: z.number(),
  neededEvidence: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
  falsifierRefs: z.array(z.string()),
  nextBoundedAction: z.string().optional(),
  workflow: questionWorkflowSchema,
  epistemic: questionEpistemicSchema,
  persistence: questionPersistenceSchema,
  revision: z.number(),
});
export type ResearchQuestion = z.infer<typeof researchQuestionSchema>;

export const researchFocusSchema = z.object({
  questionId: z.string(),
  boundedAction: z.string().optional(),
  revision: z.number(),
});
export type ResearchFocus = z.infer<typeof researchFocusSchema>;

export const researchNextStepSourceSchema = z.enum([
  'research_action',
  'research_run',
  'human_gate',
  'aitp_maintenance',
  'question',
]);
export const researchNextStepFreshnessSchema = z.enum(['current', 'stale', 'blocked']);
export const researchEffectiveNextStepSchema = z.object({
  text: z.string(),
  source: researchNextStepSourceSchema,
  freshness: researchNextStepFreshnessSchema,
  observedAt: z.number(),
  derivedFrom: z.object({
    actionId: z.string().optional(),
    entryId: z.string().optional(),
    questionId: z.string().optional(),
    lineSlug: z.string().optional(),
  }).strict(),
}).strict();
export type ResearchEffectiveNextStep = z.infer<typeof researchEffectiveNextStepSchema>;

export const researchAlertClassificationSchema = z.enum([
  'active_blocker',
  'historical_unresolved',
  'superseded_by_retry',
  'warning',
]);
export const researchAlertSourceSchema = z.enum([
  'question',
  'aitp_failure',
  'aitp_check',
  'adapter',
  'checkpoint',
]);
export const researchAlertStateSchema = z.enum(['active', 'acknowledged', 'cleared', 'superseded']);

export const researchAlertSchema = z.object({
  fingerprint: z.string().min(1),
  kind: researchAlertKindSchema,
  classification: researchAlertClassificationSchema.optional(),
  source: researchAlertSourceSchema.optional(),
  state: researchAlertStateSchema.optional(),
  message: z.string(),
  questionId: z.string().optional(),
  lineSlug: z.string().optional(),
  relatedEntryId: z.string().optional(),
  workstream: z.string().optional(),
  retryOfEntryId: z.string().optional(),
  reason: z.string().optional(),
  createdAt: z.number(),
  acknowledgedAt: z.number().optional(),
}).strict();
export type ResearchAlert = z.infer<typeof researchAlertSchema>;

export const aitpAdapterHealthSchema = z.object({
  phase: aitpModePhaseSchema,
  contractVersion: z.string().optional(),
  pluginVersion: z.string().optional(),
  pythonVersion: z.string().optional(),
  lastCheckAt: z.number().optional(),
  lastError: z.string().optional(),
  notInitialized: z.boolean().optional(),
});
export type AitpAdapterHealth = z.infer<typeof aitpAdapterHealthSchema>;

export const aitpMaintenanceStatusSchema = z.enum(['ready', 'degraded']);
export type AitpMaintenanceStatus = z.infer<typeof aitpMaintenanceStatusSchema>;

export const aitpMaintenanceMemoryStatusSchema = z.enum([
  'available',
  'partial',
  'not_established',
  'unknown',
]);
export type AitpMaintenanceMemoryStatus = z.infer<typeof aitpMaintenanceMemoryStatusSchema>;

export const aitpMaintenanceDegradedReasonSchema = z.enum([
  'adapter_not_ready',
  'adapter_degraded',
  'enter_failed',
  'check_unavailable',
  'stale_generation',
  'workstream_unbound',
]);
export type AitpMaintenanceDegradedReason = z.infer<
  typeof aitpMaintenanceDegradedReasonSchema
>;

export const aitpMaintenanceWarningSummarySchema = z.object({
  level: z.literal('warning'),
  code: z.string(),
});
export type AitpMaintenanceWarningSummary = z.infer<
  typeof aitpMaintenanceWarningSummarySchema
>;

export const aitpMaintenanceCheckCountsSchema = z.object({
  entries: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
});
export type AitpMaintenanceCheckCounts = z.infer<typeof aitpMaintenanceCheckCountsSchema>;

export const aitpMaintenanceCheckSummarySchema = z.object({
  status: z.enum(['clean', 'findings', 'unavailable']),
  counts: aitpMaintenanceCheckCountsSchema.optional(),
  findingCodes: z.array(z.string()),
});
export type AitpMaintenanceCheckSummary = z.infer<
  typeof aitpMaintenanceCheckSummarySchema
>;

export const aitpMaintenanceFailureSummarySchema = z.object({
  entryId: z.string(),
  kind: z.enum(['observation', 'result', 'failure', 'decision', 'source', 'code_change', 'run', 'closeout']),
  summary: z.string(),
  source: z.string(),
  authority: z.enum(['human', 'agent', 'source', 'tool']),
  createdAt: z.number().optional(),
  workstream: z.string().optional(),
}).strict();
export type AitpMaintenanceFailureSummary = z.infer<typeof aitpMaintenanceFailureSummarySchema>;

export const aitpMaintenanceNextActionSchema = z.object({
  text: z.string(),
  entryId: z.string(),
  authority: z.enum(['human', 'agent', 'source', 'tool']),
  createdAt: z.number().optional(),
  source: z.string(),
}).strict();
export type AitpMaintenanceNextAction = z.infer<typeof aitpMaintenanceNextActionSchema>;

export const researchProgramTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  goalText: z.string(),
  goalSource: z.string(),
}).strict();
export type ResearchProgramTopic = z.infer<typeof researchProgramTopicSchema>;

export const aitpMaintenanceReceiptSchema = z.object({
  status: aitpMaintenanceStatusSchema,
  refreshedAt: z.number(),
  memoryStatus: aitpMaintenanceMemoryStatusSchema,
  workstream: z.string().optional(),
  topic: researchProgramTopicSchema.optional(),
  latestWorkingNoteAt: z.number().optional(),
  activeNewerThanWorkingNote: z.boolean().nullable(),
  unresolvedFailureCount: z.number().int().nonnegative(),
  unresolvedFailures: z.array(aitpMaintenanceFailureSummarySchema).default([]),
  nextAction: z.string().optional(),
  nextActionDetails: aitpMaintenanceNextActionSchema.optional(),
  warningSummaries: z.array(aitpMaintenanceWarningSummarySchema),
  check: aitpMaintenanceCheckSummarySchema,
  degradedReason: aitpMaintenanceDegradedReasonSchema.optional(),
});
export type AitpMaintenanceReceipt = z.infer<typeof aitpMaintenanceReceiptSchema>;

const researchCheckpointCheckReceiptSchema = z.object({
  status: z.enum(['clean', 'findings']),
  errors: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  findingFingerprints: z.array(z.string()),
  errorFindingFingerprints: z.array(z.string()),
  newErrorFindingFingerprints: z.array(z.string()).optional(),
  preExistingErrorFindingFingerprints: z.array(z.string()).optional(),
  checkedAt: z.number(),
}).strict();

const researchCheckpointPrepareReceiptSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('prepared'),
    id: z.string(),
    path: z.string(),
    idempotencyKey: z.string().optional(),
    workstreams: z.array(z.string()).optional(),
  }).strict(),
  z.object({
    status: z.literal('existing'),
    id: z.string().optional(),
    path: z.string(),
    idempotencyKey: z.string(),
    workstreams: z.array(z.string()).optional(),
  }).strict(),
]);

const researchCheckpointSaveReceiptSchema = z.object({
  status: z.enum(['saved', 'already_saved']),
  draftPath: z.string(),
  path: z.string(),
  source: z.enum(['record_save', 'prepare_existing']).optional(),
}).strict();

const researchCheckpointReceiptSchema = z.object({
  prepare: researchCheckpointPrepareReceiptSchema.optional(),
  save: researchCheckpointSaveReceiptSchema.optional(),
  preSaveCheck: researchCheckpointCheckReceiptSchema.optional(),
  postSaveCheck: researchCheckpointCheckReceiptSchema.optional(),
}).strict();

export const researchCommittedCursorSchema = z.object({
  checkpointId: z.string(),
  entryId: z.string().optional(),
  receipt: researchCheckpointReceiptSchema.optional(),
  committedAt: z.number(),
});
export type ResearchCommittedCursor = z.infer<typeof researchCommittedCursorSchema>;

export const researchDurableCommitCandidateSchema = z.object({
  sourceActionId: z.string(),
  progressRecordedAt: z.number(),
  entryKind: z.enum([
    'observation', 'result', 'failure', 'decision',
    'source', 'code_change', 'run', 'closeout',
  ]),
  authority: z.enum(['human', 'agent', 'source', 'tool']),
  provenance: z.enum([
    'agent_verification', 'tool_verification', 'source_assessment',
    'human_assertion', 'human_decision',
  ]),
  rationale: z.string(),
}).strict();
export type ResearchDurableCommitCandidate = z.infer<typeof researchDurableCommitCandidateSchema>;

export const researchDurabilityAssessmentSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('no_durable_delta'),
    rationale: z.string().max(8000),
  }).strict(),
  z.object({
    status: z.literal('durable_delta'),
    entryKind: researchDurableCommitCandidateSchema.shape.entryKind,
    authority: researchDurableCommitCandidateSchema.shape.authority,
    provenance: researchDurableCommitCandidateSchema.shape.provenance,
    rationale: z.string().max(8000),
  }).strict(),
]);
export type ResearchDurabilityAssessment = z.infer<typeof researchDurabilityAssessmentSchema>;

const goalContinuationSnapshotSchema = z.object({
  state: z.enum(['idle', 'deciding', 'enqueued', 'running', 'held', 'waiting']),
  owner: z.string().optional(),
  reason: z.string().optional(),
}).strict();

export const researchGoalSummarySchema = z.object({
  goalId: z.string().optional(),
  objective: z.string(),
  completionCriterion: z.string().optional(),
  status: z.enum(['active', 'paused', 'blocked', 'complete']),
  turnBudget: z.number().optional(),
  remainingTurns: z.number().optional(),
  terminalReason: z.string().optional(),
  waitingFor: z.object({
    taskIds: z.array(z.string()),
    policy: z.enum(['any', 'all']),
  }).strict().optional(),
  continuation: goalContinuationSnapshotSchema.optional(),
}).strict();

export const researchCheckpointSchema = z.object({
  checkpointId: z.string(),
  committedEntryId: z.string().optional(),
  questionId: z.string().optional(),
  questionRevision: z.number().int().nonnegative().optional(),
  lineSlug: z.string().optional(),
  workstreamBinding: researchLineWorkstreamBindingSchema.optional(),
  commitCandidate: researchDurableCommitCandidateSchema.optional(),
  assessment: z.string().optional(),
  nextAction: z.string().optional(),
  idempotencyKey: z.string(),
  persistence: questionPersistenceSchema,
  receipt: researchCheckpointReceiptSchema.optional(),
  createdAt: z.number(),
});
export type ResearchCheckpoint = z.infer<typeof researchCheckpointSchema>;

// ── Research Loop scientific state layer ────────────────────────────────────

export const researchPhaseSchema = z.enum([
  'idle',
  'orienting',
  'gap_analysis',
  'action_planned',
  'action_executing',
  'evaluating',
  'state_updated',
  'checkpoint_pending',
  'awaiting_human',
]);

export const awaitingHumanExitPhaseSchema = z.enum([
  'idle',
  'gap_analysis',
  'action_planned',
  'action_executing',
  'evaluating',
]);

export const researchActionKindSchema = z.enum([
  'experiment',
  'derivation',
  'literature_review',
  'data_analysis',
  'simulation',
  'other',
]);

export const researchActionStatusSchema = z.enum([
  'planned',
  'in_progress',
  'completed',
  'abandoned',
]);

export const researchRunStageSchema = z.enum([
  'queued',
  'running',
  'scf',
  'band',
  'analyzing',
  'completed',
  'failed',
  'unknown',
]);
export const researchSchedulerStateSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  'unknown',
]);

const researchStringListSchema = z.array(z.string().max(500)).max(50);
const researchShortTextSchema = z.string().max(2000);
const researchLongTextSchema = z.string().max(8000);

export const researchRunStateSchema = z.object({
  actionId: z.string(),
  campaign: z.string().min(1).max(500),
  jobId: z.string().min(1).max(200),
  sourcePin: z.string().max(500).optional(),
  binaryPin: z.string().max(500).optional(),
  stage: researchRunStageSchema,
  schedulerState: researchSchedulerStateSchema,
  lastObservedAt: z.number(),
  nextCheckAt: z.number().optional(),
  terminalState: z.enum(['completed', 'failed', 'cancelled']).optional(),
  artifactRefs: researchStringListSchema,
}).strict();
export type ResearchRunState = z.infer<typeof researchRunStateSchema>;

export const researchEvidencePacketSchema = z.object({
  packet_id: z.string().min(1).max(200),
  kind: z.enum(['observation', 'result', 'failure', 'derivation', 'literature']),
  claim: z.string().min(1).max(8000),
  evidence: z.string().min(1).max(12000),
  question_id: z.string().min(1).max(200).optional(),
  line_slug: z.string().min(1).max(63).optional(),
  action_id: z.string().min(1).max(200).optional(),
  method: z.string().max(4000).optional(),
  assumptions: z.array(z.string().max(1000)).max(50).default([]),
  tests: z.array(z.string().max(1000)).max(50).default([]),
  artifact_refs: z.array(z.string().max(500)).max(50).default([]),
  source_refs: z.array(z.string().max(500)).max(50).default([]),
  limitations: z.array(z.string().max(1000)).max(50).default([]),
  confidence: z.enum(['low', 'medium', 'high']).default('medium'),
}).strict();
export type ResearchEvidencePacket = z.infer<typeof researchEvidencePacketSchema>;

export const researchEvidenceReviewSchema = z.object({
  packet: researchEvidencePacketSchema,
  researchRevision: z.number(),
  questionId: z.string().optional(),
  lineSlug: z.string().optional(),
}).strict();
export type ResearchEvidenceReview = z.infer<typeof researchEvidenceReviewSchema>;

export const researchHumanGateKindSchema = z.enum(['approval', 'review', 'decision']);

export const researchPlanV2ActionBindingSchema = z.object({
  planId: z.string().min(1).max(200),
  planRevision: z.number().int().positive(),
  milestoneId: z.string().min(1).max(200),
}).strict();
export const researchActionPlanBindingSchema = z.object({
  schema: z.literal('hakimi/action-plan-binding-0.1'),
  kind: z.enum(['minimal', 'reviewed_plan']),
  planId: z.string().min(1).max(200),
  planRevision: z.number().int().positive(),
}).strict();

export const researchActionSpecSchema = z.object({
  actionId: z.string(),
  observedRunActionId: z.string().min(1).optional(),
  questionId: z.string().optional(),
  questionRevision: z.number().int().positive().optional(),
  lineSlug: z.string().optional(),
  lineRevision: z.number().int().positive().optional(),
  kind: researchActionKindSchema,
  purpose: researchLongTextSchema,
  expectedEvidence: researchStringListSchema,
  stopCondition: researchShortTextSchema,
  allowedToolKinds: researchStringListSchema,
  retryOfEntryId: z.string().optional(),
  status: researchActionStatusSchema,
  createdAt: z.number(),
  completedAt: z.number().optional(),
  requiresHumanApproval: z.boolean(),
  researchPlanBinding: researchPlanV2ActionBindingSchema.optional(),
  actionPlanBinding: researchActionPlanBindingSchema.optional(),
  run: researchRunStateSchema.optional(),
});
export type ResearchActionSpec = z.infer<typeof researchActionSpecSchema>;

export const planActionInputSchema = z.object({
  actionId: z.string().optional(),
  observedRunActionId: z.string().min(1).optional(),
  questionId: z.string().optional(),
  lineSlug: z.string().optional(),
  kind: researchActionKindSchema,
  purpose: researchLongTextSchema,
  expectedEvidence: researchStringListSchema.optional(),
  stopCondition: researchShortTextSchema,
  allowedToolKinds: researchStringListSchema.optional(),
  retryOfEntryId: z.string().optional(),
  requiresHumanApproval: z.boolean().optional(),
  planningLevel: z.enum(['simple', 'planned']).optional(),
  researchPlanId: z.string().min(1).max(200).optional(),
  researchPlanRevision: z.number().int().positive().optional(),
  milestoneId: z.string().min(1).max(200).optional(),
  actionPlanId: z.string().min(1).max(200).optional(),
  actionPlanRevision: z.number().int().positive().optional(),
}).strict();
export type PlanActionInput = z.infer<typeof planActionInputSchema>;

export const researchProgressDetailSchema = z.object({
  assumptions: researchStringListSchema.optional(),
  derivation: researchLongTextSchema.optional(),
  tests: researchStringListSchema.optional(),
  observations: researchStringListSchema.optional(),
  sources: researchStringListSchema.optional(),
  limitations: researchStringListSchema.optional(),
  detailHint: researchShortTextSchema.optional(),
  artifactRefs: researchStringListSchema.optional(),
}).strict();
export type ResearchProgressDetail = z.infer<typeof researchProgressDetailSchema>;

export const researchProgressReportSchema = z.object({
  headline: researchShortTextSchema,
  question: researchShortTextSchema.optional(),
  motivation: researchLongTextSchema,
  workPerformed: researchLongTextSchema,
  result: researchLongTextSchema,
  mainlineImpact: researchLongTextSchema,
  uncertainties: researchStringListSchema,
  nextAction: researchShortTextSchema.optional(),
  phaseChange: z
    .object({
      from: researchPhaseSchema,
      to: researchPhaseSchema,
    })
    .optional(),
  humanDecision: researchShortTextSchema.optional(),
  detail: researchProgressDetailSchema.optional(),
  recordedAt: z.number(),
});
export type ResearchProgressReport = z.infer<typeof researchProgressReportSchema>;

export const concludeActionInputSchema = z.object({
  actionId: z.string(),
  status: z.enum(['completed', 'abandoned']),
  progress: z.object({
    headline: researchShortTextSchema,
    question: researchShortTextSchema.optional(),
    motivation: researchLongTextSchema,
    workPerformed: researchLongTextSchema,
    result: researchLongTextSchema,
    mainlineImpact: researchLongTextSchema,
    uncertainties: researchStringListSchema.optional(),
    nextAction: researchShortTextSchema.optional(),
    detail: researchProgressDetailSchema.optional(),
  }).strict(),
  durability: researchDurabilityAssessmentSchema,
}).strict();
export type ConcludeActionInput = z.infer<typeof concludeActionInputSchema>;

export const researchStateChangeSchema = z.object({
  beforePhase: researchPhaseSchema,
  afterPhase: researchPhaseSchema,
  actionId: z.string().optional(),
  summary: z.string(),
  changedAt: z.number(),
});
export type ResearchStateChange = z.infer<typeof researchStateChangeSchema>;

export const researchHumanGateSchema = z.object({
  gateId: z.string(),
  kind: researchHumanGateKindSchema,
  actionId: z.string().optional(),
  questionId: z.string().optional(),
  prompt: researchLongTextSchema,
  resolvedAt: z.number().optional(),
  resolution: researchShortTextSchema.optional(),
  createdAt: z.number(),
});
export type ResearchHumanGate = z.infer<typeof researchHumanGateSchema>;

export const researchProgramSchema = z.object({
  topicId: z.string(),
  title: z.string(),
  goalText: z.string(),
  goalSource: z.string(),
  establishedAt: z.number(),
  observedRevision: z.number().int().positive(),
}).strict();
export type ResearchProgram = z.infer<typeof researchProgramSchema>;

export const researchLocalConclusionSchema = z.object({
  action: researchActionSpecSchema,
  progress: researchProgressReportSchema,
  candidate: researchDurableCommitCandidateSchema,
  program: researchProgramSchema.optional(),
  line: researchLineSchema.optional(),
}).strict();
export type ResearchLocalConclusion = z.infer<typeof researchLocalConclusionSchema>;

export const researchActionConclusionSchema = z.object({
  action: researchActionSpecSchema,
  progress: researchProgressReportSchema,
  commitCandidate: researchDurableCommitCandidateSchema.optional(),
  localConclusion: researchLocalConclusionSchema.optional(),
}).strict();

export const researchGoalAlignmentSchema = z.object({
  status: z.enum(['unavailable', 'confirmation_required', 'aligned', 'stale', 'conflict']),
  reason: z.string(),
  binding: z.object({
    relation: z.enum(['same_program_goal', 'goal_parent_of_program', 'goal_milestone_in_program', 'unrelated']),
    goalId: z.string(),
    topicId: z.string(),
    observedRevision: z.number().int().positive(),
    confirmedAt: z.number(),
  }).strict().optional(),
}).strict();
export type ResearchGoalAlignment = z.infer<typeof researchGoalAlignmentSchema>;

export const researchGoalProjectionSchema = z.object({
  schema: z.literal('hakimi/research-goal-0.1'),
  goalId: z.string(),
  objective: z.string(),
  completionCriterion: z.string().optional(),
  scope: z.object({
    programTopicId: z.string().optional(),
    lineSlug: z.string().optional(),
    questionId: z.string().optional(),
  }).strict(),
  nonGoals: z.array(z.string()),
  budget: z.object({
    tokenBudget: z.number().nullable(),
    turnBudget: z.number().nullable(),
    wallClockBudgetMs: z.number().nullable(),
    remainingTokens: z.number().nullable(),
    remainingTurns: z.number().nullable(),
    remainingWallClockMs: z.number().nullable(),
    tokenBudgetReached: z.boolean(),
    turnBudgetReached: z.boolean(),
    wallClockBudgetReached: z.boolean(),
    overBudget: z.boolean(),
  }).strict(),
  stopConditions: z.array(z.object({
    code: z.string(),
    reached: z.boolean(),
    reason: z.string(),
  }).strict()),
  status: z.enum(['active', 'paused', 'blocked', 'complete']),
  terminalReason: z.string().optional(),
  waitingFor: z.object({
    taskIds: z.array(z.string()),
    policy: z.enum(['any', 'all']),
  }).strict().optional(),
  continuation: goalContinuationSnapshotSchema.optional(),
  programRelation: researchGoalAlignmentSchema,
  humanGates: z.array(researchHumanGateSchema),
  persistenceGuards: z.array(z.object({
    code: z.string(),
    status: z.enum(['clear', 'blocked', 'inactive']),
    reason: z.string(),
  }).strict()),
  researchRevision: z.number().int().nonnegative(),
}).strict();
export type ResearchGoalProjection = z.infer<typeof researchGoalProjectionSchema>;

export const researchPeriodSchema = z.object({
  id: z.string(),
  lineSlug: z.string(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  loopCount: z.number().int().nonnegative(),
  currentQuestionId: z.string().optional(),
  summary: z.string().optional(),
}).strict();
export type ResearchPeriod = z.infer<typeof researchPeriodSchema>;

export const researchStatusProjectionSchema = z.object({
  currentLineSlug: z.string().optional(),
  currentQuestionId: z.string().optional(),
  currentActionId: z.string().optional(),
  phase: researchPhaseSchema,
  nextStep: z.string().optional(),
  health: z.enum(['ok', 'attention', 'degraded', 'blocked']),
  attention: z.array(z.string()),
}).strict();
export type ResearchStatusProjection = z.infer<typeof researchStatusProjectionSchema>;

export const researchPlanResolutionSchema = z.object({
  planId: z.string().min(1).max(200),
  planRevision: z.number().int().nonnegative(),
  outcome: z.literal('approved'),
  selectedLabel: z.string().min(1).max(80).optional(),
}).strict();
export const researchPlanSchema = z.object({
  planId: z.string().min(1).max(200),
  researchRevision: z.number().int().nonnegative(),
  programId: z.string().min(1).max(200).optional(),
  periodId: z.string().min(1).max(200).optional(),
  lineSlug: z.string().min(1).max(200).optional(),
  questionId: z.string().min(1).max(200).optional(),
  lineRevision: z.number().int().positive().optional(),
  questionRevision: z.number().int().positive().optional(),
  objective: z.string().min(1).max(8000),
  steps: z.array(z.string().min(1).max(2000)).max(100),
  expectedEvidence: z.array(z.string().min(1).max(2000)).max(100),
  stopCondition: z.string().min(1).max(2000),
  status: z.enum(['draft', 'finalized', 'discarded']),
  resolution: researchPlanResolutionSchema.optional(),
}).strict();
export type ResearchPlan = z.infer<typeof researchPlanSchema>;

export const researchPlanV2MilestoneSchema = z.object({
  milestoneId: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  objective: z.string().min(1).max(8000),
  completionCriterion: z.string().min(1).max(4000),
  evidenceRequirements: z.array(z.string().min(1).max(2000)).max(100),
}).strict();
export const researchPlanV2DecisionPointSchema = z.object({
  decisionId: z.string().min(1).max(200),
  milestoneId: z.string().min(1).max(200),
  prompt: z.string().min(1).max(4000),
  condition: z.string().min(1).max(4000),
}).strict();
const researchPlanV2ShapeSchema = z.object({
  schema: z.literal('hakimi/research-plan-0.2'),
  planId: z.string().min(1).max(200),
  revision: z.number().int().positive(),
  goalId: z.string().min(1).max(200),
  programId: z.string().min(1).max(200),
  programObservedRevision: z.number().int().positive(),
  goalRelation: z.enum(['same_program_goal', 'goal_parent_of_program', 'goal_milestone_in_program']),
  objective: z.string().min(1).max(8000),
  completionCriterion: z.string().min(1).max(4000).optional(),
  milestones: z.array(researchPlanV2MilestoneSchema).min(1).max(100),
  evidenceRequirements: z.array(z.string().min(1).max(2000)).max(100),
  decisionPoints: z.array(researchPlanV2DecisionPointSchema).max(100),
  assumptions: z.array(z.string().min(1).max(2000)).max(100),
  currentMilestoneId: z.string().min(1).max(200),
  stopConditions: z.array(z.string().min(1).max(2000)).min(1).max(100),
  replanConditions: z.array(z.string().min(1).max(2000)).min(1).max(100),
  status: z.enum(['draft', 'active', 'completed', 'discarded']),
  createdAt: z.number(),
  updatedAt: z.number(),
}).strict();

type ResearchPlanV2ReferenceShape = Pick<
  z.infer<typeof researchPlanV2ShapeSchema>,
  'milestones' | 'decisionPoints' | 'currentMilestoneId'
>;

function validateResearchPlanV2References(
  plan: ResearchPlanV2ReferenceShape,
  ctx: z.RefinementCtx<ResearchPlanV2ReferenceShape>,
): void {
  const milestoneIds = new Set<string>();
  for (const milestone of plan.milestones) {
    if (milestoneIds.has(milestone.milestoneId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['milestones'],
        message: `Duplicate milestone id: ${milestone.milestoneId}`,
      });
    }
    milestoneIds.add(milestone.milestoneId);
  }
  if (!milestoneIds.has(plan.currentMilestoneId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['currentMilestoneId'],
      message: 'Current milestone must reference one declared milestone.',
    });
  }
  const decisionIds = new Set<string>();
  for (const decision of plan.decisionPoints) {
    if (decisionIds.has(decision.decisionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['decisionPoints'],
        message: `Duplicate decision id: ${decision.decisionId}`,
      });
    }
    decisionIds.add(decision.decisionId);
    if (!milestoneIds.has(decision.milestoneId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['decisionPoints'],
        message: `Decision ${decision.decisionId} references an unknown milestone.`,
      });
    }
  }
}

export const researchPlanV2Schema = researchPlanV2ShapeSchema.superRefine(
  validateResearchPlanV2References,
);
export type ResearchPlanV2 = z.infer<typeof researchPlanV2Schema>;

export const prepareResearchPlanV2InputSchema = researchPlanV2ShapeSchema.pick({
  objective: true,
  completionCriterion: true,
  milestones: true,
  evidenceRequirements: true,
  decisionPoints: true,
  assumptions: true,
  currentMilestoneId: true,
  stopConditions: true,
  replanConditions: true,
}).extend({
  planId: z.string().min(1).max(200).optional(),
  expectedRevision: z.number().int().positive().optional(),
}).strict().superRefine(validateResearchPlanV2References);
export type PrepareResearchPlanV2Input = z.infer<typeof prepareResearchPlanV2InputSchema>;

export const transitionResearchPlanV2InputSchema = z.object({
  planId: z.string().min(1).max(200),
  expectedRevision: z.number().int().positive(),
}).strict();
export type TransitionResearchPlanV2Input = z.infer<typeof transitionResearchPlanV2InputSchema>;

export const prepareResearchPlanInputSchema = z.object({
  planId: z.string().min(1).max(200).optional(),
  lineSlug: z.string().min(1).max(200).optional(),
  questionId: z.string().min(1).max(200).optional(),
  objective: z.string().min(1).max(8000),
  steps: z.array(z.string().min(1).max(2000)).max(100),
  expectedEvidence: z.array(z.string().min(1).max(2000)).max(100),
  stopCondition: z.string().min(1).max(2000),
  usePlanMode: z.boolean().optional(),
}).strict();
export type PrepareResearchPlanInput = z.infer<typeof prepareResearchPlanInputSchema>;

export const researchDistillationAttentionSchema = z.discriminatedUnion('status', [
  z.object({
    schema: z.literal('hakimi/research-distillation-attention-0.1'),
    status: z.literal('review_requested'),
    checkpointId: z.string().min(1).max(200),
    entryId: z.string().min(1).max(200),
    recordedAt: z.number(),
  }).strict(),
  z.object({
    schema: z.literal('hakimi/research-distillation-attention-0.1'),
    status: z.literal('handoff_unavailable'),
    checkpointId: z.string().min(1).max(200),
    entryId: z.string().min(1).max(200),
    reason: z.string().min(1).max(2000),
    recordedAt: z.number(),
  }).strict(),
]);
export type ResearchDistillationAttention = z.infer<typeof researchDistillationAttentionSchema>;

export const researchStatusSnapshotSchema = z.object({
  mode: aitpModePhaseSchema,
  loopStatus: researchLoopStatusSchema,
  currentLineSlug: z.string().optional(),
  currentWorkstreamBinding: researchLineWorkstreamAlignmentSchema.optional(),
  lineWorkstreamBindings: z.array(researchLineWorkstreamBindingSchema),
  currentFocus: researchFocusSchema.optional(),
  currentQuestion: researchQuestionSchema.optional(),
  questions: z.array(researchQuestionSchema),
  lines: z.array(researchLineSchema),
  openQuestionCount: z.number(),
  activeQuestionCount: z.number(),
  blockedQuestionCount: z.number(),
  alerts: z.array(researchAlertSchema),
  effectiveNextStep: researchEffectiveNextStepSchema.optional(),
  goalSummary: researchGoalSummarySchema.optional(),
  researchGoal: researchGoalProjectionSchema.optional(),
  goalAlignment: researchGoalAlignmentSchema.optional(),
  aitpHealth: aitpAdapterHealthSchema,
  aitpMaintenance: aitpMaintenanceReceiptSchema.optional(),
  pendingCheckpoint: researchCheckpointSchema.optional(),
  localConclusion: researchLocalConclusionSchema.optional(),
  latestCommittedCheckpoint: researchCommittedCursorSchema.optional(),
  committedCheckpointHistory: z.array(researchCommittedCursorSchema).optional(),
  distillationAttention: researchDistillationAttentionSchema.optional(),
  phase: researchPhaseSchema,
  currentAction: researchActionSpecSchema.optional(),
  currentRun: researchRunStateSchema.optional(),
  latestProgress: researchProgressReportSchema.optional(),
  recentStateChange: researchStateChangeSchema.optional(),
  humanGate: researchHumanGateSchema.optional(),
  program: researchProgramSchema.optional(),
  period: researchPeriodSchema.optional(),
  researchPlan: researchPlanSchema.optional(),
  actionPlan: researchPlanSchema.optional(),
  researchPlanV2: researchPlanV2Schema.optional(),
  planningPolicy: researchPlanningPolicySchema,
  status: researchStatusProjectionSchema.optional(),
  revision: z.number(),
}).superRefine((snapshot, context) => {
  if (
    snapshot.currentLineSlug !== undefined
    && snapshot.currentWorkstreamBinding !== undefined
    && snapshot.currentLineSlug !== snapshot.currentWorkstreamBinding.lineSlug
  ) {
    context.addIssue({
      code: 'custom',
      path: ['currentWorkstreamBinding', 'lineSlug'],
      message: 'The current Line-workstream alignment must identify the current Line.',
    });
  }
});
export const researchAlertFingerprintSchema = z.string().min(1);
export const resolveHumanDecisionInputSchema = z.object({
  gateId: z.string(),
  resolution: researchShortTextSchema,
  nextPhase: awaitingHumanExitPhaseSchema,
}).strict();
export type ResolveHumanDecisionInput = z.infer<typeof resolveHumanDecisionInputSchema>;

export type ResearchStatusSnapshot = z.infer<typeof researchStatusSnapshotSchema>;

// ── input types ─────────────────────────────────────────────────────────────

export const researchLineCreationInputSchema = z.object({
  slug: z.string(),
  title: z.string(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
});
export type ResearchLineCreationInput = z.infer<typeof researchLineCreationInputSchema>;

export const researchLineUpdateInputSchema = z.object({
  slug: z.string(),
  expectedRevision: z.number().optional(),
  title: z.string().optional(),
  objective: z.string().optional(),
  status: researchLineStatusSchema.optional(),
  assessment: z.string().optional(),
  reason: z.string().optional(),
});
export type ResearchLineUpdateInput = z.infer<typeof researchLineUpdateInputSchema>;

export const humanSteeringCommandSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('set_focus'),
    questionId: z.string(),
    expectedRevision: z.number(),
    boundedAction: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('update_question'),
    questionId: z.string(),
    expectedRevision: z.number(),
    wording: z.string().optional(),
    priority: z.number().optional(),
    workflow: questionWorkflowSchema.optional(),
    epistemic: questionEpistemicSchema.optional(),
    neededEvidence: z.array(z.string()).optional(),
    nextBoundedAction: z.string().optional(),
    assessment: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('switch_line'),
    lineSlug: z.string(),
    expectedRevision: z.number(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('pause_loop'),
    expectedRevision: z.number(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('resume_loop'),
    expectedRevision: z.number(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('reopen_question'),
    questionId: z.string(),
    expectedRevision: z.number(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('defer_question'),
    questionId: z.string(),
    expectedRevision: z.number(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('block_question'),
    questionId: z.string(),
    expectedRevision: z.number(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('close_question'),
    questionId: z.string(),
    expectedRevision: z.number(),
    reason: z.string().optional(),
  }),
]);
export type HumanSteeringCommand = z.infer<typeof humanSteeringCommandSchema>;

// Engine input type aliases for satisfies checks
export type CreateQuestionInput = {
  readonly id?: string;
  readonly lineSlug: string;
  readonly wording: string;
  readonly assessment?: string;
  readonly priority?: number;
  readonly neededEvidence?: readonly string[];
};

export type UpdateQuestionInput = {
  readonly questionId: string;
  readonly expectedRevision?: number;
  readonly wording?: string;
  readonly assessment?: string;
  readonly priority?: number;
  readonly workflow?: 'open' | 'active' | 'deferred' | 'blocked' | 'closed' | 'cancelled';
  readonly epistemic?: 'unknown' | 'candidate' | 'supported' | 'contradicted' | 'inconclusive';
  readonly neededEvidence?: readonly string[];
  readonly nextBoundedAction?: string;
  readonly evidenceRefs?: readonly string[];
  readonly falsifierRefs?: readonly string[];
  readonly reason?: string;
};

export type ProposeCheckpointInput = {
  readonly expectedRevision: number;
  readonly questionId?: string;
  readonly lineSlug?: string;
  readonly assessment?: string;
  readonly nextAction?: string;
};

export type CommitCheckpointInput = {
  readonly checkpointId: string;
  readonly entryId: string;
};

export type DiscardHistoricalCheckpointInput = {
  readonly checkpointId: string;
  readonly expectedRevision: number;
};

export type AitpModeEntryOptions = {
  readonly actor: 'user' | 'model';
  readonly lineSlug?: string;
};
