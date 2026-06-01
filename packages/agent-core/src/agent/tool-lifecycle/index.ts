import type { ContentPart } from '@moonshot-ai/kosong';

import type { Agent } from '..';
import type { ExecutableToolResult } from '../../loop';

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

  recordCompleted(input: PrimitiveToolCompletedInput): PrimitiveToolLifecycleEnvelope {
    const started = this.started.get(input.toolCallId);
    this.started.delete(input.toolCallId);
    const completedAt = input.completedAt ?? Date.now();
    const output = summarizeToolOutput(input.result);
    const workFrameId = input.workFrameId ?? started?.workFrameId;
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
