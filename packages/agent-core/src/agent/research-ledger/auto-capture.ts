import type {
  ResearchCaptureClass,
  ResearchCaptureDiagnostic,
} from '../../research-ledger';
import { buildResearchCaptureDecision } from '../../research-ledger';
import type { PrimitiveToolLifecycleEnvelope } from '../tool-lifecycle';
import type { WorkFrame } from '../../research-action';

const BENCHMARK_HINTS = ['benchmark', 'pytest', 'vitest', 'ctest', 'smoke test', 'test passed'];
const LOW_VALUE_TOOL_NAMES = new Set(['Read', 'LS', 'Glob', 'Grep', 'Find']);
const SKIP_TOOL_NAMES = new Set(['ResearchLedger', 'ResearchAction', 'PhysicsMemory']);

export interface ToolLifecycleAutoCaptureResult {
  readonly capture: boolean;
  readonly captureClass?: ResearchCaptureClass | undefined;
  readonly title?: string | undefined;
  readonly diagnostics: readonly ResearchCaptureDiagnostic[];
  readonly skipReason?: string | undefined;
  readonly writeInput?: ReturnType<typeof buildResearchCaptureDecision>['writeInput'] | undefined;
}

export function buildToolLifecycleAutoCaptureResult(input: {
  readonly envelope: PrimitiveToolLifecycleEnvelope;
  readonly workFrame?: WorkFrame | undefined;
}): ToolLifecycleAutoCaptureResult {
  const { envelope, workFrame } = input;
  const completed = envelope.completed;
  if (SKIP_TOOL_NAMES.has(completed.toolName)) {
    return skipped('semantic-tool');
  }
  if (isAitpMcpTool(completed.toolName)) {
    return skipped('aitp-canonical-context-surface');
  }
  if (workFrame === undefined) {
    return skipped('missing-workframe');
  }

  const captureClass = inferCaptureClass(envelope);
  if (captureClass === undefined) {
    return skipped('low-value-tool-output');
  }

  const sourceRefs = deriveSourceRefs(envelope, workFrame, captureClass);
  const artifactRefs = completed.artifactRefs;
  const title = buildCaptureTitle(envelope, workFrame, captureClass);
  const body = buildCaptureBody(envelope, workFrame, captureClass);
  const decision = buildResearchCaptureDecision({
    captureClass,
    topic: workFrame.topic,
    domain: workFrame.domain,
    title,
    body,
    sourceRefs,
    artifactRefs,
    relatedObjects: deriveRelatedObjects(envelope, workFrame, captureClass),
    openQuestions: deriveOpenQuestions(envelope, captureClass),
    candidateCapsuleKind: deriveCandidateCapsuleKind(captureClass),
  });

  if (decision.capture !== true || decision.writeInput === undefined) {
    return {
      capture: false,
      captureClass,
      title,
      diagnostics: decision.diagnostics,
      skipReason: 'capture-policy-rejected',
    };
  }

  return {
    capture: true,
    captureClass,
    title,
    diagnostics: decision.diagnostics,
    writeInput: decision.writeInput,
  };
}

function inferCaptureClass(
  envelope: PrimitiveToolLifecycleEnvelope,
): ResearchCaptureClass | undefined {
  const { completed, started } = envelope;
  const haystack = `${started?.argsSummary ?? ''}\n${completed.outputSummary}`.toLowerCase();

  if (completed.status === 'failed') return 'failure_observation';
  if (haystack.includes('git diff') || haystack.includes('diff --git')) {
    return 'git_diff_observation';
  }
  if (BENCHMARK_HINTS.some((hint) => haystack.includes(hint))) {
    return 'benchmark_observation';
  }
  if (hasSourceLikeReference(haystack)) {
    return 'source_excerpt';
  }
  if (LOW_VALUE_TOOL_NAMES.has(completed.toolName) && completed.artifactRefs.length === 0) {
    return undefined;
  }
  return undefined;
}

function deriveSourceRefs(
  envelope: PrimitiveToolLifecycleEnvelope,
  workFrame: WorkFrame,
  captureClass: ResearchCaptureClass,
): readonly string[] {
  const refs = new Set<string>([
    `tool:${envelope.completed.toolName}`,
    `tool_call:${envelope.completed.toolCallId}`,
  ]);
  if (captureClass === 'git_diff_observation') {
    refs.add(`git:tool-call:${envelope.completed.toolCallId}`);
  }
  if (captureClass === 'benchmark_observation') {
    refs.add(`benchmark:tool-call:${envelope.completed.toolCallId}`);
  }
  if (captureClass === 'failure_observation') {
    refs.add(`failure:tool-call:${envelope.completed.toolCallId}`);
  }
  for (const ref of workFrame.sourceRefs) {
    refs.add(ref);
  }
  for (const ref of extractRefs(`${envelope.started?.argsSummary ?? ''}\n${envelope.completed.outputSummary}`)) {
    refs.add(ref);
  }
  return [...refs];
}

