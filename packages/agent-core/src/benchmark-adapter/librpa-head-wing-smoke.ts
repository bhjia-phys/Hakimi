import type { ResearchEvalCheckResult } from '../research-harness';
import type {
  BenchmarkAdapter,
  BenchmarkAdapterRunInput,
  BenchmarkAdapterRunResult,
} from './types';

export const LIBRPA_HEAD_WING_SMOKE_ADAPTER_ID = 'adapter.librpa.head-wing-smoke';
export const LIBRPA_HEAD_WING_SMOKE_DOMAIN = 'librpa/head-wing';
export const LIBRPA_HEAD_WING_SMOKE_ACTION_ID = 'benchmark.run_minimal_case';
export const LIBRPA_HEAD_WING_SMOKE_CHECK_ID = 'check.librpa-head-wing.benchmark';
export const DEFAULT_LIBRPA_HEAD_WING_SMOKE_CASE_ID = 'case.librpa.head-wing-smoke';

export interface LibrpaHeadWingSmokeBenchmarkInput {
  readonly expected: Readonly<Record<string, number>>;
  readonly observed: Readonly<Record<string, number>>;
  readonly tolerance: number;
}

export interface LibrpaHeadWingSmokeBenchmarkResult {
  readonly outcome: 'pass' | 'fail';
  readonly maxAbsDiff: number;
  readonly failingKeys: readonly string[];
  readonly observation: string;
}

export const LIBRPA_HEAD_WING_SMOKE_BENCHMARK_ADAPTER: BenchmarkAdapter = {
  id: LIBRPA_HEAD_WING_SMOKE_ADAPTER_ID,
  title: 'LibRPA head-wing deterministic smoke benchmark',
  domain: LIBRPA_HEAD_WING_SMOKE_DOMAIN,
  supportedActionIds: [LIBRPA_HEAD_WING_SMOKE_ACTION_ID],
  run(input: BenchmarkAdapterRunInput): BenchmarkAdapterRunResult {
    const caseId = input.caseId ?? DEFAULT_LIBRPA_HEAD_WING_SMOKE_CASE_ID;
    const evidenceRefs = [
      `benchmark:${caseId}`,
      LIBRPA_HEAD_WING_SMOKE_ADAPTER_ID,
      ...(input.sourceRefs ?? []),
    ];
    const parsed = parseLibrpaHeadWingSmokePayload(input.payload);
    if (parsed === undefined) {
      return {
        adapterId: LIBRPA_HEAD_WING_SMOKE_ADAPTER_ID,
        caseId,
        domain: LIBRPA_HEAD_WING_SMOKE_DOMAIN,
        actionId: LIBRPA_HEAD_WING_SMOKE_ACTION_ID,
        outcome: 'blocked',
        observation:
          'LibRPA head-wing smoke benchmark blocked; payload must provide expected, observed, and positive finite tolerance.',
        output: { validationError: 'invalid-librpa-head-wing-smoke-payload' },
        evidenceRefs,
        artifactRefs: [],
        checkResults: [checkResult('missing', evidenceRefs)],
      };
    }

    const result = runLibrpaHeadWingSmokeBenchmark(parsed);
    return {
      adapterId: LIBRPA_HEAD_WING_SMOKE_ADAPTER_ID,
      caseId,
      domain: LIBRPA_HEAD_WING_SMOKE_DOMAIN,
      actionId: LIBRPA_HEAD_WING_SMOKE_ACTION_ID,
      outcome: result.outcome,
      observation: result.observation,
      output: result,
      evidenceRefs,
      artifactRefs: [],
      checkResults: [checkResult(result.outcome === 'pass' ? 'passed' : 'failed', evidenceRefs)],
    };
  },
};

export function runLibrpaHeadWingSmokeBenchmark(
  input: LibrpaHeadWingSmokeBenchmarkInput,
): LibrpaHeadWingSmokeBenchmarkResult {
  const keys = [...new Set([...Object.keys(input.expected), ...Object.keys(input.observed)])]
    .toSorted();
  let maxAbsDiff = 0;
  const failingKeys: string[] = [];
  for (const key of keys) {
    const expected = input.expected[key] ?? 0;
    const observed = input.observed[key] ?? 0;
    const diff = Math.abs(observed - expected);
    maxAbsDiff = Math.max(maxAbsDiff, diff);
    if (diff > input.tolerance) failingKeys.push(key);
  }
  const outcome = failingKeys.length === 0 ? 'pass' : 'fail';
  return {
    outcome,
    maxAbsDiff,
    failingKeys,
    observation:
      outcome === 'pass'
        ? `LibRPA head-wing smoke benchmark passed; max_abs_diff=${formatNumber(maxAbsDiff)}.`
        : `LibRPA head-wing smoke benchmark failed for ${failingKeys.join(', ')}; max_abs_diff=${formatNumber(maxAbsDiff)}.`,
  };
}

function parseLibrpaHeadWingSmokePayload(
  value: unknown,
): LibrpaHeadWingSmokeBenchmarkInput | undefined {
  if (!isRecord(value)) return undefined;
  const expected = numericRecord(value['expected']);
  const observed = numericRecord(value['observed']);
  const tolerance = value['tolerance'];
  if (expected === undefined || observed === undefined) return undefined;
  if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance <= 0) {
    return undefined;
  }
  return { expected, observed, tolerance };
}

function numericRecord(value: unknown): Readonly<Record<string, number>> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'number' || !Number.isFinite(item)) return undefined;
    out[key] = item;
  }
  return out;
}

function checkResult(
  status: ResearchEvalCheckResult['status'],
  evidenceRefs: readonly string[],
): ResearchEvalCheckResult {
  return {
    checkId: LIBRPA_HEAD_WING_SMOKE_CHECK_ID,
    kind: 'benchmark',
    status,
    evidenceRefs,
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toExponential(6);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
