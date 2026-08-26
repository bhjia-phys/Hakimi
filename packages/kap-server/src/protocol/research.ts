/**
 * AITP Research Mode — JSON-safe protocol schemas (kap-server local copy).
 *
 * Mirrors `@moonshot-ai/protocol/src/research.ts`. The kap-server keeps its
 * own protocol schema copies (same pattern as `goal.ts`, `session.ts`, etc.)
 * so it does not depend on the protocol package at runtime.
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

export const researchFocusSchema = z.object({
  questionId: z.string(),
  boundedAction: z.string().optional(),
  revision: z.number(),
});

export const researchAlertSchema = z.object({
  fingerprint: z.string().min(1),
  kind: researchAlertKindSchema,
  message: z.string(),
  questionId: z.string().optional(),
  lineSlug: z.string().optional(),
  createdAt: z.number(),
  acknowledgedAt: z.number().optional(),
}).strict();

export const aitpAdapterHealthSchema = z.object({
  phase: aitpModePhaseSchema,
  contractVersion: z.string().optional(),
  pluginVersion: z.string().optional(),
  pythonVersion: z.string().optional(),
  lastCheckAt: z.number().optional(),
  lastError: z.string().optional(),
  notInitialized: z.boolean().optional(),
});

export const aitpMaintenanceStatusSchema = z.enum(['ready', 'degraded']);
export const aitpMaintenanceMemoryStatusSchema = z.enum([
  'available',
  'partial',
  'not_established',
  'unknown',
]);
export const aitpMaintenanceDegradedReasonSchema = z.enum([
  'adapter_not_ready',
  'adapter_degraded',
  'enter_failed',
  'check_unavailable',
  'check_findings',
  'stale_generation',
]);
export const aitpMaintenanceWarningSummarySchema = z.object({
  level: z.literal('warning'),
  code: z.string(),
});
export const aitpMaintenanceCheckCountsSchema = z.object({
  entries: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
});
export const aitpMaintenanceCheckSummarySchema = z.object({
  status: z.enum(['clean', 'findings', 'unavailable']),
  counts: aitpMaintenanceCheckCountsSchema.optional(),
  findingCodes: z.array(z.string()),
});
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

export const researchCommittedCursorSchema = z.object({
  checkpointId: z.string(),
  entryId: z.string().optional(),
  committedAt: z.number(),
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

export const researchGoalSummarySchema = z.object({
  status: z.string(),
  remainingTurns: z.number().optional(),
});

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

export const researchStateChangeSchema = z.object({
  beforePhase: researchPhaseSchema,
  afterPhase: researchPhaseSchema,
  actionId: z.string().optional(),
  summary: z.string(),
  changedAt: z.number(),
});

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

// ── REST: GET /sessions/{id}/research ───────────────────────────────────────

export const getSessionResearchResponseSchema = researchStatusSnapshotSchema;
export type GetSessionResearchResponse = z.infer<typeof getSessionResearchResponseSchema>;

// ── REST: POST /sessions/{id}/research/command ──────────────────────────────

export const researchCommandSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('enter_mode'),
    actor: z.enum(['user', 'model']),
    lineSlug: z.string().optional(),
  }),
  z.object({
    kind: z.literal('exit_mode'),
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
    kind: z.literal('create_question'),
    lineSlug: z.string(),
    wording: z.string(),
    assessment: z.string().optional(),
    priority: z.number().optional(),
    neededEvidence: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal('update_question'),
    questionId: z.string(),
    expectedRevision: z.number(),
    wording: z.string().optional(),
    assessment: z.string().optional(),
    priority: z.number().optional(),
    workflow: questionWorkflowSchema.optional(),
    epistemic: questionEpistemicSchema.optional(),
    neededEvidence: z.array(z.string()).optional(),
    nextBoundedAction: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('set_focus'),
    questionId: z.string(),
    expectedRevision: z.number(),
    boundedAction: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('switch_line'),
    lineSlug: z.string(),
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
  z.object({
    kind: z.literal('create_line'),
    slug: z.string(),
    title: z.string(),
    objective: z.string().optional(),
    assessment: z.string().optional(),
  }),
  z.object({
    kind: z.literal('update_line'),
    lineSlug: z.string(),
    expectedRevision: z.number(),
    title: z.string().optional(),
    objective: z.string().optional(),
    status: researchLineStatusSchema.optional(),
    assessment: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('propose_checkpoint'),
    questionId: z.string().optional(),
    lineSlug: z.string().optional(),
    assessment: z.string().optional(),
    nextAction: z.string().optional(),
  }),
  z.object({
    kind: z.literal('commit_checkpoint'),
    checkpointId: z.string(),
    entryId: z.string(),
  }),
  z.object({
    kind: z.literal('resolve_decision'),
    gateId: z.string(),
    resolution: z.string(),
    nextPhase: researchPhaseSchema,
  }),
  z.object({
    kind: z.literal('acknowledge_alert'),
    fingerprint: z.string(),
  }),
]);
export type ResearchCommand = z.infer<typeof researchCommandSchema>;

export const researchCommandRequestSchema = z.object({
  command: researchCommandSchema,
});
export type ResearchCommandRequest = z.infer<typeof researchCommandRequestSchema>;

export const researchCommandResponseSchema = z.object({
  snapshot: researchStatusSnapshotSchema,
});
export type ResearchCommandResponse = z.infer<typeof researchCommandResponseSchema>;
