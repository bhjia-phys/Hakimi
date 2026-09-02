/**
 * `aitpResearch` domain — Research tool contracts.
 *
 * Defines the input schemas and Agent-scope identifiers for the active-only
 * Research tools, including the bounded action tools (`BeginResearchAction` /
 * `ConcludeResearchAction`), evidence and run review, human decisions, and
 * recovery-oriented atomic operations. Inputs are
 * structured and carry zod length constraints. Bound at Agent scope.
 */

import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';
import { ResearchEvidencePacketSchema } from '../research/evidencePacket';
import {
  AitpAuthoritySchema,
  AitpEntryKindSchema,
  ResearchCommitProvenanceSchema,
} from '../types';

// ── GetResearchStatus ────────────────────────────────────────────────────

export const GetResearchStatusInputSchema = z.object({}).strict();
export type GetResearchStatusInput = z.infer<typeof GetResearchStatusInputSchema>;

export interface IGetResearchStatusTool extends AgentTool<GetResearchStatusInput> {
  readonly _serviceBrand: undefined;
}
export const IGetResearchStatusTool =
  createDecorator<IGetResearchStatusTool>('getResearchStatusTool');

// ── AcknowledgeResearchAlert ──────────────────────────────────────────────

export const AcknowledgeResearchAlertInputSchema = z
  .object({ fingerprint: z.string().min(1).max(500) })
  .strict();
export type AcknowledgeResearchAlertInput = z.infer<typeof AcknowledgeResearchAlertInputSchema>;

export interface IAcknowledgeResearchAlertTool extends AgentTool<AcknowledgeResearchAlertInput> {
  readonly _serviceBrand: undefined;
}
export const IAcknowledgeResearchAlertTool =
  createDecorator<IAcknowledgeResearchAlertTool>('acknowledgeResearchAlertTool');

// ── CreateResearchQuestion ───────────────────────────────────────────────

export const CreateResearchQuestionInputSchema = z
  .object({
    line_slug: z.string(),
    wording: z.string(),
    assessment: z.string().optional(),
    priority: z.number().default(0),
    needed_evidence: z.array(z.string()).default([]),
  })
  .strict();
export type CreateResearchQuestionInput = z.infer<typeof CreateResearchQuestionInputSchema>;

export interface ICreateResearchQuestionTool extends AgentTool<CreateResearchQuestionInput> {
  readonly _serviceBrand: undefined;
}
export const ICreateResearchQuestionTool =
  createDecorator<ICreateResearchQuestionTool>('createResearchQuestionTool');

// ── CreateResearchLine ───────────────────────────────────────────────────

export const CreateResearchLineInputSchema = z
  .object({
    line_slug: z.string(),
    title: z.string(),
    objective: z.string().optional(),
    assessment: z.string().optional(),
  })
  .strict();
export type CreateResearchLineInput = z.infer<typeof CreateResearchLineInputSchema>;

export interface ICreateResearchLineTool extends AgentTool<CreateResearchLineInput> {
  readonly _serviceBrand: undefined;
}
export const ICreateResearchLineTool =
  createDecorator<ICreateResearchLineTool>('createResearchLineTool');

// ── UpdateResearchLine ───────────────────────────────────────────────────

export const UpdateResearchLineInputSchema = z
  .object({
    line_slug: z.string(),
    expected_revision: z.number().optional(),
    title: z.string().optional(),
    objective: z.string().optional(),
    status: z.enum(['active', 'paused', 'completed', 'blocked']).optional(),
    assessment: z.string().optional(),
    reason: z.string().optional(),
  })
  .strict();
export type UpdateResearchLineInput = z.infer<typeof UpdateResearchLineInputSchema>;

export interface IUpdateResearchLineTool extends AgentTool<UpdateResearchLineInput> {
  readonly _serviceBrand: undefined;
}
export const IUpdateResearchLineTool =
  createDecorator<IUpdateResearchLineTool>('updateResearchLineTool');

