import type { Agent } from '..';
import type {
  CompileResearchContextForWorkFrameInput,
  ResearchContextRecordOptions,
} from '../research-context';
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

interface RecentEvidenceRef {
  readonly ref: string;
  readonly workFrameId?: string | undefined;
  readonly domain?: string | undefined;
  readonly topic?: string | undefined;
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

export class ResearchActionManager {
  private activeCall: ActiveResearchActionCall | undefined;
  private readonly obligations = new Map<string, ResearchObligation>();
  private recentEvidenceRefs: RecentEvidenceRef[] = [];

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
    this.pushEvidenceRefs(input.evidenceRefs ?? [], this.evidenceScope(workFrameId));
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

  restoreActionCallFinished(input: {
    readonly callId: string;
    readonly workFrameId?: string | undefined;
    readonly evidenceRefs?: readonly string[] | undefined;
  }): void {
    if (this.activeCall?.callId === input.callId) {
      this.activeCall = undefined;
    }
    this.pushEvidenceRefs(input.evidenceRefs ?? [], this.evidenceScope(input.workFrameId));
  }

  restoreActionResultRecorded(input: {
    readonly workFrameId?: string | undefined;
    readonly evidenceRefs: readonly string[];
  }): void {
    this.pushEvidenceRefs(input.evidenceRefs, this.evidenceScope(input.workFrameId));
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
}

export type { ResearchActionOutcome };

function parseLedgerEvidenceRef(ref: string): string | undefined {
  return ref.startsWith('ledger:') ? ref.slice('ledger:'.length) : undefined;
}
