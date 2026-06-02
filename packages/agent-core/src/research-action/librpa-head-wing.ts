import type { ResearchActionBinding } from './types';

export const LIBRPA_HEAD_WING_ACTION_BINDINGS = [
  {
    id: 'binding.librpa-head-wing.inspect-call-sites',
    actionId: 'code.inspect_call_sites',
    domainId: 'librpa/head-wing',
    workflowId: 'workflow.librpa.head-wing.formula-code-mapping',
    priority: 'blocking',
  },
  {
    id: 'binding.librpa-head-wing.map-formula-code-region',
    actionId: 'code.map_formula_to_code_region',
    domainId: 'librpa/head-wing',
    workflowId: 'workflow.librpa.head-wing.formula-code-mapping',
    checkId: 'check.librpa-head-wing.code-mapping',
    priority: 'blocking',
  },
  {
    id: 'binding.librpa-head-wing.capture-git-diff',
    actionId: 'code.capture_git_diff_observation',
    domainId: 'librpa/head-wing',
    workflowId: 'workflow.librpa.head-wing.formula-code-mapping',
    priority: 'high',
  },
  {
    id: 'binding.librpa-head-wing.run-minimal-case',
    actionId: 'benchmark.run_minimal_case',
    domainId: 'librpa/head-wing',
    workflowId: 'workflow.librpa.head-wing.formula-code-mapping',
    checkId: 'check.librpa-head-wing.benchmark',
    adapterId: 'adapter.librpa.head-wing-smoke',
    priority: 'blocking',
  },
] as const satisfies readonly ResearchActionBinding[];

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

export function runLibrpaHeadWingSmokeBenchmark(
  input: LibrpaHeadWingSmokeBenchmarkInput,
): LibrpaHeadWingSmokeBenchmarkResult {
  const keys = [...new Set([...Object.keys(input.expected), ...Object.keys(input.observed)])].toSorted();
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

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toExponential(6);
}
