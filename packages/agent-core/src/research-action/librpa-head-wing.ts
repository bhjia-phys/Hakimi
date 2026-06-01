import type { ResearchActionDefinition } from './types';

export const LIBRPA_HEAD_WING_ACTIONS = [
  {
    id: 'code.inspect_call_sites',
    category: 'code',
    exposure: 'direct',
    phase: 'code',
    title: 'Inspect call sites',
    description:
      'Inspect all call sites and downstream readers before changing a LibRPA head-wing code path.',
    inputKinds: ['CodeRegion'],
    outputKinds: ['LedgerEvent'],
    primitiveToolPolicy: 'read-only',
    domains: ['librpa'],
    triggerHints: ['head-wing', 'call site', 'downstream reference'],
    suggestedNextActions: ['code.map_formula_to_code_region'],
  },
  {
    id: 'code.map_formula_to_code_region',
    category: 'code',
    exposure: 'direct',
    phase: 'code',
    title: 'Map formula to code region',
    description:
      'Map a formula term to the concrete LibRPA code region, intermediate observable, and affected data flow.',
    inputKinds: ['Formula', 'CodeRegion'],
    outputKinds: ['CodeMapping'],
    primitiveToolPolicy: 'read-only',
    domains: ['librpa'],
    generatedObligations: [
      {
        kind: 'code_mapping',
        severity: 'blocking',
        reason: 'LibRPA formula-code mappings must be checked against call sites and observables.',
        requiredActionId: 'code.check_intermediate_observable',
      },
      {
        kind: 'benchmark',
        severity: 'important',
        reason: 'LibRPA code mappings need a smoke benchmark before validation.',
        requiredActionId: 'benchmark.run_minimal_librpa_case',
      },
    ],
    triggerHints: ['formula-code mapping', 'head-wing', 'observable'],
    suggestedNextActions: ['code.capture_git_diff_observation', 'benchmark.run_minimal_librpa_case'],
  },
  {
    id: 'code.capture_git_diff_observation',
    category: 'code',
    exposure: 'direct',
    phase: 'code',
    title: 'Capture git diff observation',
    description:
      'Capture a compact, source-backed git diff observation for a LibRPA code change.',
    inputKinds: ['CodeRegion', 'LedgerEvent'],
    outputKinds: ['LedgerEvent'],
    primitiveToolPolicy: 'git-read',
    domains: ['librpa'],
    triggerHints: ['git diff', 'head-wing', 'code observation'],
    suggestedNextActions: ['benchmark.run_minimal_librpa_case'],
  },
  {
    id: 'benchmark.run_minimal_librpa_case',
    category: 'benchmark',
    exposure: 'deferred',
    phase: 'benchmark',
    title: 'Run minimal LibRPA case',
    description:
      'Run or simulate a minimal LibRPA head-wing smoke benchmark and capture the observable result.',
    inputKinds: ['BenchmarkCase', 'CodeMapping'],
    outputKinds: ['LedgerEvent'],
    primitiveToolPolicy: 'benchmark-gated',
    domains: ['librpa'],
    triggerHints: ['smoke benchmark', 'head-wing', 'intermediate observable'],
    suggestedNextActions: ['harness.build_eval_from_failure'],
  },
] as const satisfies readonly ResearchActionDefinition[];

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
