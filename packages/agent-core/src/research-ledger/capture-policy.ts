import type { PhysicsCapsuleKind, PhysicsDomainId } from '../physics-memory';
import type {
  ResearchLedgerEventId,
  ResearchLedgerEventType,
  ResearchTopicId,
} from './types';
import { stablePathSlug, type ResearchLedgerWriteInput } from './writer';

const MAX_INLINE_CAPTURE_BODY_CHARS = 4000;

export const RESEARCH_CAPTURE_CLASSES = [
  'source_excerpt',
  'git_diff_observation',
  'benchmark_observation',
  'failure_observation',
] as const;

export type ResearchCaptureClass = (typeof RESEARCH_CAPTURE_CLASSES)[number];

export interface ResearchCapturePolicyInput {
  readonly captureClass: ResearchCaptureClass;
  readonly topic: ResearchTopicId;
  readonly domain: PhysicsDomainId;
  readonly title: string;
  readonly body?: string | undefined;
  readonly eventId?: ResearchLedgerEventId | undefined;
  readonly sourceRefs?: readonly string[] | undefined;
  readonly artifactRefs?: readonly string[] | undefined;
  readonly dependsOn?: readonly ResearchLedgerEventId[] | undefined;
  readonly candidateCapsuleKind?: PhysicsCapsuleKind | undefined;
  readonly openQuestions?: readonly string[] | undefined;
  readonly relatedObjects?: readonly string[] | undefined;
  readonly createdAt?: string | undefined;
}

export interface ResearchCaptureDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
}

export interface ResearchCaptureDecision {
  readonly capture: boolean;
  readonly eventType: ResearchLedgerEventType;
  readonly diagnostics: readonly ResearchCaptureDiagnostic[];
  readonly writeInput?: Omit<ResearchLedgerWriteInput, 'root'> | undefined;
}

export function buildResearchCaptureDecision(
  input: ResearchCapturePolicyInput,
): ResearchCaptureDecision {
  const diagnostics: ResearchCaptureDiagnostic[] = [];
  const eventType = eventTypeForCaptureClass(input.captureClass);
  const sourceRefs = compactStrings(input.sourceRefs);
  const artifactRefs = compactStrings(input.artifactRefs);
  const body = input.body?.trim() ?? '';

  if (sourceRefs.length === 0 && artifactRefs.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'missing-provenance',
      message: 'Controlled capture requires sourceRefs or artifactRefs.',
    });
  }
  if (body.length === 0 && artifactRefs.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'missing-body-or-artifact',
      message: 'Controlled capture requires a compact body or artifact refs.',
    });
  }
  if (body.length > MAX_INLINE_CAPTURE_BODY_CHARS && artifactRefs.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'long-output-needs-artifact-ref',
      message: `Inline capture bodies longer than ${String(MAX_INLINE_CAPTURE_BODY_CHARS)} characters require artifactRefs.`,
    });
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { capture: false, eventType, diagnostics };
  }

  const eventId =
    input.eventId ??
    `event.${stablePathSlug(input.topic, 'topic')}.${input.captureClass}.${stableCaptureIdFragment(
      input.title,
    )}`;
  const renderedBody = renderCaptureBody({
    title: input.title,
    body,
    artifactRefs,
  });
  return {
    capture: true,
    eventType,
    diagnostics,
    writeInput: {
      metadata: {
        id: eventId,
        type: eventType,
        topic: input.topic,
        domain: input.domain,
        status: 'captured',
        sourceRefs: [...sourceRefs, ...artifactRefs],
        dependsOn: input.dependsOn ?? [],
        candidateCapsuleKind: input.candidateCapsuleKind,
        openQuestions: input.openQuestions ?? [],
        relatedObjects: input.relatedObjects ?? [],
        createdAt: input.createdAt,
      },
      body: renderedBody,
    },
  };
}

export function eventTypeForCaptureClass(
  captureClass: ResearchCaptureClass,
): ResearchLedgerEventType {
  switch (captureClass) {
    case 'source_excerpt':
      return 'source_excerpt';
    case 'git_diff_observation':
      return 'git_diff_observation';
    case 'benchmark_observation':
      return 'benchmark_observation';
    case 'failure_observation':
      return 'failure_observation';
  }
}

function renderCaptureBody(input: {
  readonly title: string;
  readonly body: string;
  readonly artifactRefs: readonly string[];
}): string {
  const lines = [`# ${input.title.trim()}`, ''];
  if (input.body.length > 0) {
    lines.push(input.body, '');
  }
  if (input.artifactRefs.length > 0) {
    lines.push('## Artifact Refs', '');
    for (const ref of input.artifactRefs) {
      lines.push(`- ${ref}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function compactStrings(values: readonly string[] | undefined): readonly string[] {
  if (values === undefined) return [];
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

function stableCaptureIdFragment(value: string): string {
  const slug = value
    .trim()
    .replaceAll(/[^A-Za-z0-9._-]+/g, '-')
    .replaceAll(/^[._-]+|[._-]+$/g, '');
  return slug.length === 0 ? 'capture' : slug;
}
