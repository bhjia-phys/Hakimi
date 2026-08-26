/**
 * `aitpResearch` domain — Research tool contracts.
 *
 * Defines the input schemas and Agent-scope identifiers for the active-only
 * Research tools, including the seven Research Loop main-agent tools
 * (`PlanResearchAction` / `StartResearchAction` / `CompleteResearchAction` /
 * `RecordResearchProgress` / `RequestResearchDecision` /
 * `SetResearchPhase` / `ResolveResearchDecision`). Inputs are
 * structured and carry zod length constraints. Bound at Agent scope.
 */

import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

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
    expected_evidence: z.array(z.string().max(500)).max(50).default([]),
    stop_condition: z.string().min(1).max(2000),
    allowed_tool_kinds: z.array(z.string().max(100)).max(20).default([]),
    requires_human_approval: z.boolean().default(false),
  })
  .strict();
export type PlanResearchActionInput = z.infer<typeof PlanResearchActionInputSchema>;

export interface IPlanResearchActionTool extends AgentTool<PlanResearchActionInput> {
  readonly _serviceBrand: undefined;
}
export const IPlanResearchActionTool =
  createDecorator<IPlanResearchActionTool>('planResearchActionTool');

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

// ── RequestResearchDecision ──────────────────────────────────────────────

export const RequestResearchDecisionInputSchema = z
  .object({
    kind: z.enum(['approval', 'review', 'decision']),
    prompt: z.string().min(10).max(8000),
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
