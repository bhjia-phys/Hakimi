# AITP Agent 0.0.3 Audit

## Scope

This audit currently covers the first coherent 0.0.3 sub-slice: the thin primitive tool lifecycle spine.

Implemented areas:

- `PrimitiveToolLifecycleManager` in `packages/agent-core/src/agent/tool-lifecycle/`;
- `tool_lifecycle.started` and `tool_lifecycle.completed` append-only records;
- integration with `TurnFlow.trackToolLifecycle`, so real loop-level primitive tool calls are recorded as started/completed envelopes;
- stable fields for later WorkFrame and ResearchAction attribution;
- result status, output kind, bounded output summary, cwd, timestamps, duration, and artifact refs;
- read-only recent lifecycle envelope inspection through `agent.toolLifecycle.listRecent()`;
- replay-safe no-op handling for lifecycle audit records.

## Runtime Behavior

This slice does not add a model-facing tool and does not change the model-visible tool result.

The lifecycle manager observes the existing Kimi loop events:

- `tool.call` becomes `tool_lifecycle.started`;
- `tool.result` becomes `tool_lifecycle.completed`.

This keeps the feature inside Kimi's existing runtime instead of rewriting the tool manager. It also gives later AITP systems a stable primitive-tool trace to connect to WorkFrames, ResearchAction calls, ledger capture, final gates, and harness candidates.

## Audit Records

Started record:

```text
tool_lifecycle.started
```

Key fields:

- `source`
- `turnId`
- `step`
- `stepUuid`
- `toolCallId`
- `toolName`
- `cwd`
- `argsSummary`
- `description`
- `workFrameId`
- `actionCallId`
- `startedAt`

Completed record:

```text
tool_lifecycle.completed
```

Key fields:

- `source`
- `turnId`
- `step`
- `stepUuid`
- `toolCallId`
- `toolName`
- `cwd`
- `status`
- `isError`
- `outputKind`
- `outputSummary`
- `durationMs`
- `completedAt`
- `workFrameId`
- `actionCallId`
- `artifactRefs`

## Boundaries

This sub-slice intentionally does not yet implement:

- active WorkFrame attribution;
- active ResearchActionCall attribution;
- automatic diff artifact capture;
- background task state capture;
- controlled ledger writes;
- final-answer gating.

Those are later parts of 0.0.3 through 0.0.5.

## Verification

Focused runtime lifecycle tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/agent/basic.test.ts
```

Result:

- 2 test files passed.
- 4 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/agent/tool-lifecycle/index.ts packages/agent-core/src/agent/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/agent/harness/snapshots.ts
```

Result: 0 warnings, 0 errors.

Broader suite:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 173 test files passed.
- 1 test file skipped.
- 2287 tests passed.
- 7 tests skipped.
- 1 todo remains.

Node warning:

- The local environment is Node `v24.14.0`.
- Package metadata requests Node `>=24.15.0`.
- Commands were run with `--config.engine-strict=false`, as in the earlier audits.
