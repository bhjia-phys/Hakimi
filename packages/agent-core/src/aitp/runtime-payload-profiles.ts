import type { PrimitiveToolLifecycleEnvelope } from '../agent/tool-lifecycle';
import type { WorkFrame } from '../research-action';

export const PRIMITIVE_TOOL_LIFECYCLE_TO_TOOL_RUN_PROFILE =
  'primitive_tool_lifecycle_to_tool_run';

export interface PrimitiveToolLifecycleAitpToolRunPayloadOptions {
  readonly topicId?: string | undefined;
  readonly claimId?: string | undefined;
  readonly sourceRefs?: readonly string[] | undefined;
}

export function buildPrimitiveToolLifecycleAitpToolRunPayload(
  envelope: PrimitiveToolLifecycleEnvelope,
  workFrame?: WorkFrame | undefined,
  options: PrimitiveToolLifecycleAitpToolRunPayloadOptions = {},
): Readonly<Record<string, unknown>> | undefined {
  const topicId = firstText(options.topicId, workFrame?.topic);
  const claimId = firstText(
    options.claimId,
    firstClaimRef(options.sourceRefs),
    firstClaimRef(workFrame?.sourceRefs),
    firstClaimRef(workFrame?.activeObjectIds),
  );
  if (!hasText(topicId) || !hasText(claimId)) return undefined;

  const completed = envelope.completed;
  const started = envelope.started;
  const sourceRefs = uniqueStrings([
    ...(options.sourceRefs ?? []),
    ...(workFrame?.sourceRefs ?? []),
    ...(workFrame?.activeObjectIds ?? []),
    `tool:${completed.toolName}`,
    `tool_call:${completed.toolCallId}`,
  ]);
  return {
    recipeId: `primitive_tool:${safeSegment(completed.toolName)}:${safeSegment(completed.toolCallId)}`,
    toolFamily: 'primitive_tool',
    toolName: completed.toolName,
    topicId,
    claimId,
    inputs: {
      argsSummary: started?.argsSummary ?? '',
      cwd: completed.cwd ?? started?.cwd ?? '',
      sourceRefs,
    },
    outputs: {
      toolCallId: completed.toolCallId,
      toolName: completed.toolName,
      status: completed.status,
      isError: completed.isError,
      outputKind: completed.outputKind,
      outputSummary: completed.outputSummary,
      turnId: completed.turnId,
      ...(completed.step === undefined ? {} : { step: completed.step }),
      ...(completed.stepUuid === undefined ? {} : { stepUuid: completed.stepUuid }),
      ...(completed.durationMs === undefined ? {} : { durationMs: completed.durationMs }),
      artifactRefs: completed.artifactRefs,
      ...(completed.workFrameId === undefined ? {} : { workFrameId: completed.workFrameId }),
      ...(completed.actionCallId === undefined ? {} : { actionCallId: completed.actionCallId }),
    },
    environment: {
      captureTool: 'hakimi.primitive_tool_lifecycle',
      payloadProfile: PRIMITIVE_TOOL_LIFECYCLE_TO_TOOL_RUN_PROFILE,
      summaryInputsTrusted: false,
      canUpdateClaimTrust: false,
    },
    evidenceStatus: evidenceStatusForPrimitiveTool(completed.status),
    artifactIds: normalizeArtifactIds(completed.artifactRefs),
    sourceRefs,
  };
}

function evidenceStatusForPrimitiveTool(status: string): string {
  return status === 'failed' ? 'contradicts' : 'unreviewed';
}

function normalizeArtifactIds(refs: readonly string[]): readonly string[] {
  return refs
    .map((ref) => ref.trim())
    .filter((ref) => ref.startsWith('aitp:artifact:') || ref.startsWith('artifact:'))
    .map((ref) => ref.replace(/^aitp:artifact:/, '').replace(/^artifact:/, ''));
}

function firstClaimRef(values?: readonly string[]): string | undefined {
  for (const value of values ?? []) {
    const normalized = value.trim();
    if (normalized.startsWith('aitp:claim:')) return normalized.slice('aitp:claim:'.length);
    if (normalized.startsWith('claim:')) return normalized.slice('claim:'.length);
  }
  return undefined;
}

function firstText(...values: Array<string | undefined>): string | undefined {
  return values.find(hasText);
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0 || result.includes(normalized)) continue;
    result.push(normalized);
  }
  return result;
}

function safeSegment(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._:-]+/g, '_') || 'unknown';
}
