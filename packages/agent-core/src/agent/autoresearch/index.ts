import { randomUUID } from 'node:crypto';

import { ErrorCodes, KimiError } from '#/errors';
import type { Agent } from '..';
import type { AgentRecordOf } from '../records/types';
import type {
  AitpResearchRunEventStatus,
  AitpResearchRunEventType,
  AitpResearchRunPhase,
  AitpResearchRunStatus,
  AitpResearchRunTerminalAnswerState,
} from '../../aitp';

const MAX_AUTORESEARCH_TEXT_LENGTH = 4000;
const DEFAULT_AUTORESEARCH_OPERATOR = 'human';

export type AutoresearchStatus = AitpResearchRunStatus;
export type AutoresearchPhase = AitpResearchRunPhase;
export type AutoresearchTerminalAnswerState = AitpResearchRunTerminalAnswerState;
export type AutoresearchEventType = AitpResearchRunEventType;
export type AutoresearchEventStatus = AitpResearchRunEventStatus;

export interface AutoresearchSnapshot {
  readonly id: string;
  readonly aitpRunId: string;
  readonly topicId: string;
  readonly objective: string;
  readonly researchQuestion: string;
  readonly operator: string;
  readonly title?: string | undefined;
  readonly claimId?: string | undefined;
  readonly sessionId?: string | undefined;
  readonly hypothesis?: string | undefined;
  readonly status: AutoresearchStatus;
  readonly phase: AutoresearchPhase;
  readonly terminalAnswerState: AutoresearchTerminalAnswerState;
  readonly stopReason?: string | undefined;
  readonly eventIds: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly orientationOnly: boolean;
  readonly canUpdateKernelState: boolean;
  readonly canUpdateClaimTrust: boolean;
}

export interface AutoresearchToolResult {
  readonly autoresearch: AutoresearchSnapshot | null;
}

export interface StartAutoresearchInput {
  readonly topicId: string;
  readonly objective: string;
  readonly researchQuestion: string;
  readonly operator?: string | undefined;
  readonly title?: string | undefined;
  readonly claimId?: string | undefined;
  readonly sessionId?: string | undefined;
  readonly hypothesis?: string | undefined;
  readonly phase?: AutoresearchPhase | undefined;
  readonly replace?: boolean | undefined;
}

export interface UpdateAutoresearchInput {
  readonly status?: AutoresearchStatus | undefined;
  readonly phase?: AutoresearchPhase | undefined;
  readonly terminalAnswerState?: AutoresearchTerminalAnswerState | undefined;
  readonly stopReason?: string | undefined;
  readonly operator?: string | undefined;
  readonly aitpSliceRefs?: readonly string[] | undefined;
  readonly actionRefs?: readonly string[] | undefined;
  readonly evidenceRefs?: readonly string[] | undefined;
  readonly validationRefs?: readonly string[] | undefined;
  readonly sourceRefs?: readonly string[] | undefined;
  readonly answerPacketRef?: string | undefined;
  readonly eventType?: AutoresearchEventType | undefined;
  readonly eventSummary?: string | undefined;
  readonly payload?: Readonly<Record<string, unknown>> | undefined;
}

export interface RecordAutoresearchEventInput {
  readonly eventType: AutoresearchEventType;
  readonly summary: string;
  readonly status?: AutoresearchEventStatus | undefined;
  readonly phase?: AutoresearchPhase | undefined;
  readonly operator?: string | undefined;
  readonly claimId?: string | undefined;
  readonly actionId?: string | undefined;
  readonly actionRef?: string | undefined;
  readonly sourceRefs?: readonly string[] | undefined;
  readonly evidenceRefs?: readonly string[] | undefined;
  readonly validationRefs?: readonly string[] | undefined;
  readonly artifactRefs?: readonly string[] | undefined;
  readonly payload?: Readonly<Record<string, unknown>> | undefined;
}

interface AutoresearchState {
  id: string;
  aitpRunId: string;
  topicId: string;
  objective: string;
  researchQuestion: string;
  operator: string;
  title?: string | undefined;
  claimId?: string | undefined;
  sessionId?: string | undefined;
  hypothesis?: string | undefined;
  status: AutoresearchStatus;
  phase: AutoresearchPhase;
  terminalAnswerState: AutoresearchTerminalAnswerState;
  stopReason?: string | undefined;
  eventIds: string[];
  createdAt: number;
  updatedAt: number;
  orientationOnly: boolean;
  canUpdateKernelState: boolean;
  canUpdateClaimTrust: boolean;
}

