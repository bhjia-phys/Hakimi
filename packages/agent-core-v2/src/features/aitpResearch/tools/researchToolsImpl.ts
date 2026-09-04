/**
 * `aitpResearch` domain — Research tool implementations.
 *
 * Each tool delegates to `IAgentResearchService` (and `IAgentAitpModeService`
 * for the mode gate). Active-only: the `when` predicate in the Feature
 * contribution checks `mode.isActive`. Normal bounded work uses
 * `BeginResearchAction` and `ConcludeResearchAction`; atomic operations kept in
 * this module support approval recovery and maintenance. Research outputs lead
 * with what was done, the result, the mainline impact, and the next step rather
 * than raw ids or revisions. Successful first-time checkpoint commits hand one
 * touched Entry to the external distillation Skill through the stateless
 * `aitpResearch` handoff capability. Bound at Agent scope.
 */

import type { ToolExecution } from '#/tool/toolContract';
import { toInputJsonSchema } from '#/tool/input-schema';
import { IAgentPermissionModeService } from '#/agent/permissionMode/permissionMode';
import { IAgentResearchService } from '#/features/aitpResearch/research/agentResearch';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { AitpResearchError } from '#/features/aitpResearch/errors';
import { IAitpDistillationHandoffService } from '#/features/aitpResearch/research/distillationHandoff';

import {
  ICommitResearchCheckpointTool,
  IConfirmResearchWorkstreamBindingTool,
  IClearResearchWorkstreamBindingTool,
  ICompleteResearchActionTool,
  IConcludeResearchActionTool,
  ICreateResearchLineTool,
  ICreateResearchQuestionTool,
  IGetResearchStatusTool,
  IAcknowledgeResearchAlertTool,
  IPlanResearchActionTool,
  IBeginResearchActionTool,
  IProposeResearchCheckpointTool,
  IDiscardHistoricalResearchCheckpointTool,
  IRecordResearchProgressTool,
  IReviewResearchEvidenceTool,
  ReviewResearchEvidenceInputSchema,
  type ReviewResearchEvidenceInput,
  IObserveResearchRunTool,
  ObserveResearchRunInputSchema,
  type ObserveResearchRunToolInput,
  IRequestResearchDecisionTool,
  IResolveResearchDecisionTool,
  ISetResearchFocusTool,
  ISetResearchPhaseTool,
  IStartResearchActionTool,
  IUpdateResearchLineTool,
  IUpdateResearchQuestionTool,
  CommitResearchCheckpointInputSchema,
  ConfirmResearchWorkstreamBindingInputSchema,
  ClearResearchWorkstreamBindingInputSchema,
  CompleteResearchActionInputSchema,
  ConcludeResearchActionInputSchema,
  CreateResearchLineInputSchema,
  CreateResearchQuestionInputSchema,
  GetResearchStatusInputSchema,
  AcknowledgeResearchAlertInputSchema,
  PlanResearchActionInputSchema,
  BeginResearchActionInputSchema,
  ProposeResearchCheckpointInputSchema,
  DiscardHistoricalResearchCheckpointInputSchema,
  RecordResearchProgressInputSchema,
  RequestResearchDecisionInputSchema,
  ResolveResearchDecisionInputSchema,
  SetResearchFocusInputSchema,
  SetResearchPhaseInputSchema,
  StartResearchActionInputSchema,
  UpdateResearchLineInputSchema,
  UpdateResearchQuestionInputSchema,
  type CommitResearchCheckpointInput,
  type ConfirmResearchWorkstreamBindingInput,
  type ClearResearchWorkstreamBindingInput,
  type CompleteResearchActionInput,
  type ConcludeResearchActionToolInput,
  type CreateResearchLineInput,
  type CreateResearchQuestionInput,
  type GetResearchStatusInput,
  type AcknowledgeResearchAlertInput,
  type PlanResearchActionInput,
  type BeginResearchActionInput,
  type ProposeResearchCheckpointInput,
  type DiscardHistoricalResearchCheckpointInput,
  type RecordResearchProgressInput,
  type RequestResearchDecisionInput,
  type ResolveResearchDecisionInput,
  type SetResearchFocusInput,
  type SetResearchPhaseInput,
  type StartResearchActionInput,
  type UpdateResearchLineInput,
  type UpdateResearchQuestionInput,
} from './researchTools';

