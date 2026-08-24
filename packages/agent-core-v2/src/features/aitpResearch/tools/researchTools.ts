/**
 * `aitpResearch` domain — Research tool contracts.
 *
 * Defines the input schemas and Agent-scope identifiers for the active-only
 * Research tools. Bound at Agent scope.
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