export class AutoresearchMode {
  private state: AutoresearchState | undefined;

  constructor(private readonly agent: Agent) {}

  restoreCreate(record: AgentRecordOf<'autoresearch.create'>): void {
    this.state = {
      id: record.id,
      aitpRunId: record.aitpRunId,
      topicId: record.topicId,
      objective: record.objective,
      researchQuestion: record.researchQuestion,
      operator: record.operator,
      title: record.title,
      claimId: record.claimId,
      sessionId: record.sessionId,
      hypothesis: record.hypothesis,
      status: record.status,
      phase: record.phase,
      terminalAnswerState: record.terminalAnswerState,
      eventIds: [...record.eventIds],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      orientationOnly: record.orientationOnly,
      canUpdateKernelState: record.canUpdateKernelState,
      canUpdateClaimTrust: record.canUpdateClaimTrust,
    };
  }

  restoreUpdate(record: AgentRecordOf<'autoresearch.update'>): void {
    const state = this.state;
    if (state === undefined) return;
    if (record.status !== undefined) state.status = record.status;
    if (record.phase !== undefined) state.phase = record.phase;
    if (record.terminalAnswerState !== undefined) {
      state.terminalAnswerState = record.terminalAnswerState;
    }
    if (record.stopReason !== undefined) state.stopReason = record.stopReason;
    if (record.operator !== undefined) state.operator = record.operator;
    if (record.eventIds !== undefined) state.eventIds = [...record.eventIds];
    state.updatedAt = record.updatedAt;
  }

  restoreClear(_record: AgentRecordOf<'autoresearch.clear'>): void {
    this.state = undefined;
  }

  getAutoresearch(): AutoresearchToolResult {
    const state = this.state;
    return { autoresearch: state === undefined ? null : this.toSnapshot(state) };
  }

  async start(input: StartAutoresearchInput): Promise<AutoresearchSnapshot> {
    this.requireBridge();
    const topicId = normalizeRequired(input.topicId, 'Autoresearch topic cannot be empty');
    const objective = normalizeBounded(
      input.objective,
      'Autoresearch objective cannot be empty',
      'Autoresearch objective is too long',
    );
    const researchQuestion = normalizeBounded(
      input.researchQuestion,
      'Autoresearch question cannot be empty',
      'Autoresearch question is too long',
    );
    const operator = normalizeRequired(
      input.operator ?? DEFAULT_AUTORESEARCH_OPERATOR,
      'Autoresearch operator cannot be empty',
    );
    const existing = this.state;
    if (existing !== undefined) {
      if (input.replace !== true) {
        throw new KimiError(
          ErrorCodes.AUTORESEARCH_ALREADY_EXISTS,
          'An autoresearch run already exists; use replace to start a new one',
        );
      }
    }

    const result = await this.agent.aitpWriteBridge!.executeWrite({
      operation: 'startResearchRun',
      payload: {
        topicId,
        objective,
        researchQuestion,
        operator,
        title: normalizeOptional(input.title),
        claimId: normalizeOptional(input.claimId),
        sessionId: normalizeOptional(input.sessionId),
        hypothesis: normalizeOptional(input.hypothesis),
        phase: input.phase,
        metadata: {
          source: 'hakimi.autoresearch',
          controller: 'slash_autoresearch',
        },
      },
    });
    if (result.kind !== 'research_run') {
      throw new KimiError(ErrorCodes.INTERNAL, 'AITP startResearchRun returned an unexpected result');
    }
    const now = Date.now();
    const state: AutoresearchState = {
      id: randomUUID(),
      aitpRunId: result.runId,
      topicId: result.topicId,
      objective: result.objective,
      researchQuestion: result.researchQuestion,
      operator: result.operator,
      title: normalizeOptional(input.title),
      claimId: normalizeOptional(input.claimId),
      sessionId: normalizeOptional(input.sessionId),
      hypothesis: normalizeOptional(input.hypothesis),
      status: result.status,
      phase: result.phase,
      terminalAnswerState: result.terminalAnswerState,
      eventIds: [...result.eventIds],
      createdAt: now,
      updatedAt: now,
      orientationOnly: result.orientationOnly,
      canUpdateKernelState: result.canUpdateKernelState,
      canUpdateClaimTrust: result.canUpdateClaimTrust,
    };
    this.persistCreate(state);
    this.agent.telemetry.track('autoresearch_started', {
      topic_id: state.topicId,
      operator: state.operator,
      replace: input.replace === true,
    });
    this.emitUpdated(state);
    return this.toSnapshot(state);
  }

