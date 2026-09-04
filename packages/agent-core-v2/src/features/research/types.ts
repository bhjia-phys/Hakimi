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

export type AwaitingHumanExitPhase = Extract<
  ResearchPhase,
  'idle' | 'gap_analysis' | 'action_planned' | 'action_executing' | 'evaluating'
>;

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
  /** Monotonic local revision of the observed topic identity and contents. */
  readonly observedRevision: number;
}

/**
 * Explicit Hakimi-local membership assertion between one Research Line and
 * one AITP workstream. It is pinned to the exact Topic observation visible
 * when a user or the main agent confirmed it; matching slugs never imply a
 * binding.
 */
export interface ResearchLineWorkstreamBinding {
  readonly confirmationId: string;
  readonly lineSlug: string;
  readonly workstream: string;
  readonly topicId: string;
  readonly observedRevision: number;
  readonly confirmedBy: 'user' | 'main_agent';
  readonly confirmedAt: number;
}

export const ResearchLineWorkstreamBindingSchema = z.object({
  confirmationId: z.string().min(1).max(200),
  lineSlug: z.string().min(1).max(200),
  workstream: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  topicId: z.string().min(1).max(200),
  observedRevision: z.number().int().positive(),
  confirmedBy: z.enum(['user', 'main_agent']),
  confirmedAt: z.number(),
}).strict();

export type ResearchLineWorkstreamBindingStatus =
  | 'unbound'
  | 'unavailable'
  | 'bound'
  | 'stale'
  | 'conflict';

/** Current derived validity of an immutable binding record. */
export interface ResearchLineWorkstreamAlignment {
  readonly lineSlug: string;
  readonly status: ResearchLineWorkstreamBindingStatus;
  readonly reason: string;
  readonly binding?: ResearchLineWorkstreamBinding;
}

export type ResearchGoalAlignmentRelation =
  | 'same_program_goal'
  | 'goal_parent_of_program'
  | 'goal_milestone_in_program'
  | 'unrelated';

export type ResearchGoalAlignmentStatus =
  | 'unavailable'
  | 'confirmation_required'
  | 'aligned'
  | 'stale'
  | 'conflict';

export interface ResearchGoalProgramBinding {
  readonly relation: ResearchGoalAlignmentRelation;
  readonly goalId: string;
  readonly topicId: string;
  readonly observedRevision: number;
  readonly confirmedAt: number;
}

export interface ResearchGoalAlignment {
  readonly status: ResearchGoalAlignmentStatus;
  readonly reason: string;
  readonly binding?: ResearchGoalProgramBinding;
}

/**
 * One continuous, line-bound research window. `endedAt` is set once the window
 * closes (line switch or mode exit); the legacy-named `loopCount` field counts
 * admitted Research turns, while the current question/summary are updated only
 * at those turn boundaries.
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

export type ResearchPlanV2Status = 'draft' | 'active' | 'completed' | 'discarded';

export type ResearchPlanningPolicy = 'collaborative' | 'dreaming';

export const ResearchPlanningPolicySchema = z.enum(['collaborative', 'dreaming']);

export interface ResearchPlanV2Milestone {
  readonly milestoneId: string;
  readonly title: string;
  readonly objective: string;
  readonly completionCriterion: string;
  readonly evidenceRequirements: readonly string[];
}

export interface ResearchPlanV2DecisionPoint {
  readonly decisionId: string;
  readonly milestoneId: string;
  readonly prompt: string;
  readonly condition: string;
}

export interface ResearchPlanV2 {
  readonly schema: 'hakimi/research-plan-0.2';
  readonly planId: string;
  readonly revision: number;
  readonly goalId: string;
  readonly programId: string;
  readonly programObservedRevision: number;
  readonly goalRelation: Exclude<ResearchGoalAlignmentRelation, 'unrelated'>;
  readonly objective: string;
  readonly completionCriterion?: string;
  readonly milestones: readonly ResearchPlanV2Milestone[];
  readonly evidenceRequirements: readonly string[];
  readonly decisionPoints: readonly ResearchPlanV2DecisionPoint[];
  readonly assumptions: readonly string[];
  readonly currentMilestoneId: string;
  readonly stopConditions: readonly string[];
  readonly replanConditions: readonly string[];
  readonly status: ResearchPlanV2Status;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ResearchPlanV2ActionBinding {
  readonly planId: string;
  readonly planRevision: number;
  readonly milestoneId: string;
}

export interface ResearchActionPlanBinding {
  readonly schema: 'hakimi/action-plan-binding-0.1';
  readonly kind: 'minimal' | 'reviewed_plan';
  readonly planId: string;
  readonly planRevision: number;
}

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

export const ResearchPlanV2MilestoneSchema = z.object({
  milestoneId: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  objective: z.string().min(1).max(8000),
  completionCriterion: z.string().min(1).max(4000),
  evidenceRequirements: z.array(z.string().min(1).max(2000)).max(100),
}).strict();

export const ResearchPlanV2DecisionPointSchema = z.object({
  decisionId: z.string().min(1).max(200),
  milestoneId: z.string().min(1).max(200),
  prompt: z.string().min(1).max(4000),
  condition: z.string().min(1).max(4000),
}).strict();

export const ResearchPlanV2Schema = z.object({
  schema: z.literal('hakimi/research-plan-0.2'),
  planId: z.string().min(1).max(200),
  revision: z.number().int().positive(),
  goalId: z.string().min(1).max(200),
  programId: z.string().min(1).max(200),
  programObservedRevision: z.number().int().positive(),
  goalRelation: z.enum([
    'same_program_goal',
    'goal_parent_of_program',
    'goal_milestone_in_program',
  ]),
  objective: z.string().min(1).max(8000),
  completionCriterion: z.string().min(1).max(4000).optional(),
  milestones: z.array(ResearchPlanV2MilestoneSchema).min(1).max(100),
  evidenceRequirements: z.array(z.string().min(1).max(2000)).max(100),
  decisionPoints: z.array(ResearchPlanV2DecisionPointSchema).max(100),
  assumptions: z.array(z.string().min(1).max(2000)).max(100),
  currentMilestoneId: z.string().min(1).max(200),
  stopConditions: z.array(z.string().min(1).max(2000)).min(1).max(100),
  replanConditions: z.array(z.string().min(1).max(2000)).min(1).max(100),
  status: z.enum(['draft', 'active', 'completed', 'discarded']),
  createdAt: z.number(),
  updatedAt: z.number(),
}).strict().superRefine((plan, ctx) => {
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
});

export const ResearchPlanV2ActionBindingSchema = z.object({
  planId: z.string().min(1).max(200),
  planRevision: z.number().int().positive(),
  milestoneId: z.string().min(1).max(200),
}).strict();

export const ResearchActionPlanBindingSchema = z.object({
  schema: z.literal('hakimi/action-plan-binding-0.1'),
  kind: z.enum(['minimal', 'reviewed_plan']),
  planId: z.string().min(1).max(200),
  planRevision: z.number().int().positive(),
}).strict();
