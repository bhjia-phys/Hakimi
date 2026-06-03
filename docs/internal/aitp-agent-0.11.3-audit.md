# AITP Agent 0.11.3 Audit

## Scope

This audit covers the external-job native scheduler receipt inference slice.

Implemented:

- `adapter.external.job-submission` can infer a `jobId` from common native scheduler outputs when the payload does not provide `jobId` separately;
- supported receipt patterns include SLURM (`Submitted batch job ...`), LSF (`Job <...> is submitted ...`), SGE (`Your job ... has been submitted`), and PBS/Torque/qsub single-token receipts when the backend name or command is qsub-like;
- inferred receipts add `external-job-receipt:scheduler_output` evidence;
- adapter output records `inferredJobIdFromSchedulerOutput`;
- arbitrary shell output remains unparsed, so the adapter still blocks instead of inventing a job receipt.

## Runtime Behavior

The intended external-job flow now accepts the most common native-tool shape:

```text
ResearchAction.plan_primitive_tools(benchmark.submit_external_job)
-> native Bash/MCP/remote runner submits the job
-> native tool returns schedulerOutput such as "Submitted batch job 4242"
-> ResearchAction.run_benchmark_adapter(adapter.external.job-submission)
-> adapter infers job:4242 only from a recognized scheduler receipt
-> ResearchLedger.capture_event records the normalized receipt
-> ResearchAction.finish_action_call records primitive ids and ledger/adapter evidence refs
```

This improves the naturalness of queued/HPC research workflows without moving scheduler execution into `ResearchAction`. The native execution layer still performs submission; the adapter only validates and normalizes the receipt.

## Covered Cases

The focused tests prove:

- explicit native scheduler receipts still normalize as passing submissions;
- SLURM, LSF, and PBS/qsub-like outputs can infer job ids;
- unrecognized shell output does not infer a job id;
- a `schedulerOutput`-only SLURM payload passes the adapter and records `job:4242`;
- the model-facing `ResearchAction.run_benchmark_adapter` path can normalize a payload that provides scheduler output but no separate `jobId`.

## Verification

Focused adapter and ResearchAction tool tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/benchmark-adapter/external-job-submission.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
```

Result:

- 2 test files passed.
- 19 tests passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/benchmark-adapter/external-job-submission.ts packages/agent-core/test/benchmark-adapter/external-job-submission.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
```

Result: 0 warnings, 0 errors.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Diff check:

```powershell
git diff --check
```

Result: no whitespace errors. Git reported the usual Windows LF-to-CRLF working-copy warnings.

Environment note: pnpm commands emitted the known Node engine warning because the local runtime is Node v24.14.0 while the package requests `>=24.15.0`.

## Follow-Ups

The next useful external-job slice is a deployment-specific connector that captures richer remote-runner metadata, such as working directory, submitted script snapshot, queued artifact paths, and follow-up polling instructions. That connector should remain outside `ResearchAction`; this adapter remains the pure receipt normalization boundary.
