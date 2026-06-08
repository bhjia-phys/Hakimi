import type { Agent } from '..';
import type {
  CompileResearchContextForWorkFrameInput,
  ResearchContextRecordOptions,
} from '../research-context';
import type { PrimitiveToolLifecycleEnvelope } from '../tool-lifecycle';
import type { ResearchLedgerRecordOptions } from '../research-ledger';
import type { ResearchContextPack } from '../../research-context';
import type { OpenWorkFrameInput, WorkFrameRecordOptions } from '../workframe';
import type {
  ResearchActionOutcome,
  ResearchActionRecord,
  ResearchActionSource,
  ResearchObligation,
  WorkFrame,
} from '../../research-action';
import type { ResearchLedgerEvent } from '../../research-ledger';
import type {
  BenchmarkAdapterId,
  BenchmarkAdapterRunInput,
  BenchmarkAdapterRunResult,
} from '../../benchmark-adapter';
import {
  buildFormalizationPlan,
  type FormalizationPlan,
  type FormalizationPlanInput,
} from '../../formalization';
import {
  buildPhysicsGraphFromMemory,
  type PhysicsGraph,
} from '../../physics-graph';
import {
  evidenceRefsForAitpWriteBridgeResult,
  generatedObligationIdsForAitpWriteBridgeResult,
  type AitpWriteBridgeExecutionInput,
  type AitpWriteBridgeExecutionResult,
} from '../../aitp';

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

export type ExecuteAitpWriteBridgeInput = AitpWriteBridgeExecutionInput & {
  readonly actionId: string;
  readonly callId: string;
};

export interface ActiveResearchActionCall {
  readonly actionId: string;
  readonly callId: string;
  readonly workFrameId?: string | undefined;
  readonly input?: unknown;
  readonly startedAt: number;
}

interface RecentEvidenceRef {
  readonly ref: string;
  readonly workFrameId?: string | undefined;
  readonly domain?: string | undefined;
  readonly topic?: string | undefined;
}

export type ResearchActionTraceKind =
  | 'call_started'
  | 'call_finished'
  | 'result_recorded'
  | 'raw_tool_escape';

export interface ResearchActionTraceItem {
  readonly kind: ResearchActionTraceKind;
  readonly actionId?: string | undefined;
  readonly callId?: string | undefined;
  readonly outcome?: ResearchActionOutcome | undefined;
  readonly workFrameId?: string | undefined;
  readonly domain?: string | undefined;
  readonly topic?: string | undefined;
  readonly inputSummary?: string | undefined;
  readonly outputSummary?: string | undefined;
  readonly ledgerEventIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly generatedObligationIds: readonly string[];
  readonly primitiveToolCallIds: readonly string[];
  readonly nextSuggestedActions: readonly string[];
  readonly rawToolName?: string | undefined;
  readonly rawToolReason?: string | undefined;
  readonly followupActionId?: string | undefined;
  readonly recordedAt: number;
}

export interface ResearchEvidenceFilter {
  readonly workFrameId?: string | undefined;
  readonly domain?: string | undefined;
  readonly topic?: string | undefined;
}

export interface LoadedResearchEvidenceRef {
  readonly ref: string;
  readonly kind: 'ledger_event';
  readonly event: ResearchLedgerEvent;
}

const MAX_RECENT_ACTION_TRACE_ITEMS = 100;
const MAX_TRACE_SUMMARY_LENGTH = 800;

export class ResearchActionManager {
  private activeCall: ActiveResearchActionCall | undefined;
  private readonly obligations = new Map<string, ResearchObligation>();
  private recentEvidenceRefs: RecentEvidenceRef[] = [];
  private recentTrace: ResearchActionTraceItem[] = [];

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

  runBenchmarkAdapter(
    adapterId: BenchmarkAdapterId,
    input: BenchmarkAdapterRunInput,
  ): BenchmarkAdapterRunResult {
    return this.agent.benchmarkAdapters.run(adapterId, input);
  }

  findPrimitiveToolLifecycleEnvelope(
    toolCallId: string,
  ): PrimitiveToolLifecycleEnvelope | undefined {
    return this.agent.toolLifecycle
      .listRecent(200)
      .find((envelope) => envelope.completed.toolCallId === toolCallId);
  }

  hasAitpWriteBridge(): boolean {
    return this.agent.aitpWriteBridge !== undefined;
  }

  buildPhysicsGraph(): PhysicsGraph {
    const registry = this.agent.physicsMemory?.registry;
    if (registry === undefined) {
      throw new Error('Physics graph queries require a PhysicsMemory registry.');
    }
    return buildPhysicsGraphFromMemory(registry);
  }

  buildFormalizationPlan(input: FormalizationPlanInput): FormalizationPlan {
    return buildFormalizationPlan(this.buildPhysicsGraph(), input);
  }