export const ConfirmResearchWorkstreamBindingInputSchema = z.object({
  line_slug: z.string().min(1).max(200),
  workstream: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  expected_revision: z.number().int().nonnegative(),
}).strict();
export type ConfirmResearchWorkstreamBindingInput = z.infer<
  typeof ConfirmResearchWorkstreamBindingInputSchema
>;

export interface IConfirmResearchWorkstreamBindingTool
  extends AgentTool<ConfirmResearchWorkstreamBindingInput> {
  readonly _serviceBrand: undefined;
}
export const IConfirmResearchWorkstreamBindingTool =
  createDecorator<IConfirmResearchWorkstreamBindingTool>('confirmResearchWorkstreamBindingTool');

export const ClearResearchWorkstreamBindingInputSchema = z.object({
  line_slug: z.string().min(1).max(200),
  expected_revision: z.number().int().nonnegative(),
  expected_confirmation_id: z.string().min(1).max(200),
}).strict();
export type ClearResearchWorkstreamBindingInput = z.infer<
  typeof ClearResearchWorkstreamBindingInputSchema
>;

export interface IClearResearchWorkstreamBindingTool
  extends AgentTool<ClearResearchWorkstreamBindingInput> {
  readonly _serviceBrand: undefined;
}
export const IClearResearchWorkstreamBindingTool =
  createDecorator<IClearResearchWorkstreamBindingTool>('clearResearchWorkstreamBindingTool');

// ── UpdateResearchQuestion ───────────────────────────────────────────────

export const UpdateResearchQuestionInputSchema = z
  .object({
    question_id: z.string(),
    expected_revision: z.number().optional(),
    wording: z.string().optional(),
    assessment: z.string().optional(),
    priority: z.number().optional(),
    workflow: z
      .enum(['open', 'active', 'deferred', 'blocked', 'closed', 'cancelled'])
      .optional(),
    epistemic: z
      .enum(['unknown', 'candidate', 'supported', 'contradicted', 'inconclusive'])
      .optional(),
    needed_evidence: z.array(z.string()).optional(),
    next_bounded_action: z.string().optional(),
    evidence_refs: z.array(z.string()).optional(),
    reason: z.string().optional(),
  })
  .strict();
export type UpdateResearchQuestionInput = z.infer<typeof UpdateResearchQuestionInputSchema>;

export interface IUpdateResearchQuestionTool extends AgentTool<UpdateResearchQuestionInput> {
  readonly _serviceBrand: undefined;
}
export const IUpdateResearchQuestionTool =
  createDecorator<IUpdateResearchQuestionTool>('updateResearchQuestionTool');

// ── SetResearchFocus ─────────────────────────────────────────────────────

export const SetResearchFocusInputSchema = z
  .object({
    question_id: z.string(),
    bounded_action: z.string().optional(),
  })
  .strict();
export type SetResearchFocusInput = z.infer<typeof SetResearchFocusInputSchema>;

export interface ISetResearchFocusTool extends AgentTool<SetResearchFocusInput> {
  readonly _serviceBrand: undefined;
}
export const ISetResearchFocusTool =
  createDecorator<ISetResearchFocusTool>('setResearchFocusTool');

// ── SetResearchPhase ──────────────────────────────────────────────────────

export const SetResearchPhaseInputSchema = z
  .object({
    phase: z.enum([
      'idle', 'orienting', 'gap_analysis', 'action_planned', 'action_executing',
      'evaluating', 'state_updated', 'checkpoint_pending', 'awaiting_human',
    ]),
    reason: z.string().min(10).max(2000),
  })
  .strict();
export type SetResearchPhaseInput = z.infer<typeof SetResearchPhaseInputSchema>;

export interface ISetResearchPhaseTool extends AgentTool<SetResearchPhaseInput> {
  readonly _serviceBrand: undefined;
}
export const ISetResearchPhaseTool =
  createDecorator<ISetResearchPhaseTool>('setResearchPhaseTool');

