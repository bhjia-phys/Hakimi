/**
 * `research` domain — protocol-independent Research types.
 *
 * The canonical, minimal type vocabulary of the Research contract. These are
 * pure string unions and readonly payload shapes with no AITP dependency and
 * no scoped state; they express the scientific state layer (phase / action
 * kind / action status / run stage) plus the layered local working-state
 * vocabulary (the topic-bound `ResearchProgram`, the auditable
 * `ResearchPeriod` window, and the display-oriented
 * `ResearchStatusProjection`). The AITP Research feature imports and
 * re-exports these so the old import paths keep working, and the transition
 * authority consumes them here. Scope-agnostic.
 */

import { z } from 'zod';

export type ResearchPhase =
  | 'idle'
  | 'orienting'
  | 'gap_analysis'
  | 'action_planned'
  | 'action_executing'
  | 'evaluating'
  | 'state_updated'
  | 'checkpoint_pending'
  | 'awaiting_human';

export type ResearchActionKind =
  | 'experiment'
  | 'derivation'
  | 'literature_review'
  | 'data_analysis'
  | 'simulation'
  | 'other';

export type ResearchActionStatus = 'planned' | 'in_progress' | 'completed' | 'abandoned';

export type ResearchRunStage =
  | 'queued'
  | 'running'
  | 'scf'
  | 'band'
  | 'analyzing'
  | 'completed'
  | 'failed'
  | 'unknown';

export type ResearchSchedulerState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'unknown';

/**
 * Safe topic fields projected out of one AITP `enter` payload. Only these
 * fields may cross from the AITP layer into local research state — the raw
 * payload stays the AITP layer's concern.
 */
export interface ResearchProgramTopic {
  readonly id: string;
  readonly title: string;
  readonly goalText: string;
  readonly goalSource: string;
}

/**
 * The current research subject, bound to a single AITP Topic. Never fabricated
 * locally: a program exists only after a real AITP `enter` topic was observed,
 * and a topic change replaces it outright (it never spans unrelated topics).
 */
export interface ResearchProgram {
  readonly topicId: string;
  readonly title: string;
  readonly goalText: string;
  readonly goalSource: string;
  readonly establishedAt: number;
}

/**
 * One continuous, line-bound research window. `endedAt` is set once the window
 * closes (line switch or mode exit); the loop counter and the current
 * question/summary are updated only at admitted loop boundaries.
 */
export interface ResearchPeriod {
  readonly id: string;
  readonly lineSlug: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly loopCount: number;
  readonly currentQuestionId?: string;
  readonly summary?: string;
}

export type ResearchStatusHealth = 'ok' | 'attention' | 'degraded' | 'blocked';

/**
 * Display-oriented, workstream-isolated projection of the current research
 * state. Derived only — carries no audit fields (no timestamps, counters, or
 * ids beyond the current workstream's own).
 */
export interface ResearchStatusProjection {
  readonly currentLineSlug?: string;
  readonly currentQuestionId?: string;
  readonly currentActionId?: string;
  readonly phase: ResearchPhase;
  readonly nextStep?: string;
  readonly health: ResearchStatusHealth;
  readonly attention: readonly string[];
}

export type ResearchPlanStatus = 'draft' | 'finalized' | 'discarded';

export interface ResearchPlanResolution {
  readonly planId: string;
  readonly planRevision: number;
  readonly outcome: 'approved';
  readonly selectedLabel?: string;
}

/**
 * A local, protocol-independent plan for one bounded Research action. It is a
 * checkpointed working contract, not an AITP record or an execution command.
 */
export interface ResearchPlan {
  readonly planId: string;
  readonly researchRevision: number;
  readonly programId?: string;
  readonly periodId?: string;
  readonly lineSlug?: string;
  readonly questionId?: string;
  readonly lineRevision?: number;
  readonly questionRevision?: number;
  readonly objective: string;
  readonly steps: readonly string[];
  readonly expectedEvidence: readonly string[];
  readonly stopCondition: string;
  readonly status: ResearchPlanStatus;
  readonly resolution?: ResearchPlanResolution;
}

export const ResearchPlanResolutionSchema = z.object({
  planId: z.string().min(1).max(200),
  planRevision: z.number().int().nonnegative(),
  outcome: z.literal('approved'),
  selectedLabel: z.string().min(1).max(80).optional(),
}).strict();

export const ResearchPlanSchema = z.object({
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
  resolution: ResearchPlanResolutionSchema.optional(),
}).strict();
export type ParsedResearchPlan = z.infer<typeof ResearchPlanSchema>;