  async update(input: UpdateAutoresearchInput): Promise<AutoresearchSnapshot> {
    const state = this.requireState();
    this.requireBridge();
    const operator = normalizeRequired(
      input.operator ?? state.operator,
      'Autoresearch operator cannot be empty',
    );
    const result = await this.agent.aitpWriteBridge!.executeWrite({
      operation: 'updateResearchRun',
      payload: {
        runId: state.aitpRunId,
        topicId: state.topicId,
        operator,
        status: input.status,
        phase: input.phase,
        terminalAnswerState: input.terminalAnswerState,
        stopReason: input.stopReason,
        aitpSliceRefs: input.aitpSliceRefs,
        actionRefs: input.actionRefs,
        evidenceRefs: input.evidenceRefs,
        validationRefs: input.validationRefs,
        sourceRefs: input.sourceRefs,
        answerPacketRef: input.answerPacketRef,
        eventType: input.eventType,
        eventSummary: input.eventSummary,
        payload: input.payload,
      },
    });
    if (result.kind !== 'research_run') {
      throw new KimiError(ErrorCodes.INTERNAL, 'AITP updateResearchRun returned an unexpected result');
    }
    state.operator = result.operator;
    state.status = result.status;
    state.phase = result.phase;
    state.terminalAnswerState = result.terminalAnswerState;
    state.stopReason = input.stopReason ?? state.stopReason;
    state.eventIds = [...result.eventIds];
    state.updatedAt = Date.now();
    this.persistUpdate(state);
    this.agent.telemetry.track('autoresearch_updated', {
      topic_id: state.topicId,
      status: state.status,
      phase: state.phase,
      operator: state.operator,
    });
    this.emitUpdated(state);
    return this.toSnapshot(state);
  }

  async recordEvent(input: RecordAutoresearchEventInput): Promise<AutoresearchSnapshot> {
    const state = this.requireState();
    this.requireBridge();
    const operator = normalizeRequired(
      input.operator ?? state.operator,
      'Autoresearch operator cannot be empty',
    );
    const summary = normalizeBounded(
      input.summary,
      'Autoresearch event summary cannot be empty',
      'Autoresearch event summary is too long',
    );
    const result = await this.agent.aitpWriteBridge!.executeWrite({
      operation: 'recordResearchRunEvent',
      payload: {
        runId: state.aitpRunId,
        topicId: state.topicId,
        operator,
        eventType: input.eventType,
        summary,
        status: input.status,
        phase: input.phase ?? state.phase,
        claimId: normalizeOptional(input.claimId) ?? state.claimId,
        sessionId: state.sessionId,
        actionId: normalizeOptional(input.actionId),
        actionRef: normalizeOptional(input.actionRef),
        sourceRefs: input.sourceRefs,
        evidenceRefs: input.evidenceRefs,
        validationRefs: input.validationRefs,
        artifactRefs: input.artifactRefs,
        payload: input.payload,
      },
    });
    if (result.kind !== 'research_run_event') {
      throw new KimiError(
        ErrorCodes.INTERNAL,
        'AITP recordResearchRunEvent returned an unexpected result',
      );
    }
    state.operator = result.operator;
    if (result.phase.length > 0) state.phase = result.phase as AutoresearchPhase;
    state.eventIds = [...state.eventIds, result.eventId];
    state.updatedAt = Date.now();
    this.persistUpdate(state);
    this.agent.telemetry.track('autoresearch_event_recorded', {
      topic_id: state.topicId,
      event_type: result.eventType,
      event_status: result.status,
      operator: state.operator,
    });
    this.emitUpdated(state);
    return this.toSnapshot(state);
  }

  pause(input: { readonly reason?: string; readonly operator?: string } = {}): Promise<AutoresearchSnapshot> {
    return this.update({
      status: 'paused',
      phase: 'awaiting_approval',
      stopReason: input.reason,
      operator: input.operator,
      eventType: 'status_changed',
      eventSummary: input.reason ?? 'Autoresearch paused.',
    });
  }