  async executeAitpWriteBridge(
    input: ExecuteAitpWriteBridgeInput,
    options: ResearchActionRecordOptions,
  ): Promise<AitpWriteBridgeExecutionResult> {
    if (this.agent.aitpWriteBridge === undefined) {
      throw new Error('AITP write bridge is not configured for this session.');
    }
    const result = await this.agent.aitpWriteBridge.executeWrite(input);
    this.recordActionResult(
      {
        actionId: input.actionId,
        callId: input.callId,
        input: {
          operation: input.operation,
          payload: input.payload,
        },
        output: result,
        graphRefs: [],
        capsuleRefs: [],
        ledgerEventIds: [],
        evidenceRefs: evidenceRefsForAitpWriteBridgeResult(result),
        outcome: result.ok ? 'pass' : 'fail',
        generatedObligationIds: generatedObligationIdsForAitpWriteBridgeResult(result),
        primitiveToolCallIds: [],
        nextSuggestedActions: [],
      },
      options,
    );
    return result;
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
    this.pushTrace({
      kind: 'call_started',
      actionId: started.actionId,
      callId: started.callId,
      ...(started.workFrameId === undefined ? {} : this.traceScope(started.workFrameId)),
      ...(started.input === undefined ? {} : { inputSummary: summarizeTraceValue(started.input) }),
      ledgerEventIds: [],
      evidenceRefs: [],
      generatedObligationIds: [],
      primitiveToolCallIds: [],
      nextSuggestedActions: [],
      recordedAt: started.startedAt,
    });
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
    this.pushEvidenceRefs(input.evidenceRefs ?? [], this.evidenceScope(workFrameId));
    this.pushTrace({
      kind: 'call_finished',
      actionId: input.actionId,
      callId: input.callId,
      outcome: input.outcome,
      ...(workFrameId === undefined ? {} : this.traceScope(workFrameId)),
      ...(input.output === undefined ? {} : { outputSummary: summarizeTraceValue(input.output) }),
      ledgerEventIds: input.ledgerEventIds ?? [],
      evidenceRefs: input.evidenceRefs ?? [],
      generatedObligationIds: input.generatedObligationIds ?? [],
      primitiveToolCallIds: input.primitiveToolCallIds ?? [],
      nextSuggestedActions: input.nextSuggestedActions ?? [],
      recordedAt: Date.now(),
    });
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
    this.pushTrace({
      kind: 'call_started',
      actionId: input.actionId,
      callId: input.callId,
      ...(input.workFrameId === undefined ? {} : this.traceScope(input.workFrameId)),
      ...(input.input === undefined ? {} : { inputSummary: summarizeTraceValue(input.input) }),
      ledgerEventIds: [],
      evidenceRefs: [],
      generatedObligationIds: [],
      primitiveToolCallIds: [],
      nextSuggestedActions: [],
      recordedAt: input.startedAt,
    });
  }

  restoreActionCallFinished(input: {
    readonly actionId?: string | undefined;
    readonly callId: string;
    readonly outcome?: ResearchActionOutcome | undefined;
    readonly workFrameId?: string | undefined;
    readonly output?: unknown;
    readonly ledgerEventIds?: readonly string[] | undefined;
    readonly evidenceRefs?: readonly string[] | undefined;
    readonly generatedObligationIds?: readonly string[] | undefined;
    readonly primitiveToolCallIds?: readonly string[] | undefined;
    readonly nextSuggestedActions?: readonly string[] | undefined;
    readonly finishedAt?: number | undefined;
  }): void {
    if (this.activeCall?.callId === input.callId) {
      this.activeCall = undefined;
    }
    this.pushEvidenceRefs(input.evidenceRefs ?? [], this.evidenceScope(input.workFrameId));
    this.pushTrace({
      kind: 'call_finished',
      ...(input.actionId === undefined ? {} : { actionId: input.actionId }),
      callId: input.callId,
      ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
      ...(input.workFrameId === undefined ? {} : this.traceScope(input.workFrameId)),
      ...(input.output === undefined ? {} : { outputSummary: summarizeTraceValue(input.output) }),
      ledgerEventIds: input.ledgerEventIds ?? [],
      evidenceRefs: input.evidenceRefs ?? [],
      generatedObligationIds: input.generatedObligationIds ?? [],
      primitiveToolCallIds: input.primitiveToolCallIds ?? [],
      nextSuggestedActions: input.nextSuggestedActions ?? [],
      recordedAt: input.finishedAt ?? this.agent.records.restoring?.time ?? Date.now(),
    });
  }