// ── ProposeResearchCheckpoint ────────────────────────────────────────────

export const ProposeResearchCheckpointInputSchema = z
  .object({
    question_id: z.string().optional(),
    line_slug: z.string().optional(),
    assessment: z.string().optional(),
    next_action: z.string().optional(),
  })
  .strict();
export type ProposeResearchCheckpointInput = z.infer<typeof ProposeResearchCheckpointInputSchema>;

export interface IProposeResearchCheckpointTool
  extends AgentTool<ProposeResearchCheckpointInput> {
  readonly _serviceBrand: undefined;
}
export const IProposeResearchCheckpointTool =
  createDecorator<IProposeResearchCheckpointTool>('proposeResearchCheckpointTool');

// ── CommitResearchCheckpoint ─────────────────────────────────────────────

export const CommitResearchCheckpointInputSchema = z
  .object({
    checkpoint_id: z.string(),
    entry_id: z.string(),
  })
  .strict();
export type CommitResearchCheckpointInput = z.infer<typeof CommitResearchCheckpointInputSchema>;

export interface ICommitResearchCheckpointTool
  extends AgentTool<CommitResearchCheckpointInput> {
  readonly _serviceBrand: undefined;
}
export const ICommitResearchCheckpointTool =
  createDecorator<ICommitResearchCheckpointTool>('commitResearchCheckpointTool');

// ── PlanResearchAction ───────────────────────────────────────────────────

