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
  kind: researchAlertKindSchema,
  message: z.string(),
  questionId: z.string().optional(),
  lineSlug: z.string().optional(),
});
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
  committedEntryId: z.string().optional(),
  createdAt: z.number(),
});
export type ResearchCheckpoint = z.infer<typeof researchCheckpointSchema>;

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
  pendingCheckpoint: researchCheckpointSchema.optional(),
  latestCommittedCheckpoint: researchCommittedCursorSchema.optional(),
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
