import type { ContentPart } from '@moonshot-ai/kosong';

import type { Agent } from '..';
import type { ExecutableToolResult } from '../../loop';
import { parseAitpClaimRelationMap } from '../../aitp';
import { buildToolLifecycleAutoCaptureResult } from '../research-ledger/auto-capture';

const MAX_ARGS_SUMMARY_LENGTH = 2000;
const MAX_OUTPUT_SUMMARY_LENGTH = 2000;
const MAX_RECENT_ENVELOPES = 200;

export type PrimitiveToolLifecycleRecordSource = 'loop' | 'controller' | 'replay';
export type PrimitiveToolLifecycleStatus = 'passed' | 'failed';
export type PrimitiveToolOutputKind = 'text' | 'content_parts' | 'empty';

export interface PrimitiveToolStartedInput {
  readonly source: PrimitiveToolLifecycleRecordSource;
  readonly turnId: number;
  readonly step: number;
  readonly stepUuid: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: unknown;
  readonly cwd: string;
  readonly description?: string | undefined;
  readonly workFrameId?: string | undefined;
  readonly actionCallId?: string | undefined;
  readonly startedAt?: number | undefined;
}

export interface PrimitiveToolCompletedInput {
  readonly source: PrimitiveToolLifecycleRecordSource;
  readonly turnId: number;
  readonly toolCallId: string;
  readonly toolName?: string | undefined;
  readonly result: ExecutableToolResult;
  readonly completedAt?: number | undefined;
  readonly artifactRefs?: readonly string[] | undefined;
  readonly workFrameId?: string | undefined;
  readonly actionCallId?: string | undefined;
}

export interface PrimitiveToolStartedEnvelope {
  readonly source: PrimitiveToolLifecycleRecordSource;
  readonly turnId: number;
  readonly step: number;
  readonly stepUuid: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly cwd: string;
  readonly argsSummary: string;
  readonly description?: string | undefined;
  readonly workFrameId?: string | undefined;
  readonly actionCallId?: string | undefined;
  readonly startedAt: number;
}

export interface PrimitiveToolCompletedEnvelope {
  readonly source: PrimitiveToolLifecycleRecordSource;
  readonly turnId: number;
  readonly step?: number | undefined;
  readonly stepUuid?: string | undefined;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly cwd?: string | undefined;
  readonly status: PrimitiveToolLifecycleStatus;
  readonly isError: boolean;
  readonly outputKind: PrimitiveToolOutputKind;
  readonly outputSummary: string;
  readonly durationMs?: number | undefined;
  readonly completedAt: number;
  readonly workFrameId?: string | undefined;
  readonly actionCallId?: string | undefined;
  readonly artifactRefs: readonly string[];
}

export interface PrimitiveToolLifecycleEnvelope {
  readonly started: PrimitiveToolStartedEnvelope | undefined;
  readonly completed: PrimitiveToolCompletedEnvelope;
}

export class PrimitiveToolLifecycleManager {
  private readonly started = new Map<string, PrimitiveToolStartedEnvelope>();
  private readonly recent: PrimitiveToolLifecycleEnvelope[] = [];

  constructor(private readonly agent: Agent) {}

