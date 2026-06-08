import type { WorkFrame } from '../research-action';
import type { CompiledAitpProcessGraphSlice } from './types';

export interface AitpCuratedRagMomentInput {
  readonly prompt: readonly { readonly type?: string | undefined; readonly text?: string | undefined }[];
  readonly workFrame: WorkFrame;
  readonly aitp?: CompiledAitpProcessGraphSlice | undefined;
}

export interface AitpCuratedRagMoment {
  readonly query: string;
  readonly reasons: readonly AitpCuratedRagMomentReason[];
  readonly resultRole: 'heuristic_context';
  readonly readSurfaceEffect: 'orientation_only';
}

export type AitpCuratedRagMomentReason =
  | 'conceptual_scaffolding'
  | 'literature_orientation'
  | 'derivation_scaffolding'
  | 'method_selection'
  | 'source_backtrace_suggestions';

const MAX_QUERY_CHARS = 640;

const REASON_KEYWORDS: readonly {
  readonly reason: AitpCuratedRagMomentReason;
  readonly needles: readonly string[];
}[] = [
  {
    reason: 'conceptual_scaffolding',
    needles: [
      'explain',
      'concept',
      'intuition',
      'from scratch',
      'background',
      '\u89e3\u91ca',
      '\u6982\u5ff5',
      '\u76f4\u89c9',
      '\u4ece\u5934',
      '\u80cc\u666f',
    ],
  },
  {
    reason: 'literature_orientation',
    needles: [
      'literature',
      'paper',
      'review',
      'lecture',
      'textbook',
      'read',
      '\u6587\u732e',
      '\u8bba\u6587',
      '\u7efc\u8ff0',
      '\u8bb2\u4e49',
      '\u6559\u6750',
      '\u9605\u8bfb',
    ],
  },
  {
    reason: 'derivation_scaffolding',
    needles: [
      'derive',
      'derivation',
      'equation',
      '\u63a8\u5bfc',
      '\u65b9\u7a0b',
    ],
  },
  {
    reason: 'method_selection',
    needles: ['method', 'approach', 'route', '\u65b9\u6cd5', '\u601d\u8def', '\u8def\u7ebf'],
  },
  {
    reason: 'source_backtrace_suggestions',
    needles: [
      'source',
      'citation',
      'backtrace',
      'dependency',
      'provenance',
      'claim support',
      'support a claim',
      'claim-relevant',
      'promote',
      'promotion',
      'evidence',
      '\u6765\u6e90',
      '\u5f15\u7528',
      '\u56de\u6eaf',
      '\u6eaf\u6e90',
      '\u4f9d\u8d56',
      '\u8bc1\u636e',
      '\u652f\u6301 claim',
      '\u652f\u6301\u8fd9\u4e2a claim',
      '\u63d0\u5347',
    ],
  },
];

const CONTINUATION_KEYWORDS = [
  'continue',
  'next',
  'go on',
  'carry on',
  '\u7ee7\u7eed',
  '\u63a5\u7740',
  '\u4e0b\u4e00\u6b65',
] as const;

export function detectAitpCuratedRagMoment(
  input: AitpCuratedRagMomentInput,
): AitpCuratedRagMoment | undefined {
  const promptText = promptTextForDetection(input.prompt);
  if (promptText.length === 0) return undefined;

  const promptReasons = detectReasons(promptText);
  const frameText = [input.workFrame.domain, input.workFrame.topic, input.workFrame.goal].join(' ');
  const frameReasons = detectReasons(frameText);
  const aitpReasons = detectAitpReasons(input.aitp);
  const continuation = hasAny(normalize(promptText), CONTINUATION_KEYWORDS);
  const reasons = uniqueReasons([
    ...promptReasons,
    ...(promptReasons.length > 0 || continuation ? frameReasons : []),
    ...(promptReasons.length > 0 || continuation ? aitpReasons : []),
  ]);

  if (promptReasons.length === 0 && !(continuation && reasons.length > 0)) {
    return undefined;
  }

  return {
    query: buildQuery(input, promptText, reasons),
    reasons,
    resultRole: 'heuristic_context',
    readSurfaceEffect: 'orientation_only',
  };
}

function detectAitpReasons(
  aitp: CompiledAitpProcessGraphSlice | undefined,
): readonly AitpCuratedRagMomentReason[] {
  if (aitp === undefined) return [];
  const reasons: AitpCuratedRagMomentReason[] = [];
  if (
    aitp.sourceAssets.all.length > 0 ||
    aitp.sourceStackCoverage.evidenceGaps.length > 0 ||
    aitp.sourceReconstructionReview.pending.length > 0 ||
    aitp.provenance.source.length > 0
  ) {
    reasons.push('source_backtrace_suggestions', 'literature_orientation');
  }
  const obligations = [
    ...aitp.obligations.blocking,
    ...aitp.obligations.recommended,
    ...aitp.obligations.advisory,
  ];
  if (obligations.some((item) => hasAny(item.reason.toLowerCase(), ['derive', 'proof']))) {
    reasons.push('derivation_scaffolding');
  }
  if (aitp.contextLines.some((line) => hasAny(line.toLowerCase(), ['definition', 'relation']))) {
    reasons.push('conceptual_scaffolding');
  }
  return uniqueReasons(reasons);
}

function detectReasons(text: string): readonly AitpCuratedRagMomentReason[] {
  const normalized = normalize(text);
  return REASON_KEYWORDS
    .filter((entry) => hasAny(normalized, entry.needles))
    .map((entry) => entry.reason);
}

function buildQuery(
  input: AitpCuratedRagMomentInput,
  promptText: string,
  reasons: readonly AitpCuratedRagMomentReason[],
): string {
  const parts = [
    `prompt: ${promptText}`,
    `topic: ${input.workFrame.topic}`,
    `goal: ${input.workFrame.goal}`,
    reasons.length === 0 ? undefined : `rag_use: ${reasons.join(', ')}`,
    firstNonEmpty(input.aitp?.contextLines),
  ].filter((part): part is string => part !== undefined && part.trim().length > 0);
  return compact(parts.join(' | '), MAX_QUERY_CHARS);
}

function promptTextForDetection(
  prompt: readonly { readonly type?: string | undefined; readonly text?: string | undefined }[],
): string {
  return prompt
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join(' ')
    .trim();
}

function normalize(input: string): string {
  return input.replaceAll(/\s+/g, ' ').trim().toLowerCase();
}

function compact(input: string, maxChars: number): string {
  const normalized = input.replaceAll(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 15).trimEnd()}...[truncated]`;
}

function firstNonEmpty(values: readonly string[] | undefined): string | undefined {
  return values?.find((value) => value.trim().length > 0);
}

function hasAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function uniqueReasons(
  values: readonly AitpCuratedRagMomentReason[],
): readonly AitpCuratedRagMomentReason[] {
  return values.filter((value, index, array) => array.indexOf(value) === index);
}
