/**
 * `aitpResearch` domain — Research tool implementations.
 *
 * Each tool delegates to `IAgentResearchService` (and `IAgentAitpModeService`
 * for the mode gate). Active-only: the `when` predicate in the Feature
 * contribution checks `mode.isActive`. Bound at Agent scope.
 */

import type { ToolExecution } from '#/tool/toolContract';
import { toInputJsonSchema } from '#/tool/input-schema';
import { IAgentResearchService } from '#/features/aitpResearch/research/agentResearch';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { AitpResearchError } from '#/features/aitpResearch/errors';

import {
  ICommitResearchCheckpointTool,
  ICreateResearchLineTool,
  ICreateResearchQuestionTool,
  IGetResearchStatusTool,
  IProposeResearchCheckpointTool,
  ISetResearchFocusTool,
  IUpdateResearchLineTool,
  IUpdateResearchQuestionTool,
  CommitResearchCheckpointInputSchema,
  CreateResearchLineInputSchema,
  CreateResearchQuestionInputSchema,
  GetResearchStatusInputSchema,
  ProposeResearchCheckpointInputSchema,
  SetResearchFocusInputSchema,
  UpdateResearchLineInputSchema,
  UpdateResearchQuestionInputSchema,
  type CommitResearchCheckpointInput,
  type CreateResearchLineInput,
  type CreateResearchQuestionInput,
  type GetResearchStatusInput,
  type ProposeResearchCheckpointInput,
  type SetResearchFocusInput,
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
          questionId: args.question_id,
          lineSlug: args.line_slug,
          assessment: args.assessment,
          nextAction: args.next_action,
        });
        return {
          output: `Proposed checkpoint ${checkpoint.checkpointId}. Use aitp_record_prepare/save to write the AITP entry, then CommitResearchCheckpoint.`,
        };
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
  ) {}

  resolveExecution(args: CommitResearchCheckpointInput): ToolExecution {
    return {
      description: `Committing checkpoint ${args.checkpoint_id}`,
      approvalRule: this.name,
      execute: async () => {
        const inactive = requireActive(this.mode);
        if (inactive !== undefined) return errorResult(inactive);
        try {
          await this.research.commitCheckpoint({
            checkpointId: args.checkpoint_id,
            entryId: args.entry_id,
          });
          return { output: `Checkpoint ${args.checkpoint_id} committed.` };
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}