  recordStarted(input: PrimitiveToolStartedInput): PrimitiveToolStartedEnvelope {
    const started: PrimitiveToolStartedEnvelope = {
      source: input.source,
      turnId: input.turnId,
      step: input.step,
      stepUuid: input.stepUuid,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      cwd: input.cwd,
      argsSummary: summarizeUnknown(input.args, MAX_ARGS_SUMMARY_LENGTH),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.workFrameId === undefined ? {} : { workFrameId: input.workFrameId }),
      ...(input.actionCallId === undefined ? {} : { actionCallId: input.actionCallId }),
      startedAt: input.startedAt ?? Date.now(),
    };
    this.started.set(input.toolCallId, started);
    this.agent.records.logRecord({
      type: 'tool_lifecycle.started',
      source: started.source,
      turnId: started.turnId,
      step: started.step,
      stepUuid: started.stepUuid,
      toolCallId: started.toolCallId,
      toolName: started.toolName,
      cwd: started.cwd,
      argsSummary: started.argsSummary,
      ...(started.description === undefined ? {} : { description: started.description }),
      ...(started.workFrameId === undefined ? {} : { workFrameId: started.workFrameId }),
      ...(started.actionCallId === undefined ? {} : { actionCallId: started.actionCallId }),
      startedAt: started.startedAt,
    });
    return started;
  }

  async recordCompleted(input: PrimitiveToolCompletedInput): Promise<PrimitiveToolLifecycleEnvelope> {
    const started = this.started.get(input.toolCallId);
    this.started.delete(input.toolCallId);
    const completedAt = input.completedAt ?? Date.now();
    const output = summarizeToolOutput(input.result);
    const inferredWorkFrameId = this.ensureAitpRecoveryWorkFrame({
      toolName: input.toolName ?? started?.toolName ?? '<unknown>',
      argsSummary: started?.argsSummary,
      result: input.result,
      toolCallId: input.toolCallId,
    });
    const workFrameId = input.workFrameId ?? started?.workFrameId ?? inferredWorkFrameId;
    const actionCallId = input.actionCallId ?? started?.actionCallId;
    const completed: PrimitiveToolCompletedEnvelope = {
      source: input.source,
      turnId: input.turnId,
      ...(started?.step === undefined ? {} : { step: started.step }),
      ...(started?.stepUuid === undefined ? {} : { stepUuid: started.stepUuid }),
      toolCallId: input.toolCallId,
      toolName: input.toolName ?? started?.toolName ?? '<unknown>',
      ...(started?.cwd === undefined ? {} : { cwd: started.cwd }),
      status: input.result.isError === true ? 'failed' : 'passed',
      isError: input.result.isError === true,
      outputKind: output.outputKind,
      outputSummary: output.outputSummary,
      ...(started === undefined ? {} : { durationMs: completedAt - started.startedAt }),
      completedAt,
      ...(workFrameId === undefined ? {} : { workFrameId }),
      ...(actionCallId === undefined ? {} : { actionCallId }),
      artifactRefs: input.artifactRefs ?? [],
    };
    this.agent.records.logRecord({
      type: 'tool_lifecycle.completed',
      source: completed.source,
      turnId: completed.turnId,
      ...(completed.step === undefined ? {} : { step: completed.step }),
      ...(completed.stepUuid === undefined ? {} : { stepUuid: completed.stepUuid }),
      toolCallId: completed.toolCallId,
      toolName: completed.toolName,
      ...(completed.cwd === undefined ? {} : { cwd: completed.cwd }),
      status: completed.status,
      isError: completed.isError,
      outputKind: completed.outputKind,
      outputSummary: completed.outputSummary,
      ...(completed.durationMs === undefined ? {} : { durationMs: completed.durationMs }),
      completedAt: completed.completedAt,
      ...(completed.workFrameId === undefined ? {} : { workFrameId: completed.workFrameId }),
      ...(completed.actionCallId === undefined ? {} : { actionCallId: completed.actionCallId }),
      artifactRefs: completed.artifactRefs,
    });
    const envelope = { started, completed };
    this.pushRecent(envelope);
    await this.autoCapture(envelope);
    return envelope;
  }

  listRecent(limit = 50): readonly PrimitiveToolLifecycleEnvelope[] {
    return this.recent.slice(-Math.max(0, limit)).map((envelope) => ({
      started: envelope.started === undefined ? undefined : { ...envelope.started },
      completed: {
        ...envelope.completed,
        artifactRefs: [...envelope.completed.artifactRefs],
      },
    }));
  }

  private pushRecent(envelope: PrimitiveToolLifecycleEnvelope): void {
    this.recent.push(envelope);
    if (this.recent.length > MAX_RECENT_ENVELOPES) {
      this.recent.splice(0, this.recent.length - MAX_RECENT_ENVELOPES);
    }
  }

  private async autoCapture(envelope: PrimitiveToolLifecycleEnvelope): Promise<void> {
    const manager = this.agent.researchLedger;
    if (manager === null) return;

    const workFrameId = envelope.completed.workFrameId;
    const workFrame =
      workFrameId === undefined
        ? this.agent.workFrames.active
        : this.agent.workFrames.list().find((frame) => frame.id === workFrameId);
    const capture = buildToolLifecycleAutoCaptureResult({
      envelope,
      workFrame,
    });
    if (!capture.capture || capture.writeInput === undefined) {
      manager.recordAutoCaptureSkipped({
        source: 'controller',
        toolName: envelope.completed.toolName,
        toolCallId: envelope.completed.toolCallId,
        workFrameId: envelope.completed.workFrameId,
        actionCallId: envelope.completed.actionCallId,
        reason: capture.skipReason ?? 'capture-disabled',
        diagnostics: capture.diagnostics,
      });
      return;
    }

    try {
      await manager.writeEvent(capture.writeInput, {
        source: 'controller',
        toolCallId: envelope.completed.toolCallId,
      });
    } catch (error) {
      manager.recordAutoCaptureSkipped({
        source: 'controller',
        toolName: envelope.completed.toolName,
        toolCallId: envelope.completed.toolCallId,
        workFrameId: envelope.completed.workFrameId,
        actionCallId: envelope.completed.actionCallId,
        reason: error instanceof Error ? `write-failed:${error.message}` : 'write-failed',
        diagnostics: capture.diagnostics,
      });
    }
  }

  private ensureAitpRecoveryWorkFrame(input: {
    readonly toolName: string;
    readonly argsSummary?: string | undefined;
    readonly result: ExecutableToolResult;
    readonly toolCallId: string;
  }): string | undefined {
    if (!isAitpRecoveryTool(input.toolName)) return undefined;
    const payload = parseJsonToolOutput(input.result);
    const scope = payload === undefined
      ? aitpRecoveryScopeFromArgs(input.toolName, input.argsSummary ?? '')
      : (aitpRecoveryScope(payload) ?? aitpRecoveryScopeFromArgs(input.toolName, input.argsSummary ?? ''));
    if (scope === undefined) return undefined;
    const relationMap = payload === undefined ? undefined : relationMapFromPayload(payload);
    const activeFrame = this.agent.workFrames.active;
    if (activeFrame !== undefined) {
      if (activeFrame.topic !== scope.topicId) return undefined;
      if (relationMap !== undefined) {
        this.agent.researchContext.compileForWorkFrame(
          {
            workFrameId: activeFrame.id,
            claimRelationMap: relationMap,
          },
          { source: 'controller', toolCallId: input.toolCallId },
        );
      }
      return activeFrame.id;
    }
    const frame = this.agent.workFrames.open(
      {
        id: derivedAitpRecoveryFrameId(scope.topicId, scope.sessionId),
        domain: 'theoretical-physics/general',
        topic: scope.topicId,
        goal: `Restore AITP session ${scope.sessionId || scope.topicId}.`,
        activeObjectIds: scope.claimId === '' ? [] : [`claim:${scope.claimId}`],
        sourceRefs: [
          `aitp:topic:${scope.topicId}`,
          ...(scope.sessionId === '' ? [] : [`aitp:session:${scope.sessionId}`]),
          ...(scope.claimId === '' ? [] : [`aitp:claim:${scope.claimId}`, `claim:${scope.claimId}`]),
        ],
        trustState: trustStateFromConfidence(scope.confidenceState),
      },
      { source: 'controller', toolCallId: input.toolCallId },
    );

    this.agent.researchContext.compileForWorkFrame(
      {
        workFrameId: frame.id,
        ...(relationMap === undefined ? {} : { claimRelationMap: relationMap }),
      },
      { source: 'controller', toolCallId: input.toolCallId },
    );
    return frame.id;
  }
}