function deriveRelatedObjects(
  envelope: PrimitiveToolLifecycleEnvelope,
  workFrame: WorkFrame,
  captureClass: ResearchCaptureClass,
): readonly string[] {
  const related = new Set<string>(workFrame.activeObjectIds);
  if (captureClass === 'git_diff_observation') {
    related.add(`tool-call:${envelope.completed.toolCallId}`);
  }
  return [...related];
}

function deriveOpenQuestions(
  envelope: PrimitiveToolLifecycleEnvelope,
  captureClass: ResearchCaptureClass,
): readonly string[] {
  if (captureClass === 'failure_observation') {
    return [`Why did ${envelope.completed.toolName} fail in this WorkFrame?`];
  }
  if (captureClass === 'git_diff_observation') {
    return ['Check downstream call sites and affected mappings.'];
  }
  if (captureClass === 'benchmark_observation') {
    return ['Confirm whether this benchmark result satisfies the required tolerance and regime.'];
  }
  return [];
}

function deriveCandidateCapsuleKind(
  captureClass: ResearchCaptureClass,
): 'BenchmarkCase' | 'FailureMode' | 'CodeMapping' | 'Definition' {
  switch (captureClass) {
    case 'benchmark_observation':
      return 'BenchmarkCase';
    case 'failure_observation':
      return 'FailureMode';
    case 'git_diff_observation':
      return 'CodeMapping';
    case 'source_excerpt':
      return 'Definition';
  }
}

function buildCaptureTitle(
  envelope: PrimitiveToolLifecycleEnvelope,
  workFrame: WorkFrame,
  captureClass: ResearchCaptureClass,
): string {
  const topic = workFrame.topic.replaceAll(/[-_]+/g, ' ').trim();
  switch (captureClass) {
    case 'git_diff_observation':
      return `${topic} ${envelope.completed.toolName} diff observation`;
    case 'benchmark_observation':
      return `${topic} benchmark observation`;
    case 'failure_observation':
      return `${topic} tool failure`;
    case 'source_excerpt':
      return `${topic} source excerpt`;
  }
}

function buildCaptureBody(
  envelope: PrimitiveToolLifecycleEnvelope,
  workFrame: WorkFrame,
  captureClass: ResearchCaptureClass,
): string {
  const lines = [
    `WorkFrame: ${workFrame.id}`,
    `Tool: ${envelope.completed.toolName}`,
    `Tool Call: ${envelope.completed.toolCallId}`,
  ];
  if (envelope.started?.description !== undefined) {
    lines.push(`Description: ${envelope.started.description}`);
  }
  if (envelope.started?.argsSummary !== undefined && envelope.started.argsSummary.length > 0) {
    lines.push('', '## Args Summary', '', envelope.started.argsSummary);
  }
  lines.push('', '## Output Summary', '', envelope.completed.outputSummary || '[empty]');
  if (captureClass === 'failure_observation') {
    lines.push('', '## Failure Status', '', `status=${envelope.completed.status}`);
  }
  return lines.join('\n').trimEnd();
}

function extractRefs(text: string): readonly string[] {
  const refs = new Set<string>();
  const urlMatches = text.matchAll(/\bhttps?:\/\/[^\s)]+/gi);
  for (const match of urlMatches) refs.add(match[0]);
  const arxivMatches = text.matchAll(/\barxiv:\s*[0-9]{4}\.[0-9]{4,5}(?:v\d+)?\b/gi);
  for (const match of arxivMatches) refs.add(match[0].replaceAll(/\s+/g, ''));
  const doiMatches = text.matchAll(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi);
  for (const match of doiMatches) refs.add(`doi:${match[0]}`);
  return [...refs];
}

function hasSourceLikeReference(text: string): boolean {
  return extractRefs(text).length > 0;
}

function isAitpMcpTool(toolName: string): boolean {
  return toolName.startsWith('mcp__aitp__');
}

function skipped(skipReason: string): ToolLifecycleAutoCaptureResult {
  return {
    capture: false,
    diagnostics: [],
    skipReason,
  };
}