  restoreActionResultRecorded(input: {
    readonly actionId?: string | undefined;
    readonly callId?: string | undefined;
    readonly outcome?: ResearchActionOutcome | undefined;
    readonly workFrameId?: string | undefined;
    readonly ledgerEventIds?: readonly string[] | undefined;
    readonly evidenceRefs: readonly string[];
    readonly generatedObligationIds?: readonly string[] | undefined;
    readonly primitiveToolCallIds?: readonly string[] | undefined;
    readonly nextSuggestedActions?: readonly string[] | undefined;
  }): void {
    this.pushEvidenceRefs(input.evidenceRefs, this.evidenceScope(input.workFrameId));
    this.pushTrace({
      kind: 'result_recorded',
      ...(input.actionId === undefined ? {} : { actionId: input.actionId }),
      ...(input.callId === undefined ? {} : { callId: input.callId }),
      ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
      ...(input.workFrameId === undefined ? {} : this.traceScope(input.workFrameId)),
      ledgerEventIds: input.ledgerEventIds ?? [],
      evidenceRefs: input.evidenceRefs,
      generatedObligationIds: input.generatedObligationIds ?? [],
      primitiveToolCallIds: input.primitiveToolCallIds ?? [],
      nextSuggestedActions: input.nextSuggestedActions ?? [],
      recordedAt: this.agent.records.restoring?.time ?? Date.now(),
    });
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
    this.pushEvidenceRefs(input.evidenceRefs, this.evidenceScope(this.agent.workFrames.active?.id));
    this.pushTrace({
      kind: 'result_recorded',
      actionId: input.actionId,
      callId: input.callId,
      outcome: input.outcome,
      ...(this.agent.workFrames.active?.id === undefined
        ? {}
        : this.traceScope(this.agent.workFrames.active.id)),
      inputSummary: summarizeTraceValue(input.input),
      outputSummary: summarizeTraceValue(input.output),
      ledgerEventIds: input.ledgerEventIds,
      evidenceRefs: input.evidenceRefs,
      generatedObligationIds: input.generatedObligationIds ?? [],
      primitiveToolCallIds: input.primitiveToolCallIds ?? [],
      nextSuggestedActions: input.nextSuggestedActions,
      recordedAt: Date.now(),
    });
  }

  recordRawToolEscape(input: {
    readonly reason: string;
    readonly primitiveToolName: string;
    readonly primitiveToolCallId?: string | undefined;
    readonly workFrameId?: string | undefined;
    readonly followupActionId?: string | undefined;
    readonly evidenceRefs?: readonly string[] | undefined;
  }): void {
    this.agent.records.logRecord({
      type: 'research_action.raw_tool_escape',
      reason: input.reason,
      primitiveToolName: input.primitiveToolName,
      primitiveToolCallId: input.primitiveToolCallId,
      ...(input.workFrameId === undefined ? {} : { workFrameId: input.workFrameId }),
      followupActionId: input.followupActionId,
      evidenceRefs: input.evidenceRefs ?? [],
    });
    this.pushEvidenceRefs(input.evidenceRefs ?? [], this.evidenceScope(input.workFrameId));
    this.pushTrace({
      kind: 'raw_tool_escape',
      ...(input.workFrameId === undefined ? {} : this.traceScope(input.workFrameId)),
      evidenceRefs: input.evidenceRefs ?? [],
      ledgerEventIds: [],
      generatedObligationIds: [],
      primitiveToolCallIds: input.primitiveToolCallId === undefined ? [] : [input.primitiveToolCallId],
      nextSuggestedActions:
        input.followupActionId === undefined ? [] : [input.followupActionId],
      rawToolName: input.primitiveToolName,
      rawToolReason: input.reason,
      ...(input.followupActionId === undefined ? {} : { followupActionId: input.followupActionId }),
      recordedAt: Date.now(),
    });
  }