interface AitpRecoveryScope {
  readonly topicId: string;
  readonly sessionId: string;
  readonly claimId: string;
  readonly confidenceState: string;
}

function isAitpRecoveryTool(toolName: string): boolean {
  return [
    'aitp_v5_get_execution_brief',
    'aitp_v5_get_claim_relation_map',
    'aitp_v5_build_workspace_recovery_audit',
    'aitp_v5_build_legacy_semantic_review_packet',
  ].some((name) => toolName === name || toolName.endsWith(`__${name}`));
}

function parseJsonToolOutput(result: ExecutableToolResult): Readonly<Record<string, unknown>> | undefined {
  const text = toolOutputText(result);
  if (text.trim().length === 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function toolOutputText(result: ExecutableToolResult): string {
  if (typeof result.output === 'string') return result.output;
  return result.output
    .map((part) => (typeof part === 'object' && part !== null && part.type === 'text' ? part.text : ''))
    .filter((part) => part.length > 0)
    .join('\n');
}

function aitpRecoveryScope(payload: Readonly<Record<string, unknown>>): AitpRecoveryScope | undefined {
  if (stringValue(payload['kind']) === 'claim_relation_map') {
    const topicId = stringValue(payload['topic_id']) ?? stringValue(payload['topicId']) ?? '';
    if (topicId === '') return undefined;
    return {
      topicId,
      sessionId: stringValue(payload['session_id']) ?? stringValue(payload['sessionId']) ?? '',
      claimId: stringValue(payload['claim_id']) ?? stringValue(payload['claimId']) ?? '',
      confidenceState: stringValue(payload['confidence_state']) ?? stringValue(payload['confidenceState']) ?? '',
    };
  }
  if (stringValue(payload['kind']) === 'legacy_semantic_review_packet') {
    const topicId = stringValue(payload['topic']) ?? stringValue(payload['topic_id']) ?? stringValue(payload['topicId']) ?? '';
    if (topicId === '') return undefined;
    const recoveryFocus = recordValue(payload['current_recovery_focus']) ?? recordValue(payload['currentRecoveryFocus']);
    return {
      topicId,
      sessionId: stringValue(recoveryFocus?.['session_id']) ?? stringValue(recoveryFocus?.['sessionId']) ?? '',
      claimId:
        stringValue(recoveryFocus?.['active_claim_id']) ??
        stringValue(recoveryFocus?.['activeClaimId']) ??
        stringValue(payload['active_claim_id']) ??
        stringValue(payload['activeClaimId']) ??
        '',
      confidenceState: '',
    };
  }
  const session = recordValue(payload['session']);
  const currentFocus = recordValue(payload['current_focus']) ?? recordValue(payload['currentFocus']);
  if (session !== undefined) {
    const sessionTopic = stringValue(session['topic_id']) ?? stringValue(session['topicId']) ?? '';
    if (sessionTopic !== '') {
      return {
        topicId: sessionTopic,
        sessionId: stringValue(session['session_id']) ?? stringValue(session['sessionId']) ?? '',
        claimId: stringValue(session['active_claim']) ?? stringValue(session['activeClaim']) ?? '',
        confidenceState: stringValue(currentFocus?.['confidence_state']) ?? stringValue(currentFocus?.['confidenceState']) ?? '',
      };
    }
  }
  const selectedTopic = recordValue(payload['selected_topic']) ?? recordValue(payload['selectedTopic']);
  if (selectedTopic !== undefined) {
    const topicId = stringValue(selectedTopic['topic_id']) ?? stringValue(selectedTopic['topicId']) ?? '';
    if (topicId !== '') {
      return {
        topicId,
        sessionId: stringValue(selectedTopic['session_id']) ?? stringValue(selectedTopic['sessionId']) ?? '',
        claimId:
          stringValue(selectedTopic['active_claim_id']) ??
          stringValue(selectedTopic['activeClaimId']) ??
          '',
        confidenceState: '',
      };
    }
  }
  const rawRows = Array.isArray(payload['topic_rows'])
    ? payload['topic_rows']
    : Array.isArray(payload['topicRows'])
      ? payload['topicRows']
      : [];
  const rows = rawRows.filter(isRecord);
  if (rows.length === 1) {
    const row = rows[0]!;
    const topicId = stringValue(row['topic_id']) ?? stringValue(row['topicId']) ?? '';
    if (topicId === '') return undefined;
    return {
      topicId,
      sessionId: stringValue(row['session_id']) ?? stringValue(row['sessionId']) ?? '',
      claimId: stringValue(row['active_claim_id']) ?? stringValue(row['activeClaimId']) ?? '',
      confidenceState: '',
    };
  }
  return undefined;
}

function aitpRecoveryScopeFromArgs(toolName: string, argsSummary: string): AitpRecoveryScope | undefined {
  if (!isAitpRecoveryTool(toolName) || argsSummary.trim().length === 0) return undefined;
  const args = parseArgsSummary(argsSummary);
  const topicId =
    stringValue(args?.['topic']) ??
    stringValue(args?.['topic_id']) ??
    stringValue(args?.['topicId']) ??
    singleStringArrayValue(args?.['topics']) ??
    singleStringArrayValue(args?.['topic_ids']) ??
    singleStringArrayValue(args?.['topicIds']) ??
    regexCapture(argsSummary, /"topic"\s*:\s*"([^"]+)"/) ??
    regexCapture(argsSummary, /"topic_id"\s*:\s*"([^"]+)"/) ??
    regexCapture(argsSummary, /"topicId"\s*:\s*"([^"]+)"/) ??
    '';
  if (topicId === '') return undefined;
  return {
    topicId,
    sessionId:
      stringValue(args?.['session_id']) ??
      stringValue(args?.['sessionId']) ??
      regexCapture(argsSummary, /"session_id"\s*:\s*"([^"]+)"/) ??
      regexCapture(argsSummary, /"sessionId"\s*:\s*"([^"]+)"/) ??
      '',
    claimId:
      stringValue(args?.['active_claim']) ??
      stringValue(args?.['active_claim_id']) ??
      stringValue(args?.['activeClaim']) ??
      stringValue(args?.['activeClaimId']) ??
      '',
    confidenceState: '',
  };
}

