/**
 * `aitpResearch` domain — versioned multi-loop Research Plan tool implementations.
 */

import type { ToolExecution } from '#/tool/toolContract';
import { toInputJsonSchema } from '#/tool/input-schema';
import { IAgentResearchService } from '../research/agentResearch';
import { AitpResearchError } from '../errors';
import {
  IActivateResearchPlanV2Tool,
  ICompleteResearchPlanV2Tool,
  IDiscardResearchPlanV2Tool,
  IPrepareResearchPlanV2Tool,
  PrepareResearchPlanV2InputSchema,
  TransitionResearchPlanV2InputSchema,
  type PrepareResearchPlanV2ToolInput,
  type TransitionResearchPlanV2ToolInput,
} from './researchPlanV2Tools';

export class PrepareResearchPlanV2Tool implements IPrepareResearchPlanV2Tool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'PrepareResearchPlanV2' as const;
  readonly description = 'Create or revise the Goal- and Program-bound multi-loop Research Plan. This only prepares a draft.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(PrepareResearchPlanV2InputSchema);

  constructor(@IAgentResearchService private readonly research: IAgentResearchService) {}

  resolveExecution(args: PrepareResearchPlanV2ToolInput): ToolExecution {
    return {
      description: 'Preparing the multi-loop Research Plan',
      approvalRule: this.name,
      execute: async () => {
        try {
          const plan = this.research.prepareResearchPlanV2({
            planId: args.plan_id,
            expectedRevision: args.expected_revision,
            objective: args.objective,
            completionCriterion: args.completion_criterion,
            milestones: args.milestones.map((milestone) => ({
              milestoneId: milestone.milestone_id,
              title: milestone.title,
              objective: milestone.objective,
              completionCriterion: milestone.completion_criterion,
              evidenceRequirements: milestone.evidence_requirements,
            })),
            evidenceRequirements: args.evidence_requirements,
            decisionPoints: args.decision_points.map((decision) => ({
              decisionId: decision.decision_id,
              milestoneId: decision.milestone_id,
              prompt: decision.prompt,
              condition: decision.condition,
            })),
            assumptions: args.assumptions,
            currentMilestoneId: args.current_milestone_id,
            stopConditions: args.stop_conditions,
            replanConditions: args.replan_conditions,
          });
          return { output: `Prepared Research Plan ${plan.planId} revision ${plan.revision} with ${plan.milestones.length} milestone(s). Activate it before binding planned actions.` };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

abstract class TransitionResearchPlanV2Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(TransitionResearchPlanV2InputSchema);

  constructor(protected readonly research: IAgentResearchService) {}

  protected execution(
    args: TransitionResearchPlanV2ToolInput,
    transition: (input: { readonly planId: string; readonly expectedRevision: number }) => { readonly planId: string; readonly revision: number; readonly status: string },
  ): ToolExecution {
    return {
      description: this.description,
      approvalRule: this.name,
      execute: async () => {
        try {
          const plan = transition({
            planId: args.plan_id,
            expectedRevision: args.expected_revision,
          });
          return { output: `Research Plan ${plan.planId} is ${plan.status} at revision ${plan.revision}. This did not close a Question, write AITP, or complete the Goal.` };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class ActivateResearchPlanV2Tool extends TransitionResearchPlanV2Tool implements IActivateResearchPlanV2Tool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'ActivateResearchPlanV2' as const;
  readonly description = 'Activate the current draft multi-loop Research Plan.';

  constructor(@IAgentResearchService research: IAgentResearchService) {
    super(research);
  }

  resolveExecution(args: TransitionResearchPlanV2ToolInput): ToolExecution {
    return this.execution(args, (input) => this.research.activateResearchPlanV2(input));
  }
}

export class CompleteResearchPlanV2Tool extends TransitionResearchPlanV2Tool implements ICompleteResearchPlanV2Tool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'CompleteResearchPlanV2' as const;
  readonly description = 'Mark the active multi-loop Research Plan complete without changing Question, AITP, or Goal state.';

  constructor(@IAgentResearchService research: IAgentResearchService) {
    super(research);
  }

  resolveExecution(args: TransitionResearchPlanV2ToolInput): ToolExecution {
    return this.execution(args, (input) => this.research.completeResearchPlanV2(input));
  }
}

export class DiscardResearchPlanV2Tool extends TransitionResearchPlanV2Tool implements IDiscardResearchPlanV2Tool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'DiscardResearchPlanV2' as const;
  readonly description = 'Discard the current draft or active multi-loop Research Plan.';

  constructor(@IAgentResearchService research: IAgentResearchService) {
    super(research);
  }

  resolveExecution(args: TransitionResearchPlanV2ToolInput): ToolExecution {
    return this.execution(args, (input) => this.research.discardResearchPlanV2(input));
  }
}

function errorResult(message: string) {
  return { isError: true as const, output: message };
}
