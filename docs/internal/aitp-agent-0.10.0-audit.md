# AITP Agent 0.10.0 Audit

## Scope

This audit covers the action-executor and session write-isolation slice.

Implemented:

- `Agent` and `Session` now carry a shared `BenchmarkAdapterRegistry`, defaulting to the LibRPA head-wing smoke adapter registry;
- `ResearchActionManager` exposes narrow in-process executor methods for benchmark adapters, physics graph construction, and formalization plans;
- `ResearchActionTool` can execute:
  - `run_benchmark_adapter`,
  - `query_physics_graph`,
  - `build_formalization_plan`;
- executed research actions are recorded through the existing `research_action.result_recorded` wire path;
- `formalization.build_blueprint` is now a default deferred research action;
- harness candidate eval writeback can namespace generated eval ids and paths by `sessionId`.

## Runtime Behavior

The model-facing `ResearchAction` tool now has a small execution surface for deterministic in-process research operations:

```text
ResearchAction tool
-> ResearchActionManager
-> BenchmarkAdapterRegistry | PhysicsGraph | FormalizationPlan
-> research_action.result_recorded
-> final-gate evidence scope
```

This deliberately does not execute shell, git, web, MCP, or HPC work. Primitive tool work remains separately attributed through the existing tool lifecycle and research-action result records. The new executor path is for pure graph/formalization kernels and registered benchmark adapter contracts only.

## Covered Cases

The focused tests prove:

- `ResearchAction` can run `adapter.librpa.head-wing-smoke` and record benchmark evidence;
- `ResearchAction` can run a physics graph dependency-closure query over the active `PhysicsMemoryRegistry`;
- `ResearchAction` can export a formalization blueprint while keeping `formalization_ready` distinct from `formalized`;
- harness candidate eval writes can include a session namespace, producing separate eval ids and files for the same failure trace in different sessions.

## Boundaries

This slice does not make `ResearchAction` a universal task runner. It still does not execute arbitrary primitive tools. It also does not call Lean, OMDoc, remote LibRPA, or HPC schedulers. Those remain future adapters or external systems.

The session namespace is a collision-avoidance mechanism for eval writeback, not a full transactional database lock. It prevents deterministic same-candidate path collisions across sessions that opt into `sessionId`.

## Verification

Focused executor/write-isolation tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/research-harness/writer.test.ts packages/agent-core/test/research-action/default-actions.test.ts
```

Result:

- 3 test files passed.
- 18 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/agent/index.ts packages/agent-core/src/session/index.ts packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/src/research-action/default-actions.ts packages/agent-core/src/research-harness/writer.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/research-harness/writer.test.ts packages/agent-core/test/research-action/default-actions.test.ts
```

Result: 0 warnings, 0 errors.

Broad agent-core regression:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 203 test files passed.
- 1 test file skipped.
- 2361 tests passed.
- 6 tests skipped.
- 1 test marked todo.

An initial broad run had one transient failure in `test/agent/turn.test.ts` for the same-step duplicate `PostToolUse` hook assertion. The individual test passed on rerun, and the full agent-core suite passed on the next run.

Broad typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Broad lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint --type-aware
```

Result: 336 warnings, 0 errors. The warnings are the repository's pre-existing warning set; the focused lint gate for the new 0.10.0 paths is clean.

Environment note: commands emitted the known Node engine warning because the local runtime is Node v24.14.0 while the package requests `>=24.15.0`.

## Follow-Ups

Future slices can attach external executor backends behind the same adapter boundary. The next useful step is to add a live turn-level test where a WorkFrame context injection exposes `ResearchAction`, the model invokes one of these deterministic executors, and the final gate accepts only evidence scoped to that WorkFrame.