function parseArgsSummary(argsSummary: string): Readonly<Record<string, unknown>> | undefined {
  if (argsSummary.includes('[truncated]')) return undefined;
  try {
    const parsed: unknown = JSON.parse(argsSummary);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function singleStringArrayValue(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length !== 1) return undefined;
  return stringValue(value[0]);
}

function regexCapture(value: string, pattern: RegExp): string | undefined {
  return pattern.exec(value)?.[1];
}

function relationMapFromPayload(payload: Readonly<Record<string, unknown>>) {
  if (stringValue(payload['kind']) !== 'claim_relation_map') return undefined;
  try {
    return parseAitpClaimRelationMap(payload);
  } catch {
    return undefined;
  }
}

function derivedAitpRecoveryFrameId(topicId: string, sessionId: string): string {
  return `frame.aitp.${safeId(topicId)}.${shortHash(`${topicId}\n${sessionId}`)}`;
}

function trustStateFromConfidence(confidenceState: string) {
  const normalized = confidenceState.toLowerCase();
  if (normalized.includes('validated')) return 'validated' as const;
  if (normalized.includes('blocked')) return 'blocked' as const;
  if (normalized.includes('checking') || normalized.includes('audit')) return 'checking' as const;
  if (normalized.includes('deriv')) return 'deriving' as const;
  return 'exploratory' as const;
}

function safeId(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '').slice(0, 48) || 'topic';
}

function shortHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function summarizeToolOutput(result: ExecutableToolResult): {
  readonly outputKind: PrimitiveToolOutputKind;
  readonly outputSummary: string;
} {
  const output = result.output;
  if (typeof output === 'string') {
    return {
      outputKind: output.length === 0 ? 'empty' : 'text',
      outputSummary: truncate(output, MAX_OUTPUT_SUMMARY_LENGTH),
    };
  }

  const text = output
    .map((part) => summarizeContentPart(part))
    .filter((part) => part.length > 0)
    .join('\n');
  return {
    outputKind: output.length === 0 ? 'empty' : 'content_parts',
    outputSummary: truncate(text, MAX_OUTPUT_SUMMARY_LENGTH),
  };
}

function summarizeContentPart(part: ContentPart): string {
  if (typeof part !== 'object' || part === null) return '';
  if (part.type === 'text') return part.text;
  if (part.type === 'image_url') return '[image_url]';
  return `[${part.type}]`;
}

function summarizeUnknown(value: unknown, maxLength: number): string {
  if (typeof value === 'string') return truncate(value, maxLength);
  try {
    const encoded = JSON.stringify(value);
    return truncate(encoded ?? String(value), maxLength);
  } catch {
    return truncate(String(value), maxLength);
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 15)}...[truncated]`;
}
