# AITP Agent 0.0.5 Audit

## Scope

This audit currently covers the first coherent 0.0.5 sub-slices: active WorkFrame runtime state, ResearchAction call trace, and primitive tool attribution.

Implemented areas:

- `WorkFrameManager` in `packages/agent-core/src/agent/workframe/`;
- active WorkFrame storage on `Agent`;
- append-only records for `workframe.opened`, `workframe.switched`, and `workframe.closed`;
- replay restoration for open/switch/close WorkFrame records;
- `ResearchAction` model tool actions:
  - `open_work_frame`;
  - `switch_work_frame`;
  - `close_work_frame`;
  - `list_work_frames`;
- `ResearchAction` model tool actions:
  - `start_action_call`;
  - `finish_action_call`;
- append-only records for `research_action.call_started` and `research_action.call_finished`;
- replay restoration for active ResearchAction calls;
- `ledgerEventIds` on `research_action.result_recorded`;
- current active WorkFrame attribution on primitive tool lifecycle records through `workFrameId`;
- current active ResearchActionCall attribution on primitive tool lifecycle records through `actionCallId`.

## Runtime Behavior

WorkFrame is now a runtime state object, not only a passive type.

Opening a WorkFrame makes it active. Switching changes the active frame. Closing the active frame falls back to another open frame when one exists. These state transitions are recorded and replay-safe.

Primitive tool lifecycle records now include `workFrameId` when a WorkFrame is active and `actionCallId` when a ResearchAction call is active:

```text
workframe.opened
-> research_action.call_started
-> tool_lifecycle.started(workFrameId, actionCallId)
-> tool_lifecycle.completed(workFrameId, actionCallId)
-> research_action.call_finished
```

This is the first connection from semantic research context to raw tool execution.

## Audit Records

WorkFrame records:

- `workframe.opened`
- `workframe.switched`
- `workframe.closed`

ResearchAction call records:

- `research_action.call_started`
- `research_action.call_finished`

Primitive tool lifecycle records retain their existing fields and now use the previously reserved `workFrameId` and `actionCallId` fields when available.

## Boundaries

This sub-slice intentionally does not yet implement:

- WorkFrame-scoped context injection;
- obligation generation on action completion;
- dynamic tool exposure policy per WorkFrame.

Those are the next 0.0.5 steps.

## Verification

Focused WorkFrame/action/lifecycle tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/workframe.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/research-action/harness.test.ts
```

Result:

- 4 test files passed.
- 11 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/research-action/types.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/agent/workframe.test.ts packages/agent-core/test/research-action/harness.test.ts
```

Result: 0 warnings, 0 errors.

Broader suite:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 176 test files passed.
- 1 test file skipped.
- 2297 tests passed.
- 7 tests skipped.
- 1 todo remains.

Node warning:

- The local environment is Node `v24.14.0`.
- Package metadata requests Node `>=24.15.0`.
- Commands were run with `--config.engine-strict=false`, as in the earlier audits.