  resume(input: { readonly operator?: string } = {}): Promise<AutoresearchSnapshot> {
    return this.update({
      status: 'active',
      phase: 'context_refresh',
      terminalAnswerState: '',
      operator: input.operator,
      eventType: 'status_changed',
      eventSummary: 'Autoresearch resumed.',
    });
  }

  stop(input: { readonly reason?: string; readonly operator?: string } = {}): Promise<AutoresearchSnapshot> {
    return this.update({
      status: 'stopped',
      phase: 'blocked',
      stopReason: input.reason,
      operator: input.operator,
      eventType: 'run_stopped',
      eventSummary: input.reason ?? 'Autoresearch stopped by operator.',
    });
  }

  private persistCreate(state: AutoresearchState): void {
    this.state = state;
    this.agent.records.logRecord({
      type: 'autoresearch.create',
      id: state.id,
      aitpRunId: state.aitpRunId,
      topicId: state.topicId,
      objective: state.objective,
      researchQuestion: state.researchQuestion,
      operator: state.operator,
      title: state.title,
      claimId: state.claimId,
      sessionId: state.sessionId,
      hypothesis: state.hypothesis,
      status: state.status,
      phase: state.phase,
      terminalAnswerState: state.terminalAnswerState,
      eventIds: state.eventIds,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      orientationOnly: state.orientationOnly,
      canUpdateKernelState: state.canUpdateKernelState,
      canUpdateClaimTrust: state.canUpdateClaimTrust,
    });
  }

  private persistUpdate(state: AutoresearchState): void {
    this.agent.records.logRecord({
      type: 'autoresearch.update',
      status: state.status,
      phase: state.phase,
      terminalAnswerState: state.terminalAnswerState,
      stopReason: state.stopReason,
      operator: state.operator,
      eventIds: state.eventIds,
      updatedAt: state.updatedAt,
    });
  }

  private clearInternal(): void {
    if (this.state === undefined) return;
    this.state = undefined;
    this.agent.records.logRecord({ type: 'autoresearch.clear' });
    this.emitUpdated(undefined);
  }

  private emitUpdated(state: AutoresearchState | undefined): void {
    this.agent.emitEvent({
      type: 'autoresearch.updated',
      snapshot: state === undefined ? null : this.toSnapshot(state),
    });
  }

  private requireBridge(): void {
    if (this.agent.aitpWriteBridge !== undefined) return;
    throw new KimiError(
      ErrorCodes.AUTORESEARCH_AITP_BRIDGE_REQUIRED,
      'Autoresearch requires a configured AITP write bridge',
    );
  }

  private requireState(): AutoresearchState {
    const state = this.state;
    if (state === undefined) {
      throw new KimiError(ErrorCodes.AUTORESEARCH_NOT_FOUND, 'No current autoresearch run');
    }
    return state;
  }

  private toSnapshot(state: AutoresearchState): AutoresearchSnapshot {
    return {
      id: state.id,
      aitpRunId: state.aitpRunId,
      topicId: state.topicId,
      objective: state.objective,
      researchQuestion: state.researchQuestion,
      operator: state.operator,
      title: state.title,
      claimId: state.claimId,
      sessionId: state.sessionId,
      hypothesis: state.hypothesis,
      status: state.status,
      phase: state.phase,
      terminalAnswerState: state.terminalAnswerState,
      stopReason: state.stopReason,
      eventIds: [...state.eventIds],
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      orientationOnly: state.orientationOnly,
      canUpdateKernelState: state.canUpdateKernelState,
      canUpdateClaimTrust: state.canUpdateClaimTrust,
    };
  }
}

function normalizeRequired(value: string, message: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new KimiError(ErrorCodes.REQUEST_INVALID, message);
  }
  return trimmed;
}

function normalizeBounded(value: string, emptyMessage: string, tooLongMessage: string): string {
  const trimmed = normalizeRequired(value, emptyMessage);
  if (trimmed.length > MAX_AUTORESEARCH_TEXT_LENGTH) {
    throw new KimiError(
      ErrorCodes.REQUEST_INVALID,
      `${tooLongMessage} (max ${MAX_AUTORESEARCH_TEXT_LENGTH} characters)`,
    );
  }
  return trimmed;
}

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}