function requireActive(mode: IAgentAitpModeService): string | undefined {
  if (!mode.isActive) {
    return 'AITP Research Mode is not active. Call EnterAITPMode first.';
  }
  return undefined;
}

function errorResult(message: string) {
  return { isError: true as const, output: message };
}

function useAutoStandingApproval(
  permissionMode: IAgentPermissionModeService | undefined,
  requested: boolean,
): boolean {
  return permissionMode?.mode === 'auto' ? false : requested;
}

function nextStepMeaning(phase: SetResearchPhaseInput['phase']): string {
  switch (phase) {
    case 'idle':
      return 'Begin orientation when a research question or result needs attention.';
    case 'orienting':
      return 'Clarify the current question and identify the evidence gap.';
    case 'gap_analysis':
      return 'Plan one bounded action with expected evidence and a stop condition.';
    case 'action_planned':
      return 'Obtain any required human approval, then start the planned action.';
    case 'action_executing':
      return 'Perform the bounded work and stop at the declared condition.';
    case 'evaluating':
      return 'Assess the result against the expected evidence before updating state.';
    case 'state_updated':
      return 'Record the durable implication and prepare a checkpoint if warranted.';
    case 'checkpoint_pending':
      return 'Persist and verify the scientific result, then commit the checkpoint.';
    case 'awaiting_human':
      return 'Wait for the human decision; do not treat the gate as resolved automatically.';
  }
}

export class GetResearchStatusTool implements IGetResearchStatusTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'GetResearchStatus' as const;
  readonly description = 'Get the current AITP Research Mode status snapshot.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(GetResearchStatusInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(_args: GetResearchStatusInput): ToolExecution {
    return {
      description: 'Getting research status',
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        const snapshot = this.research.getSnapshot();
        return { output: JSON.stringify(snapshot, null, 2) };
      },
    };
  }
}

export class AcknowledgeResearchAlertTool implements IAcknowledgeResearchAlertTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'AcknowledgeResearchAlert' as const;
  readonly description = 'Acknowledge a Research lifecycle alert without changing the underlying research state.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(AcknowledgeResearchAlertInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: AcknowledgeResearchAlertInput): ToolExecution {
    return {
      description: 'Acknowledging a Research lifecycle alert',
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        const alert = this.research.getSnapshot().alerts.find((item) => item.fingerprint === args.fingerprint);
        this.research.acknowledgeAlert(args.fingerprint);
        if (alert === undefined) {
          return { output: 'No matching Research alert was found; it may already be cleared.' };
        }
        const target = alert.questionId === undefined
          ? alert.lineSlug === undefined ? 'the Research lifecycle' : `line ${alert.lineSlug}`
          : `question ${alert.questionId}`;
        return { output: `Acknowledged the ${alert.kind} alert for ${target}: ${alert.message}` };
      },
    };
  }
}

export class CreateResearchLineTool implements ICreateResearchLineTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'CreateResearchLine' as const;
  readonly description = 'Create a new research line for a distinct research objective.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(CreateResearchLineInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: CreateResearchLineInput): ToolExecution {
    return {
      description: `Creating research line: ${args.title.slice(0, 60)}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const line = this.research.createLine({
            slug: args.line_slug,
            title: args.title,
            objective: args.objective,
            assessment: args.assessment,
          });
          return { output: `Created research line ${line.slug} (revision ${line.revision}).` };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class CreateResearchQuestionTool implements ICreateResearchQuestionTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'CreateResearchQuestion' as const;
  readonly description = 'Create a new research question in a research line.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(CreateResearchQuestionInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: CreateResearchQuestionInput): ToolExecution {
    return {
      description: `Creating research question: ${args.wording.slice(0, 60)}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        const question = this.research.createQuestion({
          lineSlug: args.line_slug,
          wording: args.wording,
          assessment: args.assessment,
          priority: args.priority,
          neededEvidence: args.needed_evidence,
        });
        return { output: `Created question ${question.id} (revision ${question.revision}).` };
      },
    };
  }
}

