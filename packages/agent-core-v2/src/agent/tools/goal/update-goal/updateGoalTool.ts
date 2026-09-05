/**
 * `tools` domain — `IUpdateGoalTool` implementation.
 *
 * Updates the current goal's status through the goal service (`goal`); the
 * turn driver reads the status at each turn boundary and stops (`complete` /
 * `blocked`) or keeps going (`active`). Guards against the goal changing or
 * disappearing between resolution and execution, and ends the turn with the
 * completion-summary / blocked-reason prompts (`goal` outcome prompts) on
 * terminal statuses. Registered for the main agent only, mirroring v1's
 * `agent.type === 'main'` gate. Bound at Agent scope.
 */

import { toInputJsonSchema } from '#/tool/input-schema';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { type ToolExecution } from '#/tool/toolContract';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';

import { IAgentGoalService } from '#/agent/goal/goal';
import {
  buildGoalBlockedReasonPrompt,
  buildGoalCompletionSummaryPrompt,
} from '#/agent/goal/tools/outcome-prompts';

import DESCRIPTION from './update-goal.md?raw';
import {
  UpdateGoalToolInputSchema,
  IUpdateGoalTool,
  type UpdateGoalToolInput,
} from './update-goal';

export class UpdateGoalTool implements IUpdateGoalTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'UpdateGoal' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(UpdateGoalToolInputSchema);

  constructor(@IAgentGoalService private readonly goal: IAgentGoalService) {}

  resolveExecution(args: UpdateGoalToolInput): ToolExecution {
    if (!isUpdateGoalStatus(args.status)) {
      return {
        isError: true,
        output: 'Invalid goal status. Use `active`, `complete`, or `blocked`.',
      };
    }
    if (args.waitFor !== undefined && args.status !== 'active') {
      return {
        isError: true,
        output: 'Goal wait requires status `active`.',
      };
    }

    const status = args.status;
    const currentGoal = this.goal.getGoal().goal;
    const goalIsActive = currentGoal?.status === 'active';

    return {
      description: args.waitFor === undefined
        ? `Setting goal status: ${status}`
        : `Waiting for background task${args.waitFor.taskIds.length === 1 ? '' : 's'} before continuing the goal`,
      stopBatchAfterThis: args.waitFor !== undefined || (status !== 'active' && goalIsActive),
      approvalRule: this.name,
      execute: async ({ turnId }) => {
        const goalAtExecution = this.goal.getGoal().goal;
        if (goalAtExecution === null || (currentGoal === null && status === 'active')) {
          return { output: missingGoalOutput(status) };
        }
        if (
          goalAtExecution.goalId !== currentGoal?.goalId &&
          !this.goal.isGoalToolTarget(turnId, goalAtExecution.goalId)
        ) {
          return { output: changedGoalOutput(status) };
        }
        if (args.waitFor !== undefined) {
          const waiting = await this.goal.waitForTasks({
            taskIds: args.waitFor.taskIds,
            policy: args.waitFor.policy,
          }, 'model');
          if (waiting.waitingFor === undefined) {
            return { output: 'Goal wait skipped: the selected tasks are already complete.' };
          }
          return {
            output: `Goal suspended until ${args.waitFor.policy === 'all' ? 'all' : 'any'} selected background task${args.waitFor.taskIds.length === 1 ? '' : 's'} reaches a terminal state.`,
            stopTurn: true,
          };
        }
        if (status === 'active') {
          const resumed = await this.goal.resumeGoal({}, 'model');
          if (resumed.status !== 'active') {
            const reason = resumed.budget.overBudget
              ? 'the goal budget is exhausted.'
              : resumed.terminalReason ?? resumed.status;
            return {
              isError: true,
              output: `Goal not resumed: ${reason}`,
            };
          }
          return { output: 'Goal resumed.' };
        }
        if (status === 'complete') {
          const completed = await this.goal.markComplete({}, 'model');
          if (completed === null) {
            return { output: 'Goal not completed: no active goal.' };
          }
          return { output: buildGoalCompletionSummaryPrompt(completed), stopTurn: true };
        }
        if (status === 'blocked') {
          const blocked = await this.goal.markBlocked({}, 'model');
          if (blocked === null) {
            return { output: 'Goal not blocked: no active goal.' };
          }
          return { output: buildGoalBlockedReasonPrompt(blocked), stopTurn: true };
        }
        return {
          isError: true,
          output: 'Invalid goal status. Use `active`, `complete`, or `blocked`.',
        };
      },
    };
  }
}

function isUpdateGoalStatus(status: unknown): status is UpdateGoalToolInput['status'] {
  return status === 'active' || status === 'complete' || status === 'blocked';
}

function missingGoalOutput(status: UpdateGoalToolInput['status']): string {
  if (status === 'active') return 'Goal not resumed: no current goal.';
  if (status === 'complete') return 'Goal not completed: no active goal.';
  return 'Goal not blocked: no active goal.';
}

function changedGoalOutput(status: UpdateGoalToolInput['status']): string {
  if (status === 'active') return 'Goal not resumed: the current goal changed.';
  if (status === 'complete') return 'Goal not completed: the current goal changed.';
  return 'Goal not blocked: the current goal changed.';
}

registerAgentToolService(IUpdateGoalTool, UpdateGoalTool, {
  name: 'UpdateGoal',
  domain: 'goal',
  when: (accessor) => accessor.get(IAgentScopeContext).agentId === 'main',
});
