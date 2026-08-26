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

export const researchAlertSchema = z.object({
  fingerprint: z.string().min(1),
  kind: researchAlertKindSchema,
  message: z.string(),
  questionId: z.string().optional(),
  lineSlug: z.string().optional(),
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
  'check_findings',
  'stale_generation',
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

export const aitpMaintenanceReceiptSchema = z.object({
  status: aitpMaintenanceStatusSchema,
  refreshedAt: z.number(),
  memoryStatus: aitpMaintenanceMemoryStatusSchema,
  workstream: z.string().optional(),
  latestWorkingNoteAt: z.number().optional(),
  activeNewerThanWorkingNote: z.boolean().nullable(),
  unresolvedFailureCount: z.number().int().nonnegative(),
  nextAction: z.string().optional(),
  warningSummaries: z.array(aitpMaintenanceWarningSummarySchema),
  check: aitpMaintenanceCheckSummarySchema,
  degradedReason: aitpMaintenanceDegradedReasonSchema.optional(),
});
export type AitpMaintenanceReceipt = z.infer<typeof aitpMaintenanceReceiptSchema>;

export const researchCommittedCursorSchema = z.object({
  checkpointId: z.string(),
  entryId: z.string().optional(),
  committedAt: z.number(),
});
export type ResearchCommittedCursor = z.infer<typeof researchCommittedCursorSchema>;

export const researchGoalSummarySchema = z.object({
  status: z.string(),
  remainingTurns: z.number().optional(),
});

export const researchCheckpointSchema = z.object({
  checkpointId: z.string(),
  questionId: z.string().optional(),
  lineSlug: z.string().optional(),
  assessment: z.string().optional(),
  nextAction: z.string().optional(),
  idempotencyKey: z.string(),
  persistence: questionPersistenceSchema,
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

export const researchHumanGateKindSchema = z.enum(['approval', 'review', 'decision']);

export const researchActionSpecSchema = z.object({
  actionId: z.string(),
  questionId: z.string().optional(),
  lineSlug: z.string().optional(),
  kind: researchActionKindSchema,
  purpose: z.string(),
  expectedEvidence: z.array(z.string()),
  stopCondition: z.string(),
  allowedToolKinds: z.array(z.string()),
  status: researchActionStatusSchema,
  createdAt: z.number(),
  completedAt: z.number().optional(),
  requiresHumanApproval: z.boolean(),
});
export type ResearchActionSpec = z.infer<typeof researchActionSpecSchema>;

export const researchProgressDetailSchema = z.object({
  assumptions: z.array(z.string()).optional(),
  derivation: z.string().optional(),
  tests: z.array(z.string()).optional(),
  observations: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  limitations: z.array(z.string()).optional(),
  detailHint: z.string().optional(),
  artifactRefs: z.array(z.string()).optional(),
});
export type ResearchProgressDetail = z.infer<typeof researchProgressDetailSchema>;

export const researchProgressReportSchema = z.object({
  headline: z.string(),
  question: z.string().optional(),
  motivation: z.string(),
  workPerformed: z.string(),
  result: z.string(),
  mainlineImpact: z.string(),
  uncertainties: z.array(z.string()),
  nextAction: z.string().optional(),
  phaseChange: z
    .object({
      from: researchPhaseSchema,
      to: researchPhaseSchema,
    })
    .optional(),
  humanDecision: z.string().optional(),
  detail: researchProgressDetailSchema.optional(),
  recordedAt: z.number(),
});
export type ResearchProgressReport = z.infer<typeof researchProgressReportSchema>;

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
  prompt: z.string(),
  resolvedAt: z.number().optional(),
  resolution: z.string().optional(),
  createdAt: z.number(),
});
export type ResearchHumanGate = z.infer<typeof researchHumanGateSchema>;

export const researchAlertFingerprintSchema = z.string().min(1);
export const resolveHumanDecisionInputSchema = z.object({
  gateId: z.string(),
  resolution: z.string(),
  nextPhase: researchPhaseSchema,
});
export type ResolveHumanDecisionInput = z.infer<typeof resolveHumanDecisionInputSchema>;

export const researchStatusSnapshotSchema = z.object({
  mode: aitpModePhaseSchema,
  loopStatus: researchLoopStatusSchema,
  currentLineSlug: z.string().optional(),
  currentFocus: researchFocusSchema.optional(),
  currentQuestion: researchQuestionSchema.optional(),
  questions: z.array(researchQuestionSchema),
  lines: z.array(researchLineSchema),
  openQuestionCount: z.number(),
  activeQuestionCount: z.number(),
  blockedQuestionCount: z.number(),
  alerts: z.array(researchAlertSchema),
  goalSummary: researchGoalSummarySchema.optional(),
  aitpHealth: aitpAdapterHealthSchema,
  aitpMaintenance: aitpMaintenanceReceiptSchema.optional(),
  pendingCheckpoint: researchCheckpointSchema.optional(),
  latestCommittedCheckpoint: researchCommittedCursorSchema.optional(),
  phase: researchPhaseSchema,
  currentAction: researchActionSpecSchema.optional(),
  latestProgress: researchProgressReportSchema.optional(),
  recentStateChange: researchStateChangeSchema.optional(),
  humanGate: researchHumanGateSchema.optional(),
  revision: z.number(),
});
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
  readonly questionId?: string;
  readonly lineSlug?: string;
  readonly assessment?: string;
  readonly nextAction?: string;
};

export type CommitCheckpointInput = {
  readonly checkpointId: string;
  readonly entryId: string;
};

export type AitpModeEntryOptions = {
  readonly actor: 'user' | 'model';
  readonly lineSlug?: string;
};
