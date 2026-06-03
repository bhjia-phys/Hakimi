# AITP Agent 0.11.1 Audit

## Scope

This audit covers the external job submission adapter-contract slice.

Implemented:

- `adapter.external.job-submission` is now a default `BenchmarkAdapter`;
- the adapter supports the semantic action `benchmark.submit_external_job`;
- the adapter normalizes scheduler/MCP/HPC/manual submission receipts into `BenchmarkAdapterRunResult`;
- submitted jobs produce `pass` with `job:<id>`, backend, job-script, artifact, and source evidence refs;
- prepared dry-runs produce `inconclusive` while check status stays `missing`, matching existing harness status types;
- malformed payloads produce `blocked` instead of inventing a job receipt;
- `benchmark.submit_external_job` primitive plans now include a `normalize-submission` step that calls `ResearchAction.run_benchmark_adapter` after native submission.

## Runtime Behavior

The intended external-job flow is now:

```text
ResearchAction.plan_primitive_tools(benchmark.submit_external_job)
-> native Kimi Read/Grep inspects job inputs
-> native Kimi Bash or deployment-specific MCP/HPC tool submits or prepares the job
-> ResearchAction.run_benchmark_adapter(adapter.external.job-submission) normalizes the receipt
-> ResearchLedger.capture_event writes compact job evidence
-> ResearchAction.finish_action_call records primitive ids and ledger/adapter evidence refs
```

This keeps the important boundary intact: `ResearchAction` still does not execute shell, MCP, or HPC work. It only runs a pure adapter that validates and normalizes evidence produced by the native execution layer.

## Covered Cases

The focused tests prove:

- a native scheduler receipt with `jobId`, backend descriptor, script, artifact refs, and ledger refs becomes a passing external-job adapter result;
- a dry-run/prepared payload remains inconclusive until an actual scheduler receipt exists;
- invalid payloads are blocked and do not create fake submission evidence;
- the default `ResearchActionTool.run_benchmark_adapter` path can call `adapter.external.job-submission` and record `benchmark.submit_external_job` evidence through `research_action.result_recorded`;
- the `benchmark.submit_external_job` primitive plan advertises the receipt-normalization adapter step.

## Verification

Focused external-job adapter tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/benchmark-adapter/external-job-submission.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
```

Result:

- 3 test files passed.
- 20 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/benchmark-adapter/external-job-submission.ts packages/agent-core/src/benchmark-adapter/default-adapters.ts packages/agent-core/src/benchmark-adapter/index.ts packages/agent-core/src/research-action/primitive-plan.ts packages/agent-core/test/benchmark-adapter/external-job-submission.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
```

Result: 0 warnings, 0 errors.

Environment note: commands emitted the known Node engine warning because the local runtime is Node v24.14.0 while the package requests `>=24.15.0`.

## Follow-Ups

The next useful slice is a real deployment-specific connector that can populate this adapter payload from an MCP scheduler tool or remote HPC runner. That connector should remain outside `ResearchAction`; this adapter is the stable receipt contract between native execution and semantic research evidence.