  restoreRawToolEscape(input: {
    readonly reason: string;
    readonly primitiveToolName: string;
    readonly primitiveToolCallId?: string | undefined;
    readonly workFrameId?: string | undefined;
    readonly followupActionId?: string | undefined;
    readonly evidenceRefs?: readonly string[] | undefined;
  }): void {
    this.pushEvidenceRefs(input.evidenceRefs ?? [], this.evidenceScope(input.workFrameId));
    this.pushTrace({
      kind: 'raw_tool_escape',
      ...(input.workFrameId === undefined ? {} : this.traceScope(input.workFrameId)),
      evidenceRefs: input.evidenceRefs ?? [],
      ledgerEventIds: [],
      generatedObligationIds: [],
      primitiveToolCallIds: input.primitiveToolCallId === undefined ? [] : [input.primitiveToolCallId],
      nextSuggestedActions:
        input.followupActionId === undefined ? [] : [input.followupActionId],
      rawToolName: input.primitiveToolName,
      rawToolReason: input.reason,
      ...(input.followupActionId === undefined ? {} : { followupActionId: input.followupActionId }),
      recordedAt: this.agent.records.restoring?.time ?? Date.now(),
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

  recentEvidence(
    limit = 20,
    filter: ResearchEvidenceFilter = {},
  ): readonly string[] {
    return this.recentEvidenceRefs
      .filter(
        (item) => filter.workFrameId === undefined || item.workFrameId === filter.workFrameId,
      )
      .filter((item) => filter.domain === undefined || item.domain === filter.domain)
      .filter((item) => filter.topic === undefined || item.topic === filter.topic)
      .slice(-Math.max(0, limit))
      .map((item) => item.ref);
  }

  listRecentTrace(
    limit = 20,
    filter: ResearchEvidenceFilter = {},
  ): readonly ResearchActionTraceItem[] {
    return this.recentTrace
      .filter((item) => filter.workFrameId === undefined || item.workFrameId === filter.workFrameId)
      .filter((item) => filter.domain === undefined || item.domain === filter.domain)
      .filter((item) => filter.topic === undefined || item.topic === filter.topic)
      .slice(-Math.max(0, limit))
      .map((item) => ({
        ...item,
        ledgerEventIds: [...item.ledgerEventIds],
        evidenceRefs: [...item.evidenceRefs],
        generatedObligationIds: [...item.generatedObligationIds],
        primitiveToolCallIds: [...item.primitiveToolCallIds],
        nextSuggestedActions: [...item.nextSuggestedActions],
      }));
  }

  loadEvidenceRef(
    ref: string,
    filter: ResearchEvidenceFilter,
    options: ResearchLedgerRecordOptions,
  ): LoadedResearchEvidenceRef {
    const eventId = parseLedgerEvidenceRef(ref);
    if (eventId === undefined) {
      throw new Error(`Unsupported research evidence ref "${ref}". Only ledger:<event-id> is supported.`);
    }
    const ledger = this.agent.researchLedger;
    if (ledger === null) {
      throw new Error('Research evidence loading requires a ResearchLedger registry.');
    }
    const event = ledger.registry.requireEvent(eventId);
    if (filter.domain !== undefined && event.metadata.domain !== filter.domain) {
      throw new Error(
        `Research evidence ref "${ref}" is outside the requested domain "${filter.domain}".`,
      );
    }
    if (filter.topic !== undefined && event.metadata.topic !== filter.topic) {
      throw new Error(
        `Research evidence ref "${ref}" is outside the requested topic "${filter.topic}".`,
      );
    }
    ledger.recordEventLoaded(event, options);
    return {
      ref,
      kind: 'ledger_event',
      event,
    };
  }

  private pushEvidenceRefs(
    evidenceRefs: readonly string[],
    scope: Omit<RecentEvidenceRef, 'ref'>,
  ): void {
    if (evidenceRefs.length === 0) return;
    this.recentEvidenceRefs = [
      ...this.recentEvidenceRefs,
      ...evidenceRefs.map((ref) => ({
        ref,
        ...scope,
      })),
    ].slice(-50);
  }

  private pushTrace(item: ResearchActionTraceItem): void {
    this.recentTrace = [...this.recentTrace, item].slice(-MAX_RECENT_ACTION_TRACE_ITEMS);
  }

  private evidenceScope(
    workFrameId: string | undefined,
  ): Omit<RecentEvidenceRef, 'ref'> {
    const frame =
      workFrameId === undefined
        ? this.agent.workFrames.active
        : this.agent.workFrames.list().find((item) => item.id === workFrameId);
    return {
      ...(workFrameId === undefined ? {} : { workFrameId }),
      ...(frame?.domain === undefined ? {} : { domain: frame.domain }),
      ...(frame?.topic === undefined ? {} : { topic: frame.topic }),
    };
  }

  private traceScope(
    workFrameId: string,
  ): Pick<ResearchActionTraceItem, 'workFrameId' | 'domain' | 'topic'> {
    const scope = this.evidenceScope(workFrameId);
    return {
      workFrameId,
      ...(scope.domain === undefined ? {} : { domain: scope.domain }),
      ...(scope.topic === undefined ? {} : { topic: scope.topic }),
    };
  }
}

export type { ResearchActionOutcome };

function parseLedgerEvidenceRef(ref: string): string | undefined {
  return ref.startsWith('ledger:') ? ref.slice('ledger:'.length) : undefined;
}

function summarizeTraceValue(value: unknown): string {
  if (typeof value === 'string') return truncate(value, MAX_TRACE_SUMMARY_LENGTH);
  try {
    const encoded = JSON.stringify(value);
    return truncate(encoded ?? String(value), MAX_TRACE_SUMMARY_LENGTH);
  } catch {
    return truncate(String(value), MAX_TRACE_SUMMARY_LENGTH);
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 15)}...[truncated]`;
}
