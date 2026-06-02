import type { ResearchActionBinding } from './types';
export {
  LIBRPA_HEAD_WING_SMOKE_ACTION_ID,
  LIBRPA_HEAD_WING_SMOKE_ADAPTER_ID,
  LIBRPA_HEAD_WING_SMOKE_BENCHMARK_ADAPTER,
  LIBRPA_HEAD_WING_SMOKE_CHECK_ID,
  LIBRPA_HEAD_WING_SMOKE_DOMAIN,
  runLibrpaHeadWingSmokeBenchmark,
  type LibrpaHeadWingSmokeBenchmarkInput,
  type LibrpaHeadWingSmokeBenchmarkResult,
} from '../benchmark-adapter';

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
