import type { Agent } from '..';
import type {
  CompileResearchContextForWorkFrameInput,
  ResearchContextRecordOptions,
} from '../research-context';
import type { ResearchContextPack } from '../../research-context';
import type { OpenWorkFrameInput, WorkFrameRecordOptions } from '../workframe';
import type {
  ResearchActionOutcome,
  ResearchActionRecord,
  ResearchActionSource,
  ResearchObligation,
  WorkFrame,
} from '../../research-action';

export interface ResearchActionRecordOptions {
  readonly source: ResearchActionSource;
  readonly toolCallId?: string | undefined;
}

export interface StartResearchActionCallInput {
  readonly actionId: string;
  readonly callId: string;
  readonly input?: unknown;
}

export interface FinishResearchActionCallInput {
  readonly actionId: string;
  readonly callId: string;
  readonly outcome: ResearchActionOutcome;
  readonly output?: unknown;
  readonly ledgerEventIds?: readonly string[] | undefined;
  readonly evidenceRefs?: readonly string[] | undefined;
  readonly generatedObligationIds?: readonly string[] | undefined;
  readonly primitiveToolCallIds?: readonly string[] | undefined;
  readonly nextSuggestedActions?: readonly string[] | undefined;
}

export interface ActiveResearchActionCall {
  readonly actionId: string;
  readonly callId: string;
  readonly workFrameId?: string | undefined;
  readonly input?: unknown;
  readonly startedAt: number;
}

export class ResearchActionManager {
  private activeCall: ActiveResearchActionCall | undefined;
  private readonly obligations = new Map<string, ResearchObligation>();
  private recentEvidenceRefs: string[] = [];

  constructor(private readonly agent: Agent) {}

  get activeActionCall(): ActiveResearchActionCall | undefined {
    return this.activeCall === undefined ? undefined : { ...this.activeCall };
  }

  openWorkFrame(input: OpenWorkFrameInput, options: WorkFrameRecordOptions): WorkFrame {
    return this.agent.workFrames.open(input, options);
  }

  switchWorkFrame(id: string, options: WorkFrameRecordOptions): WorkFrame {
    return this.agent.workFrames.switch(id, options);
  }

  closeWorkFrame(id: string, options: WorkFrameRecordOptions): void {
    this.agent.workFrames.close(id, options);
  }

  listWorkFrames(): readonly WorkFrame[] {
    return this.agent.workFrames.list();
  }

  activeWorkFrame(): WorkFrame | undefined {
    return this.agent.workFrames.active;
  }

  compileContextPack(
    input: CompileResearchContextForWorkFrameInput,
    options: ResearchContextRecordOptions,
  ): ResearchContextPack {
    return this.agent.researchContext.compileForWorkFrame(input, options);
  }

  listContextPacks(): readonly ResearchContextPack[] {
    return this.agent.researchContext.listPacks();
  }

  requireContextPack(id: string): ResearchContextPack {
    return this.agent.researchContext.requirePack(id);
  }

  startActionCall(
    input: StartResearchActionCallInput,
    options: ResearchActionRecordOptions,
  ): ActiveResearchActionCall {
    const started: ActiveResearchActionCall = {
      actionId: input.actionId,
      callId: input.callId,
      workFrameId: this.agent.workFrames.active?.id,
      input: input.input,
      startedAt: Date.now(),
    };
    this.activeCall = started;
    this.agent.records.logRecord({
      type: 'research_action.call_started',
      source: options.source,
      actionId: started.actionId,
      callId: started.callId,
      ...(started.workFrameId === undefined ? {} : { workFrameId: started.workFrameId }),
      ...(started.input === undefined ? {} : { input: started.input }),
      startedAt: started.startedAt,
      ...(options.toolCallId === undefined ? {} : { toolCallId: options.toolCallId }),
    });
    return started;
  }

  finishActionCall(
    input: FinishResearchActionCallInput,
    options: ResearchActionRecordOptions,
  ): void {
    const workFrameId =
      this.activeCall?.callId === input.callId
        ? this.activeCall.workFrameId
        : this.agent.workFrames.active?.id;
    this.agent.records.logRecord({
      type: 'research_action.call_finished',
      source: options.source,
      actionId: input.actionId,
      callId: input.callId,
      outcome: input.outcome,
      ...(workFrameId === undefined ? {} : { workFrameId }),
      ...(input.output === undefined ? {} : { output: input.output }),
      ledgerEventIds: input.ledgerEventIds ?? [],
      evidenceRefs: input.evidenceRefs ?? [],
      generatedObligationIds: input.generatedObligationIds ?? [],
      primitiveToolCallIds: input.primitiveToolCallIds ?? [],
      nextSuggestedActions: input.nextSuggestedActions ?? [],
      finishedAt: Date.now(),
      ...(options.toolCallId === undefined ? {} : { toolCallId: options.toolCallId }),
    });
    if (this.activeCall?.callId === input.callId) {
      this.activeCall = undefined;
    }
    this.pushEvidenceRefs(input.evidenceRefs ?? []);
  }

  restoreActionCallStarted(input: {
    readonly actionId: string;
    readonly callId: string;
    readonly workFrameId?: string | undefined;
    readonly input?: unknown;
    readonly startedAt: number;
  }): void {
    this.activeCall = {
      actionId: input.actionId,
      callId: input.callId,
      workFrameId: input.workFrameId,
      input: input.input,
      startedAt: input.startedAt,
    };
  }

  restoreActionCallFinished(input: { readonly callId: string }): void {
    if (this.activeCall?.callId === input.callId) {
      this.activeCall = undefined;
    }
  }

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
      ...(this.agent.workFrames.active?.id === undefined
        ? {}
        : { workFrameId: this.agent.workFrames.active.id }),
      graphRefs: input.graphRefs,
      capsuleRefs: input.capsuleRefs,
      ledgerEventIds: input.ledgerEventIds,
      evidenceRefs: input.evidenceRefs,
      generatedObligationIds: input.generatedObligationIds ?? [],
      primitiveToolCallIds: input.primitiveToolCallIds ?? [],
      nextSuggestedActions: input.nextSuggestedActions,
      ...(options.toolCallId === undefined ? {} : { toolCallId: options.toolCallId }),
    });
    this.pushEvidenceRefs(input.evidenceRefs);
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

  registerObligations(obligations: readonly ResearchObligation[]): void {
    for (const obligation of obligations) {
      this.obligations.set(obligation.id, obligation);
    }
  }

  listObligations(filter: {
    readonly ids?: readonly string[] | undefined;
    readonly domain?: string | undefined;
    readonly topic?: string | undefined;
    readonly status?: ResearchObligation['status'] | undefined;
  } = {}): readonly ResearchObligation[] {
    return [...this.obligations.values()]
      .filter((obligation) => filter.ids === undefined || filter.ids.includes(obligation.id))
      .filter((obligation) => filter.domain === undefined || obligation.domain === filter.domain)
      .filter((obligation) => filter.topic === undefined || obligation.topic === filter.topic)
      .filter((obligation) => filter.status === undefined || obligation.status === filter.status)
      .toSorted((a, b) => a.id.localeCompare(b.id));
  }

  recentEvidence(limit = 20): readonly string[] {
    return this.recentEvidenceRefs.slice(-Math.max(0, limit));
  }

  private pushEvidenceRefs(evidenceRefs: readonly string[]): void {
    if (evidenceRefs.length === 0) return;
    this.recentEvidenceRefs = [...this.recentEvidenceRefs, ...evidenceRefs].slice(-50);
  }
}

export type { ResearchActionOutcome };
