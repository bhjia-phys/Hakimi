/**
 * `aitpResearch` domain — versioned multi-loop Research Plan tool contracts.
 *
 * These active-only tools mutate Hakimi-local checkpointed planning state.
 * They do not execute work, write AITP, close Questions, or complete Goals.
 */

import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

const MilestoneSchema = z.object({
  milestone_id: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  objective: z.string().min(1).max(8000),
  completion_criterion: z.string().min(1).max(4000),
  evidence_requirements: z.array(z.string().min(1).max(2000)).max(100),
}).strict();

const DecisionPointSchema = z.object({
  decision_id: z.string().min(1).max(200),
  milestone_id: z.string().min(1).max(200),
  prompt: z.string().min(1).max(4000),
  condition: z.string().min(1).max(4000),
}).strict();

export const PrepareResearchPlanV2InputSchema = z.object({
  plan_id: z.string().min(1).max(200).optional(),
  expected_revision: z.number().int().positive().optional(),
  objective: z.string().min(1).max(8000),
  completion_criterion: z.string().min(1).max(4000).optional(),
  milestones: z.array(MilestoneSchema).min(1).max(100),
  evidence_requirements: z.array(z.string().min(1).max(2000)).max(100),
  decision_points: z.array(DecisionPointSchema).max(100),
  assumptions: z.array(z.string().min(1).max(2000)).max(100),
  current_milestone_id: z.string().min(1).max(200),
  stop_conditions: z.array(z.string().min(1).max(2000)).min(1).max(100),
  replan_conditions: z.array(z.string().min(1).max(2000)).min(1).max(100),
}).strict().superRefine((plan, ctx) => {
  const milestoneIds = new Set<string>();
  for (const milestone of plan.milestones) {
    if (milestoneIds.has(milestone.milestone_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['milestones'],
        message: `Duplicate milestone id: ${milestone.milestone_id}`,
      });
    }
    milestoneIds.add(milestone.milestone_id);
  }
  if (!milestoneIds.has(plan.current_milestone_id)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['current_milestone_id'],
      message: 'Current milestone must reference one declared milestone.',
    });
  }
  const decisionIds = new Set<string>();
  for (const decision of plan.decision_points) {
    if (decisionIds.has(decision.decision_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['decision_points'],
        message: `Duplicate decision id: ${decision.decision_id}`,
      });
    }
    decisionIds.add(decision.decision_id);
    if (!milestoneIds.has(decision.milestone_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['decision_points'],
        message: `Decision ${decision.decision_id} references an unknown milestone.`,
      });
    }
  }
});
export type PrepareResearchPlanV2ToolInput = z.infer<typeof PrepareResearchPlanV2InputSchema>;

export const TransitionResearchPlanV2InputSchema = z.object({
  plan_id: z.string().min(1).max(200),
  expected_revision: z.number().int().positive(),
}).strict();
export type TransitionResearchPlanV2ToolInput = z.infer<typeof TransitionResearchPlanV2InputSchema>;

export interface IPrepareResearchPlanV2Tool extends AgentTool<PrepareResearchPlanV2ToolInput> {
  readonly _serviceBrand: undefined;
}
export const IPrepareResearchPlanV2Tool =
  createDecorator<IPrepareResearchPlanV2Tool>('prepareResearchPlanV2Tool');

export interface IActivateResearchPlanV2Tool extends AgentTool<TransitionResearchPlanV2ToolInput> {
  readonly _serviceBrand: undefined;
}
export const IActivateResearchPlanV2Tool =
  createDecorator<IActivateResearchPlanV2Tool>('activateResearchPlanV2Tool');

export interface ICompleteResearchPlanV2Tool extends AgentTool<TransitionResearchPlanV2ToolInput> {
  readonly _serviceBrand: undefined;
}
export const ICompleteResearchPlanV2Tool =
  createDecorator<ICompleteResearchPlanV2Tool>('completeResearchPlanV2Tool');

export interface IDiscardResearchPlanV2Tool extends AgentTool<TransitionResearchPlanV2ToolInput> {
  readonly _serviceBrand: undefined;
}
export const IDiscardResearchPlanV2Tool =
  createDecorator<IDiscardResearchPlanV2Tool>('discardResearchPlanV2Tool');
