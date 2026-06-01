import type { Agent } from '..';
import type {
  ResearchActionOutcome,
  ResearchActionRecord,
  ResearchActionSource,
} from '../../research-action';

export interface ResearchActionRecordOptions {
  readonly source: ResearchActionSource;
  readonly toolCallId?: string | undefined;
}

export class ResearchActionManager {
  constructor(private readonly agent: Agent) {}

  recordActionResult(
    input: Omit<ResearchActionRecord, 'source'> & {
      readonly generatedObligationIds?: readonly string[] | undefined;
      readonly primitiveToolCallIds?: readonly string[] | undefined;
    },
    options: ResearchActionRecordOptions,
  ): void {
    this.agent.records.logRecord({
      type: 'research_action.result_recorded',
      source: options.source,
      actionId: input.actionId,
      callId: input.callId,
      outcome: input.outcome,
      graphRefs: input.graphRefs,
      capsuleRefs: input.capsuleRefs,
      evidenceRefs: input.evidenceRefs,
      generatedObligationIds: input.generatedObligationIds ?? [],
      primitiveToolCallIds: input.primitiveToolCallIds ?? [],
      nextSuggestedActions: input.nextSuggestedActions,
      ...(options.toolCallId === undefined ? {} : { toolCallId: options.toolCallId }),
    });
  }

  recordRawToolEscape(input: {
    readonly reason: string;
    readonly primitiveToolName: string;
    readonly primitiveToolCallId?: string | undefined;
    readonly followupActionId?: string | undefined;
    readonly evidenceRefs?: readonly string[] | undefined;
  }): void {
    this.agent.records.logRecord({
      type: 'research_action.raw_tool_escape',
      reason: input.reason,
      primitiveToolName: input.primitiveToolName,
      primitiveToolCallId: input.primitiveToolCallId,
      followupActionId: input.followupActionId,
      evidenceRefs: input.evidenceRefs ?? [],
    });
  }
}

export type { ResearchActionOutcome };