export class UpdateResearchLineTool implements IUpdateResearchLineTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'UpdateResearchLine' as const;
  readonly description = 'Update a research line title, objective, status, or assessment.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(UpdateResearchLineInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: UpdateResearchLineInput): ToolExecution {
    return {
      description: `Updating research line ${args.line_slug}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const line = this.research.updateLine({
            slug: args.line_slug,
            expectedRevision: args.expected_revision,
            title: args.title,
            objective: args.objective,
            status: args.status,
            assessment: args.assessment,
            reason: args.reason,
          });
          return { output: `Updated research line ${line.slug} to revision ${line.revision}.` };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class ConfirmResearchWorkstreamBindingTool
  implements IConfirmResearchWorkstreamBindingTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'ConfirmResearchWorkstreamBinding' as const;
  readonly description = 'Explicitly confirm that one local Research Line uses one AITP workstream in the currently observed Topic. Never infer this mapping from matching slugs, paths, or IDs.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(
    ConfirmResearchWorkstreamBindingInputSchema,
  );

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: ConfirmResearchWorkstreamBindingInput): ToolExecution {
    return {
      description: `Confirming explicit AITP workstream binding for ${args.line_slug}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const binding = await this.research.confirmLineWorkstreamBinding({
            lineSlug: args.line_slug,
            workstream: args.workstream,
            expectedRevision: args.expected_revision,
            confirmedBy: 'main_agent',
          });
          return {
            output: `Confirmed Research Line ${binding.lineSlug} → AITP workstream ${binding.workstream} for Topic ${binding.topicId} revision ${binding.observedRevision}.`,
          };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class ClearResearchWorkstreamBindingTool
  implements IClearResearchWorkstreamBindingTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'ClearResearchWorkstreamBinding' as const;
  readonly description = 'Clear one explicit local Line-to-workstream confirmation before a deliberate rebind. This never edits AITP.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(
    ClearResearchWorkstreamBindingInputSchema,
  );

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: ClearResearchWorkstreamBindingInput): ToolExecution {
    return {
      description: `Clearing AITP workstream binding for ${args.line_slug}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          this.research.clearLineWorkstreamBinding({
            lineSlug: args.line_slug,
            expectedRevision: args.expected_revision,
            expectedConfirmationId: args.expected_confirmation_id,
          });
          return { output: `Cleared the explicit AITP workstream binding for Research Line ${args.line_slug}.` };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class UpdateResearchQuestionTool implements IUpdateResearchQuestionTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'UpdateResearchQuestion' as const;
  readonly description = 'Update a research question (wording, priority, workflow, epistemic, etc.).';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(UpdateResearchQuestionInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: UpdateResearchQuestionInput): ToolExecution {
    return {
      description: `Updating research question ${args.question_id}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const question = this.research.updateQuestion({
            questionId: args.question_id,
            expectedRevision: args.expected_revision,
            wording: args.wording,
            assessment: args.assessment,
            priority: args.priority,
            workflow: args.workflow,
            epistemic: args.epistemic,
            neededEvidence: args.needed_evidence,
            nextBoundedAction: args.next_bounded_action,
            evidenceRefs: args.evidence_refs,
            reason: args.reason,
          });
          return { output: `Updated question ${question.id} to revision ${question.revision}.` };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class SetResearchFocusTool implements ISetResearchFocusTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'SetResearchFocus' as const;
  readonly description = 'Set the current research focus to a question with an optional bounded action.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(SetResearchFocusInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: SetResearchFocusInput): ToolExecution {
    return {
      description: `Setting research focus to ${args.question_id}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        this.research.setFocus(args.question_id, args.bounded_action);
        return { output: `Focus set to question ${args.question_id}.` };
      },
    };
  }
}

export class SetResearchPhaseTool implements ISetResearchPhaseTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'SetResearchPhase' as const;
  readonly description = 'Set the Research Loop phase with a scientific reason and explicit next-step significance.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(SetResearchPhaseInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: SetResearchPhaseInput): ToolExecution {
    return {
      description: `Setting research phase to ${args.phase}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const change = this.research.setPhase(args.phase, args.reason);
          return {
            output: [
              `Research phase changed from ${change.beforePhase} to ${change.afterPhase}.`,
              `Reason: ${change.summary}`,
              `Next step significance: ${nextStepMeaning(change.afterPhase)}`,
            ].join('\n'),
          };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class ProposeResearchCheckpointTool implements IProposeResearchCheckpointTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'ProposeResearchCheckpoint' as const;
  readonly description = 'Propose a pending research checkpoint at a durable boundary.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(ProposeResearchCheckpointInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: ProposeResearchCheckpointInput): ToolExecution {
    return {
      description: 'Proposing research checkpoint',
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        const checkpoint = this.research.proposeCheckpoint({
          expectedRevision: 0,
          questionId: args.question_id,
          lineSlug: args.line_slug,
          assessment: args.assessment,
          nextAction: args.next_action,
        });
        return {
          output: `Proposed checkpoint ${checkpoint.checkpointId}. Pass checkpoint_id=${checkpoint.checkpointId} to aitp_record_prepare and aitp_record_save, fill and save the draft, then call CommitResearchCheckpoint with the saved Entry ID.`,
        };
      },
    };
  }
}

