# AITP Agent 0.11.0 Audit

## Scope

This audit covers the primitive tool plan template slice.

Implemented:

- `research-action/primitive-plan` defines `ResearchPrimitivePlanTemplate`, step-level approval classes, recording requirements, a registry, default templates, and policy fallback behavior;
- every default `ResearchAction` can now produce a primitive tool plan with native tool names, ordered steps, expected evidence, recording requirements, and follow-up actions;
- default action coverage now includes:
  - `source.search_literature` for auditable literature/source discovery,
  - `code.prepare_patch` for scoped write-gated code changes,
  - `benchmark.submit_external_job` for queued/HPC/external benchmark submission;
- `ResearchActionTool` exposes `plan_primitive_tools`, returning a structured XML-like plan for a requested `action_id`;
- `ResearchActionTool.recommend_next_actions` now includes a `primitive_tools` summary for each recommendation, using the same primitive plan registry;
- runtime tool exposure now reads `ResearchContextPack.actionBindings`, manages the native tools used by primitive plan templates, and activates only the tools required by the current research pack;
- research context reminders now render action-binding tool summaries from the same primitive plan templates and instruct the model to record primitive tool call ids back into the semantic action result;
- record restore/replay coverage now proves topic-scoped runtime overlays and WorkFrame-scoped evidence attribution survive persisted-session recovery without leaking between source-search and code-patch sessions;
- the stateless Kimi loop now supports a per-step `buildTools` hook, so host-side injection can apply dynamic tool exposure before the model-visible tool list is built;
- `ToolManager.createTurnLoopToolBuilder` freezes the turn-start base tool configuration while still applying the latest Research runtime overlay after each `beforeStep`, preserving native Kimi turn semantics;
- live agent-turn tests now cover source search, scoped code patching, and external benchmark submission through native Kimi tools with WorkFrame/ResearchAction primitive call attribution and durable `ResearchLedger.capture_event` writeback.

## Runtime Behavior

The intended flow is now:

```text
ResearchContextPack action binding
-> ResearchAction semantic action
-> primitive tool plan template
-> research context reminder and runtime tool overlay
-> turn-scoped base tool snapshot plus per-step runtime overlay
-> Kimi loop tool list rebuilt after host injection
-> native Kimi tools exposed by runtime overlay
-> primitive tool call ids and evidence refs
-> ResearchLedger.capture_event writes source/code/job evidence
-> research_ledger.event_written audit record
-> ResearchAction result record
-> AgentRecords restore/replay keeps the same WorkFrame/topic scope
```

This makes common research actions natural without moving execution into `ResearchAction`.

Examples:

- `source.search_literature` plans `WebSearch` -> `FetchURL` / `Read` -> `ResearchLedger.capture_event` -> `ResearchAction`;
- `code.prepare_patch` plans `Read` / `Grep` -> `Edit` / `Write` with `write` approval -> verification -> `ResearchLedger.capture_event` -> action attribution;
- `benchmark.submit_external_job` plans input inspection -> `Bash` or configured external execution layer with `external` approval -> `ResearchLedger.capture_event` -> job id and artifact refs recorded back into the semantic action trace.

## Boundaries

`ResearchAction` still does not execute shell, git, web, MCP, or HPC work by itself.

The new templates are planning and attribution contracts. They tell the model/controller which native tools to use, what evidence to collect, and how to record the result. Actual primitive tool execution remains in the existing Kimi tool loop, with tool lifecycle records and normal permission behavior.

`benchmark.submit_external_job` is a semantic action plus primitive plan, not a scheduler implementation. The actual scheduler command, MCP connector, remote runner, or HPC backend must still be supplied by the native execution layer or a future adapter.

Runtime tool exposure adds template-required tools to the active overlay, but it does not bypass feature flags or install missing web/MCP services. If `WebSearch` or `FetchURL` is unavailable in a deployment, the plan remains visible while the tool manager exposes only registered tools.

The loop-level change is intentionally generic: `RunTurnInput.tools` remains available for static callers, while `RunTurnInput.buildTools` lets hosts rebuild the visible tool list after `beforeStep` hooks mutate state. `TurnFlow` uses a `ToolManager` turn builder on this dynamic path, so `ResearchContextInjector` can compile a ContextPack, apply `tools.runtime_exposure`, and have the same step's LLM call see the new native tool set without letting mid-turn user/profile tool changes override the turn-start base configuration.

## Covered Cases

The focused tests prove:

