# AITP Agent 0.0.6 Audit

## Scope

This audit covers the first LibRPA head-wing micro vertical slice.

Implemented areas:

- LibRPA-specific default research actions:
  - `code.inspect_call_sites`;
  - `code.map_formula_to_code_region`;
  - `code.capture_git_diff_observation`;
  - `benchmark.run_minimal_librpa_case`;
- domain tagging for the LibRPA actions through `domains: ['librpa']`;
- a deterministic local `runLibrpaHeadWingSmokeBenchmark` stand-in for CI-safe smoke validation;
- integration coverage that connects:
  - action registry;
  - scheduler ordering;
  - controlled failure capture;
  - harness candidate conversion.

## Runtime Behavior

The LibRPA micro slice proves the runtime path without depending on external LibRPA binaries or remote HPC.

The intended trace is:

```text
WorkFrame: librpa/head-wing
-> code.inspect_call_sites
-> code.map_formula_to_code_region
-> code.capture_git_diff_observation
-> benchmark.run_minimal_librpa_case
-> failure_observation or benchmark_observation
-> harness candidate when failed/inconclusive
```

The local smoke benchmark compares expected and observed head/wing observables with a tolerance and returns:

- `pass` when all absolute differences are within tolerance;
- `fail` with failing keys and max absolute difference otherwise.

## Boundaries

This slice intentionally does not yet implement:

- real LibRPA execution;
- remote Slurm/HPC orchestration;
- automatic git diff capture;
- a full formula-code graph;
- promotion of benchmark observations into trusted physics memory.

Those remain future LibRPA vertical work.

## Verification

Focused LibRPA tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/integration/librpa-head-wing.test.ts packages/agent-core/test/research-action/scheduler.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
```

Result:

- 3 test files passed.
- 10 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/research-action/librpa-head-wing.ts packages/agent-core/src/research-action/default-actions.ts packages/agent-core/src/research-action/index.ts packages/agent-core/test/integration/librpa-head-wing.test.ts
```

Result: 0 warnings, 0 errors.

Broader suite:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 177 test files passed.
- 1 test file skipped.
- 2299 tests passed.
- 7 tests skipped.
- 1 todo remains.

Node warning:

- The local environment is Node `v24.14.0`.
- Package metadata requests Node `>=24.15.0`.
- Commands were run with `--config.engine-strict=false`, as in the earlier audits.