export class DiscardHistoricalResearchCheckpointTool
  implements IDiscardHistoricalResearchCheckpointTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'DiscardHistoricalResearchCheckpoint' as const;
  readonly description = 'Discard an uncommitted checkpoint proposal only when its captured Question, Line-to-workstream binding, or Program context is provably superseded and it has no AITP receipt or committed evidence.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(
    DiscardHistoricalResearchCheckpointInputSchema,
  );

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: DiscardHistoricalResearchCheckpointInput): ToolExecution {
    return {
      description: `Discarding historical checkpoint ${args.checkpoint_id}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const discarded = this.research.discardHistoricalCheckpoint({
            checkpointId: args.checkpoint_id,
            expectedRevision: args.expected_revision,
          });
          return {
            output: `Discarded historical checkpoint proposal ${discarded.checkpointId}. No AITP canonical record was written or removed.`,
          };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class CommitResearchCheckpointTool implements ICommitResearchCheckpointTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'CommitResearchCheckpoint' as const;
  readonly description = 'Commit a pending research checkpoint after the AITP entry is saved and verified.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(CommitResearchCheckpointInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
    @IAitpDistillationHandoffService
    private readonly distillation?: IAitpDistillationHandoffService,
  ) {}

  resolveExecution(args: CommitResearchCheckpointInput): ToolExecution {
    return {
      description: `Committing checkpoint ${args.checkpoint_id}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const committed = await this.research.commitCheckpoint({
            checkpointId: args.checkpoint_id,
            entryId: args.entry_id,
          });
          if (committed.status === 'already_committed') {
            return {
              output: `Checkpoint ${args.checkpoint_id} was already committed. Distillation handoff: no-op for this duplicate commit.`,
            };
          }
          if (this.distillation === undefined) {
            return {
              output: `Checkpoint ${args.checkpoint_id} committed. Distillation handoff: unavailable and non-blocking.`,
            };
          }
          const handoff = await this.distillation.prepare({
            checkpointId: args.checkpoint_id,
            entryId: args.entry_id,
          });
          if (handoff.status === 'unavailable') {
            return {
              output: `Checkpoint ${args.checkpoint_id} committed. Distillation handoff: unavailable and non-blocking. ${handoff.reason}`,
            };
          }
          return {
            output: `Checkpoint ${args.checkpoint_id} committed. Distillation handoff: one bounded review scheduled for touched Entry ${args.entry_id}; the external Skill may no-op when its trigger does not hold.`,
            delivery: handoff.delivery,
          };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class PlanResearchActionTool implements IPlanResearchActionTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'PlanResearchAction' as const;
  readonly description = 'Plan a bounded research action (experiment, derivation, etc.) with a stop condition and expected evidence.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(PlanResearchActionInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
    @IAgentPermissionModeService private readonly permissionMode?: IAgentPermissionModeService,
  ) {}

  resolveExecution(args: PlanResearchActionInput): ToolExecution {
    return {
      description: `Planning research action: ${args.kind}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const action = this.research.planAction({
            kind: args.kind,
            purpose: args.purpose,
            questionId: args.question_id,
            lineSlug: args.line_slug,
            expectedEvidence: args.expected_evidence,
            stopCondition: args.stop_condition,
            allowedToolKinds: args.allowed_tool_kinds,
            retryOfEntryId: args.retry_of_entry_id,
            planningLevel: args.planning_level ?? 'simple',
            researchPlanId: args.research_plan_id,
            researchPlanRevision: args.research_plan_revision,
            milestoneId: args.milestone_id,
            actionPlanId: args.action_plan_id,
            actionPlanRevision: args.action_plan_revision,
            requiresHumanApproval: useAutoStandingApproval(
              this.permissionMode,
              args.requires_human_approval,
            ),
          });
          const lines: string[] = [
            `Planned ${action.kind} action.`,
            `Action ID: ${action.actionId}`,
            `Purpose: ${action.purpose}`,
            `Stop condition: ${action.stopCondition}`,
          ];
          if (action.expectedEvidence.length > 0) {
            lines.push(`Expected evidence: ${action.expectedEvidence.join(', ')}`);
          }
          if (action.requiresHumanApproval) {
            lines.push('⚠ This action requires human approval before execution.');
          }
          lines.push(`Mainline impact: research phase advanced to ${this.research.getSnapshot().phase}.`);
          lines.push('Next step: call StartResearchAction when ready to execute.');
          return { output: lines.join('\n') };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class BeginResearchActionTool implements IBeginResearchActionTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'BeginResearchAction' as const;
  readonly description = 'Plan and begin one bounded research action atomically. Routine execution approval follows the active permission mode; use RequestResearchDecision separately for a non-delegable scientific or protocol choice.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(BeginResearchActionInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
    @IAgentPermissionModeService private readonly permissionMode?: IAgentPermissionModeService,
  ) {}

  resolveExecution(args: BeginResearchActionInput): ToolExecution {
    return {
      description: `Beginning research action: ${args.kind}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const action = this.research.planAndStartAction({
            kind: args.kind,
            purpose: args.purpose,
            questionId: args.question_id,
            lineSlug: args.line_slug,
            expectedEvidence: args.expected_evidence,
            stopCondition: args.stop_condition,
            allowedToolKinds: args.allowed_tool_kinds,
            retryOfEntryId: args.retry_of_entry_id,
            planningLevel: args.planning_level ?? 'simple',
            researchPlanId: args.research_plan_id,
            researchPlanRevision: args.research_plan_revision,
            milestoneId: args.milestone_id,
            actionPlanId: args.action_plan_id,
            actionPlanRevision: args.action_plan_revision,
            requiresHumanApproval: useAutoStandingApproval(
              this.permissionMode,
              args.requires_human_approval,
            ),
          });
          const snapshot = this.research.getSnapshot();
          const lines: string[] = [
            action.status === 'in_progress'
              ? `Started ${action.kind} action.`
              : `Planned ${action.kind} action; execution is waiting for approval.`,
            `Action ID: ${action.actionId}`,
            `Purpose: ${action.purpose}`,
            `Phase: ${snapshot.phase}.`,
          ];
          if (action.requiresHumanApproval) {
            lines.push('Human approval is required before execution; no scientific work has been marked as started.');
          } else {
            lines.push('Mainline impact: the bounded action is now the active research step.');
            lines.push('Before executing a potentially reusable procedure, follow the using-aitp Skill to retrieve applicable Method cards by their generic marker and inspect their pinned basis.');
            lines.push('Next step: perform the planned work and collect the expected evidence.');
          }
          return { output: lines.join('\n') };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class StartResearchActionTool implements IStartResearchActionTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'StartResearchAction' as const;
  readonly description = 'Mark a planned research action as in-progress and enter the executing phase.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(StartResearchActionInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: StartResearchActionInput): ToolExecution {
    return {
      description: `Starting research action ${args.action_id}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          this.research.startAction(args.action_id);
          const snapshot = this.research.getSnapshot();
          const action = snapshot.currentAction;
          const lines: string[] = [
            `Started action: ${args.action_id}.`,
            `Phase: ${snapshot.phase}.`,
          ];
          if (action !== undefined) {
            lines.push(`Purpose: ${action.purpose}`);
            lines.push(`Stop condition: ${action.stopCondition}`);
          }
          lines.push('Mainline impact: the research loop is now in the executing phase.');
          lines.push('Next step: perform the planned work, then call ConcludeResearchAction with the physical result and mainline impact.');
          return { output: lines.join('\n') };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class CompleteResearchActionTool implements ICompleteResearchActionTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'CompleteResearchAction' as const;
  readonly description = 'Complete or abandon an in-progress research action, transitioning to the evaluating phase.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(CompleteResearchActionInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: CompleteResearchActionInput): ToolExecution {
    return {
      description: `Completing research action ${args.action_id} (${args.status})`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          this.research.completeAction(args.action_id, args.status);
          const snapshot = this.research.getSnapshot();
          const lines: string[] = [
            `Action ${args.action_id} marked as ${args.status}.`,
            `Phase: ${snapshot.phase}.`,
          ];
          if (args.status === 'completed') {
            lines.push('Mainline impact: the action is complete; evaluate results before updating state.');
            lines.push('Next step: call RecordResearchProgress with what was done, the result, and the mainline impact.');
          } else {
            lines.push('Mainline impact: the action was abandoned; assess whether to replan or adjust the research direction.');
            lines.push('Next step: call RecordResearchProgress to document what was learned, then replan if needed.');
          }
          return { output: lines.join('\n') };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class ConcludeResearchActionTool implements IConcludeResearchActionTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'ConcludeResearchAction' as const;
  readonly description = 'Conclude one bounded research action, record its scientific impact once, and assess whether it produced a durable delta. A durable assessment emits one pending AITP commit candidate; no durable delta performs no AITP action.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(ConcludeResearchActionInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: ConcludeResearchActionToolInput): ToolExecution {
    return {
      description: `Concluding research action: ${args.status}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const conclusion = this.research.concludeAction({
            actionId: args.action_id,
            status: args.status,
            progress: {
              headline: args.headline,
              question: args.question,
              motivation: args.motivation,
              workPerformed: args.work_performed,
              result: args.result,
              mainlineImpact: args.mainline_impact,
              uncertainties: args.uncertainties,
              nextAction: args.next_action,
              detail: args.detail === undefined ? undefined : {
                assumptions: args.detail.assumptions,
                derivation: args.detail.derivation,
                tests: args.detail.tests,
                observations: args.detail.observations,
                sources: args.detail.sources,
                limitations: args.detail.limitations,
                detailHint: args.detail.detail_hint,
                artifactRefs: args.detail.artifact_refs,
              },
            },
            durability: args.durability.status === 'no_durable_delta'
              ? {
                  status: 'no_durable_delta',
                  rationale: args.durability.rationale,
                }
              : {
                  status: 'durable_delta',
                  entryKind: args.durability.entry_kind,
                  authority: args.durability.authority,
                  provenance: args.durability.provenance,
                  rationale: args.durability.rationale,
                },
          });
          const progress = conclusion.progress;
          const lines: string[] = [
            `Scientific work: ${progress.workPerformed}`,
            `Result: ${progress.result}`,
            `Mainline impact: ${progress.mainlineImpact}`,
          ];
          if (progress.detail?.tests !== undefined && progress.detail.tests.length > 0) {
            lines.push(`Tests: ${progress.detail.tests.join('; ')}`);
          }
          if (progress.detail?.derivation !== undefined) {
            lines.push(`Derivation: ${progress.detail.derivation}`);
          }
          if (progress.detail?.observations !== undefined && progress.detail.observations.length > 0) {
            lines.push(`Observations: ${progress.detail.observations.join('; ')}`);
          }
          if (progress.detail?.limitations !== undefined && progress.detail.limitations.length > 0) {
            lines.push(`Limitations: ${progress.detail.limitations.join('; ')}`);
          }
          if (progress.uncertainties.length > 0) {
            lines.push(`Uncertainties: ${progress.uncertainties.join('; ')}`);
          }
          if (progress.nextAction !== undefined) lines.push(`Next step: ${progress.nextAction}`);
          lines.push(`Action ${conclusion.action.actionId} is ${conclusion.action.status}; Research phase is state_updated.`);
          lines.push('Assessment and epistemic state were not changed automatically; update the Research question only if the scientific interpretation changed.');
          const candidate = conclusion.commitCandidate;
          if (candidate === undefined) {
            lines.push(`Durability: no durable delta (${args.durability.rationale}).`);
            lines.push('AITP action: none. Do not call AITP persistence or method-card review for this conclusion.');
          } else {
            const checkpoint = this.research.getPendingCheckpoint();
            const workstream = checkpoint?.workstreamBinding?.workstream;
            lines.push(`Durability: assessed durable candidate (${candidate.rationale}).`);
            lines.push(`Pending checkpoint: ${checkpoint?.checkpointId ?? 'unavailable'}.`);
            lines.push(
              `Continue in this turn when possible: call aitp_record_prepare with kind=${candidate.entryKind}, authority=${candidate.authority}, ${candidate.authority === 'agent' ? 'created_by=agent:main, ' : ''}workstreams=[${workstream ?? 'captured-workstream'}], checkpoint_id=${checkpoint?.checkpointId ?? 'pending-checkpoint'}; fill the draft with the assessed evidence; call aitp_record_save with the same checkpoint_id; then call CommitResearchCheckpoint with the saved Entry ID.`,
            );
            lines.push('If this Entry records potentially reusable execution evidence, load and follow the external distilling-methods Skill before filling it; that Skill alone decides whether the Entry exact-pins a retrieved card or carries an observation marker.');
            lines.push('Do not call RecordResearchProgress again for this conclusion. Keep human assertions or decisions in a separate human-authority Entry from agent/tool/source verification.');
          }
          return { output: lines.join('\n') };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class RecordResearchProgressTool implements IRecordResearchProgressTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'RecordResearchProgress' as const;
  readonly description = 'Record a structured scientific progress report: what was done, the result, mainline impact, and next step.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(RecordResearchProgressInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: RecordResearchProgressInput): ToolExecution {
    return {
      description: `Recording progress: ${args.headline.slice(0, 60)}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const report = this.research.recordProgress({
            headline: args.headline,
            motivation: args.motivation,
            workPerformed: args.work_performed,
            result: args.result,
            mainlineImpact: args.mainline_impact,
            question: args.question,
            uncertainties: args.uncertainties,
            nextAction: args.next_action,
            phaseChange: args.phase_change,
            humanDecision: args.human_decision,
            detail: args.detail === undefined ? undefined : {
              assumptions: args.detail.assumptions,
              derivation: args.detail.derivation,
              tests: args.detail.tests,
              observations: args.detail.observations,
              sources: args.detail.sources,
              limitations: args.detail.limitations,
              detailHint: args.detail.detail_hint,
              artifactRefs: args.detail.artifact_refs,
            },
          });
          const snapshot = this.research.getSnapshot();
          const lines: string[] = [
            `Recorded progress: ${report.headline}`,
            `Result: ${report.result}`,
            `Mainline impact: ${report.mainlineImpact}`,
          ];
          if (report.uncertainties.length > 0) {
            lines.push(`Uncertainties: ${report.uncertainties.join('; ')}`);
          }
          if (report.nextAction !== undefined) {
            lines.push(`Next step: ${report.nextAction}`);
          }
          lines.push(`Phase: ${snapshot.phase}.`);
          return { output: lines.join('\n') };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class ReviewResearchEvidenceTool implements IReviewResearchEvidenceTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'ReviewResearchEvidence' as const;
  readonly description = 'Validate one typed subagent evidence packet against the current Research revision without changing scientific state.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(ReviewResearchEvidenceInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: ReviewResearchEvidenceInput): ToolExecution {
    return {
      description: `Reviewing ${args.packet.kind} evidence packet`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const review = this.research.reviewEvidencePacket(
            args.packet,
            args.expected_revision,
          );
          const target = review.questionId === undefined
            ? review.lineSlug === undefined ? 'the current Research state' : `line ${review.lineSlug}`
            : `question ${review.questionId}`;
          return {
            output: [
              `Evidence packet ${review.packet.packet_id} reviewed for ${target}.`,
              `Claim: ${review.packet.claim}`,
              `Evidence: ${review.packet.evidence}`,
              `Confidence: ${review.packet.confidence}.`,
              'No assessment, epistemic state, or AITP record was changed.',
              'Main-agent synthesis required: interpret the evidence. For a live action, use ConcludeResearchAction once; do not duplicate an existing conclusion through RecordResearchProgress.',
              `Research revision remains ${review.researchRevision}.`,
            ].join('\n'),
          };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class ObserveResearchRunTool implements IObserveResearchRunTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'ObserveResearchRun' as const;
  readonly description = 'Record a read-only observation of an external HPC or scheduler run. This does not submit, poll, or claim scientific success.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(ObserveResearchRunInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: ObserveResearchRunToolInput): ToolExecution {
    return {
      description: `Recording run observation for job ${args.job_id}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const run = this.research.observeRun({
            actionId: args.action_id,
            expectedRevision: args.expected_revision,
            campaign: args.campaign,
            jobId: args.job_id,
            sourcePin: args.source_pin,
            binaryPin: args.binary_pin,
            stage: args.stage,
            schedulerState: args.scheduler_state,
            nextCheckAt: args.next_check_at,
            terminalState: args.terminal_state,
            artifactRefs: args.artifact_refs,
          });
          return {
            output: [
              `Observed job ${run.jobId}: ${run.schedulerState} / ${run.stage}.`,
              `Last observed at: ${new Date(run.lastObservedAt).toISOString()}.`,
              run.nextCheckAt === undefined ? 'No next check was scheduled.' : `Next check at: ${new Date(run.nextCheckAt).toISOString()}.`,
              'This is an observation only; no scheduler submission, automatic polling, or scientific conclusion was performed.',
            ].join('\n'),
          };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class ResolveResearchDecisionTool implements IResolveResearchDecisionTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'ResolveResearchDecision' as const;
  readonly description = 'Record the human decision, resolve the current human gate, and restore the Research Loop phase.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(ResolveResearchDecisionInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: ResolveResearchDecisionInput): ToolExecution {
    return {
      description: 'Resolving the current human research decision',
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const gate = this.research.resolveHumanDecision({
            gateId: args.gate_id,
            resolution: args.resolution,
            nextPhase: args.next_phase,
          });
          return {
            output: [
              `Human decision recorded: ${gate.resolution ?? args.resolution}`,
              `Research phase restored to ${args.next_phase}.`,
              `Next step significance: ${nextStepMeaning(args.next_phase)}`,
            ].join('\n'),
          };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export class RequestResearchDecisionTool implements IRequestResearchDecisionTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'RequestResearchDecision' as const;
  readonly description = 'Request a genuinely non-delegable human scientific or protocol decision and enter the awaiting-human phase. This remains human-owned in every tool permission mode, including auto. Never use it for routine in-scope or remote tool actions.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(RequestResearchDecisionInputSchema);

  constructor(
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: RequestResearchDecisionInput): ToolExecution {
    return {
      description: `Requesting human ${args.kind}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          const gate = this.research.requestHumanDecision({
            kind: args.kind,
            prompt: args.prompt,
            actionId: args.action_id,
            questionId: args.question_id,
          });
          const snapshot = this.research.getSnapshot();
          const lines: string[] = [
            `Human ${gate.kind} requested.`,
            `Prompt: ${gate.prompt}`,
            `Phase: ${snapshot.phase}.`,
            'Mainline impact: the research loop is paused pending human input.',
            'Next step: wait for the human decision, then resume with RecordResearchProgress or a new action.',
          ];
          return { output: lines.join('\n') };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}