- every default research action builds a primitive plan with a `ResearchAction` recording path;
- literature search plans native search/fetch tools and requires primitive tool call ids;
- scoped code patch preparation is write-gated and includes `Edit` / `Write`;
- external benchmark submission is benchmark-gated and marks the submit step as `external`;
- `ResearchActionTool.plan_primitive_tools` renders parseable plan output for source search and code patch workflows;
- `ResearchActionTool.recommend_next_actions` renders primitive tool summaries beside recommended semantic actions;
- runtime tool exposure reads action bindings and activates template tools such as `WebSearch`, `FetchURL`, `Edit`, and `Write`;
- applying a literature/source pack, then a code-patch pack, then the literature/source pack again replaces the active runtime overlay, so code-capable tools do not leak back into the theory/source topic and source/web tools do not leak into the code-patch topic.
- ContextPack injection renders a `source.search_literature` primitive-tool hint, then a `ResearchAction` call can finish with `primitiveToolCallIds` and evidence scoped to the active WorkFrame.
- separate `Agent` instances keep independent runtime tool overlays, so a code-patch session does not activate `Bash` / `Edit` in a simultaneous source-search session.
- persisted source-search and code-patch sessions replay into separate `Agent` instances with the same native-tool overlays they had before shutdown;
- restored ResearchAction evidence refs retain their original `WorkFrame` / topic / domain scope, so later evidence lookup cannot satisfy a different research topic by accident.
- loop-level `buildTools` is evaluated after `beforeStep`, proving dynamic host state can affect the same step's model-visible tools;
- `ToolManager.createTurnLoopToolBuilder` freezes turn-start base tools while still allowing Research runtime exposure to update the per-step visible list.
- a live agent turn now goes through `ResearchAction.plan_primitive_tools` -> `ResearchAction.start_action_call` -> native `WebSearch` -> native `FetchURL` -> `ResearchAction.finish_action_call`, and the WebSearch/FetchURL lifecycle records carry both `workFrameId` and `actionCallId`.
- that source-search turn now also calls native `ResearchLedger.capture_event`, writes a source-excerpt event file under the project ledger root, emits `research_ledger.event_written`, and includes the `ledger:event...` id in `ResearchAction.finish_action_call.evidence_refs`.
- a live code-patch turn goes through `ResearchAction.plan_primitive_tools` -> `ResearchAction.start_action_call` -> native `Read` -> native `Edit` -> native `Bash` verification -> native `ResearchLedger.capture_event` -> `ResearchAction.finish_action_call`, while source-search tools stay hidden from the code topic.
- a live external-job turn goes through `ResearchAction.plan_primitive_tools` -> `ResearchAction.start_action_call` -> native `Read` of job inputs -> native `Bash` submission -> native `ResearchLedger.capture_event` -> `ResearchAction.finish_action_call`, recording the job id/artifact refs without executing the submission inside `ResearchAction`.

## Verification

Focused primitive-plan and durable-capture tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/research-action/default-actions.test.ts packages/agent-core/test/research-action/records.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/agent/research-action-orchestration.test.ts packages/agent-core/test/loop/hooks.e2e.test.ts
```

Result:

- 8 test files passed.
- 58 tests passed.

Focused durable native-tool orchestration regression:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/research-action-orchestration.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/research-action/default-actions.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts packages/agent-core/test/agent/tool-exposure.test.ts
```

Result:

- 6 test files passed.
- 35 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/loop/types.ts packages/agent-core/src/loop/index.ts packages/agent-core/src/loop/run-turn.ts packages/agent-core/src/loop/turn-step.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/agent/tool/index.ts packages/agent-core/src/research-action/primitive-plan.ts packages/agent-core/src/research-action/default-actions.ts packages/agent-core/src/research-action/index.ts packages/agent-core/src/agent/tool-exposure/index.ts packages/agent-core/src/agent/workframe/context-pack.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.md packages/agent-core/test/loop/hooks.e2e.test.ts packages/agent-core/test/loop/api-shape.e2e.test.ts packages/agent-core/test/agent/harness/agent.ts packages/agent-core/test/agent/research-action-orchestration.test.ts packages/agent-core/test/agent/turn.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/research-action/default-actions.test.ts packages/agent-core/test/research-action/records.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/agent/research-context.test.ts
```

Result: 0 warnings, 0 errors.

Broad agent-core regression:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 205 test files passed.
- 1 test file skipped.
- 2378 tests passed.
- 6 tests skipped.
- 1 test marked todo.

Broad type-aware lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint --type-aware
```

Result: 336 warnings, 0 errors. The warnings are the repository's pre-existing warning set; the focused lint gate for the new 0.11.0 paths is clean.

Environment note: commands emitted the known Node engine warning because the local runtime is Node v24.14.0 while the package requests `>=24.15.0`.

## Follow-Ups

The next useful slice is connecting `benchmark.submit_external_job` to a real scheduler/MCP/HPC adapter contract while keeping the same `ResearchAction` planning-and-attribution boundary. A second useful slice is richer policy/UI surfacing for ledger evidence so users can inspect the source/code/job event file behind each `ledger:event...` reference directly from the session.