export const PlanResearchActionInputSchema = z
  .object({
    kind: z.enum(['experiment', 'derivation', 'literature_review', 'data_analysis', 'simulation', 'other']),
    purpose: z.string().min(10).max(8000),
    question_id: z.string().optional(),
    line_slug: z.string().optional(),
    expected_evidence: z.array(z.string().min(1).max(500)).min(1).max(50),
    stop_condition: z.string().min(1).max(2000),
    allowed_tool_kinds: z.array(z.string().max(100)).max(20).default([]),
    retry_of_entry_id: z.string().optional(),
    planning_level: z.enum(['simple', 'planned']).optional(),
    research_plan_id: z.string().min(1).max(200).optional(),
    research_plan_revision: z.number().int().positive().optional(),
    milestone_id: z.string().min(1).max(200).optional(),
    action_plan_id: z.string().min(1).max(200).optional(),
    action_plan_revision: z.number().int().positive().optional(),
    requires_human_approval: z.boolean().default(false).describe(
      'Outside auto mode, use true only for a genuinely non-delegable human decision. Routine in-scope work, including remote tool execution covered by the active permission mode, must use false; auto mode is fully autonomous and normalizes this field to false.',
    ),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.planning_level !== 'planned') return;
    for (const key of [
      'research_plan_id',
      'research_plan_revision',
      'milestone_id',
      'action_plan_id',
      'action_plan_revision',
    ] as const) {
      if (input[key] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required for a planned action.`,
        });
      }
    }
  });
export type PlanResearchActionInput = z.infer<typeof PlanResearchActionInputSchema>;

export interface IPlanResearchActionTool extends AgentTool<PlanResearchActionInput> {
  readonly _serviceBrand: undefined;
}
export const IPlanResearchActionTool =
  createDecorator<IPlanResearchActionTool>('planResearchActionTool');

// ── BeginResearchAction ──────────────────────────────────────────────────

export const BeginResearchActionInputSchema = PlanResearchActionInputSchema;
export type BeginResearchActionInput = PlanResearchActionInput;

export interface IBeginResearchActionTool extends AgentTool<BeginResearchActionInput> {
  readonly _serviceBrand: undefined;
}
export const IBeginResearchActionTool =
  createDecorator<IBeginResearchActionTool>('beginResearchActionTool');

// ── StartResearchAction ──────────────────────────────────────────────────

export const StartResearchActionInputSchema = z
  .object({
    action_id: z.string().min(1).max(200),
  })
  .strict();
export type StartResearchActionInput = z.infer<typeof StartResearchActionInputSchema>;

export interface IStartResearchActionTool extends AgentTool<StartResearchActionInput> {
  readonly _serviceBrand: undefined;
}
export const IStartResearchActionTool =
  createDecorator<IStartResearchActionTool>('startResearchActionTool');

// ── CompleteResearchAction ───────────────────────────────────────────────

export const CompleteResearchActionInputSchema = z
  .object({
    action_id: z.string().min(1).max(200),
    status: z.enum(['completed', 'abandoned']),
  })
  .strict();
export type CompleteResearchActionInput = z.infer<typeof CompleteResearchActionInputSchema>;

export interface ICompleteResearchActionTool extends AgentTool<CompleteResearchActionInput> {
  readonly _serviceBrand: undefined;
}
export const ICompleteResearchActionTool =
  createDecorator<ICompleteResearchActionTool>('completeResearchActionTool');

// ── RecordResearchProgress ───────────────────────────────────────────────

export const RecordResearchProgressInputSchema = z
  .object({
    headline: z.string().min(5).max(2000),
    motivation: z.string().min(5).max(8000),
    work_performed: z.string().min(5).max(8000),
    result: z.string().min(5).max(8000),
    mainline_impact: z.string().min(5).max(8000),
    question: z.string().max(2000).optional(),
    uncertainties: z.array(z.string().max(500)).max(50).default([]),
    next_action: z.string().max(2000).optional(),
    phase_change: z
      .object({
        from: z.enum(['idle', 'orienting', 'gap_analysis', 'action_planned', 'action_executing', 'evaluating', 'state_updated', 'checkpoint_pending', 'awaiting_human']),
        to: z.enum(['idle', 'orienting', 'gap_analysis', 'action_planned', 'action_executing', 'evaluating', 'state_updated', 'checkpoint_pending', 'awaiting_human']),
      })
      .optional(),
    human_decision: z.string().max(2000).optional(),
    detail: z
      .object({
        assumptions: z.array(z.string().max(500)).max(50).optional(),
        derivation: z.string().max(8000).optional(),
        tests: z.array(z.string().max(500)).max(50).optional(),
        observations: z.array(z.string().max(500)).max(50).optional(),
        sources: z.array(z.string().max(500)).max(50).optional(),
        limitations: z.array(z.string().max(500)).max(50).optional(),
        detail_hint: z.string().max(2000).optional(),
        artifact_refs: z.array(z.string().max(500)).max(50).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type RecordResearchProgressInput = z.infer<typeof RecordResearchProgressInputSchema>;

export interface IRecordResearchProgressTool extends AgentTool<RecordResearchProgressInput> {
  readonly _serviceBrand: undefined;
}
export const IRecordResearchProgressTool =
  createDecorator<IRecordResearchProgressTool>('recordResearchProgressTool');

// ── ConcludeResearchAction ────────────────────────────────────────────────

const ResearchDurabilityAssessmentSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('no_durable_delta'),
    rationale: z.string().min(10).max(8000),
  }).strict(),
  z.object({
    status: z.literal('durable_delta'),
    entry_kind: AitpEntryKindSchema,
    authority: AitpAuthoritySchema,
    provenance: ResearchCommitProvenanceSchema,
    rationale: z.string().min(10).max(8000),
  }).strict(),
]);

export const ConcludeResearchActionInputSchema = RecordResearchProgressInputSchema.omit({
  phase_change: true,
  human_decision: true,
}).extend({
  action_id: z.string().min(1).max(200),
  status: z.enum(['completed', 'abandoned']),
  durability: ResearchDurabilityAssessmentSchema,
}).strict();
export type ConcludeResearchActionToolInput = z.infer<typeof ConcludeResearchActionInputSchema>;

export interface IConcludeResearchActionTool extends AgentTool<ConcludeResearchActionToolInput> {
  readonly _serviceBrand: undefined;
}
export const IConcludeResearchActionTool =
  createDecorator<IConcludeResearchActionTool>('concludeResearchActionTool');

// ── ReviewResearchEvidence ───────────────────────────────────────────────

export const ReviewResearchEvidenceInputSchema = z.object({
  packet: ResearchEvidencePacketSchema,
  expected_revision: z.number().int().nonnegative(),
}).strict();
export type ReviewResearchEvidenceInput = z.infer<typeof ReviewResearchEvidenceInputSchema>;

export interface IReviewResearchEvidenceTool extends AgentTool<ReviewResearchEvidenceInput> {
  readonly _serviceBrand: undefined;
}
export const IReviewResearchEvidenceTool =
  createDecorator<IReviewResearchEvidenceTool>('reviewResearchEvidenceTool');

// ── ObserveResearchRun ───────────────────────────────────────────────────

export const ObserveResearchRunInputSchema = z.object({
  action_id: z.string().min(1).max(200),
  expected_revision: z.number().int().nonnegative(),
  campaign: z.string().min(1).max(500),
  job_id: z.string().min(1).max(200),
  source_pin: z.string().max(500).optional(),
  binary_pin: z.string().max(500).optional(),
  stage: z.enum(['queued', 'running', 'scf', 'band', 'analyzing', 'completed', 'failed', 'unknown']),
  scheduler_state: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled', 'unknown']),
  next_check_at: z.number().optional(),
  terminal_state: z.enum(['completed', 'failed', 'cancelled']).optional(),
  artifact_refs: z.array(z.string().max(500)).max(50).default([]),
}).strict();
export type ObserveResearchRunToolInput = z.infer<typeof ObserveResearchRunInputSchema>;

export interface IObserveResearchRunTool extends AgentTool<ObserveResearchRunToolInput> {
  readonly _serviceBrand: undefined;
}
export const IObserveResearchRunTool =
  createDecorator<IObserveResearchRunTool>('observeResearchRunTool');

// ── RequestResearchDecision ──────────────────────────────────────────────

export const RequestResearchDecisionInputSchema = z
  .object({
    kind: z.enum(['approval', 'review', 'decision']).describe(
      'Classify the human input needed when the active permission mode allows questions. Auto mode creates no new Research human gate and requires a reasonable in-scope default instead.',
    ),
    prompt: z.string().min(10).max(8000).describe(
      'Outside auto mode, ask only for a real scientific or protocol decision, never for routine in-scope or remote tool execution.',
    ),
    action_id: z.string().max(200).optional(),
    question_id: z.string().max(200).optional(),
  })
  .strict();
export type RequestResearchDecisionInput = z.infer<typeof RequestResearchDecisionInputSchema>;

export interface IRequestResearchDecisionTool extends AgentTool<RequestResearchDecisionInput> {
  readonly _serviceBrand: undefined;
}
export const IRequestResearchDecisionTool =
  createDecorator<IRequestResearchDecisionTool>('requestResearchDecisionTool');

// ── ResolveResearchDecision ───────────────────────────────────────────────

export const ResolveResearchDecisionInputSchema = z
  .object({
    gate_id: z.string().min(1).max(200),
    resolution: z.string().min(1).max(2000),
    next_phase: z.enum([
      'idle', 'orienting', 'gap_analysis', 'action_planned', 'action_executing',
      'evaluating', 'state_updated', 'checkpoint_pending', 'awaiting_human',
    ]),
  })
  .strict();
export type ResolveResearchDecisionInput = z.infer<typeof ResolveResearchDecisionInputSchema>;

export interface IResolveResearchDecisionTool extends AgentTool<ResolveResearchDecisionInput> {
  readonly _serviceBrand: undefined;
}
export const IResolveResearchDecisionTool =
  createDecorator<IResolveResearchDecisionTool>('resolveResearchDecisionTool');
