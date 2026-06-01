# AITP Agent 0.0.2 Audit

## Scope

This audit covers the 0.0.2 foundation for source-backed research ledgers and typed research actions.

Implemented areas:

- `research-ledger` types, parser, scanner, registry, compiler, and public exports;
- project/user root scanning for `.aitp/research-ledger` and `~/.aitp/research-ledger`;
- `ResearchLedger` builtin model tool with `list_topics`, `list_events`, `load_event`, and `compile_proposals`;
- session-level research ledger loading behind `KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER=1`;
- `research-ledger` append-only records for roots loaded, event loaded, event written, and proposals compiled;
- ActionAlgebra type layer with phases, object kinds, preconditions, effects, validators, primitive tool policies, WorkFrames, and obligations;
- default research action definitions for scoping, source capture, derivation, validation, code/numerics, compilation, and harness work;
- advisory validation scheduler;
- `ResearchAction` builtin model tool with `list_actions`, `recommend_next_actions`, and `record_action_result`;
- `research-action` append-only records for action results and raw primitive tool escapes;
- harness candidate conversion from failed or inconclusive action records.

## Runtime Flags

New flags:

- `KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER=1`
- `KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION=1`

Existing flag retained:

- `KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY=1`

All new 0.0.2 model tools remain disabled unless their experimental flags are enabled.

## Audit Records

Research ledger records:

- `research_ledger.roots_loaded`
- `research_ledger.event_loaded`
- `research_ledger.event_written`
- `research_ledger.proposals_compiled`

Research action records:

- `research_action.result_recorded`
- `research_action.raw_tool_escape`

These records are replay-safe no-ops. They exist for audit, future controller policy, and future harness conversion.

## Tool Boundaries

`ResearchLedger` is read/compile-only in 0.0.2. It does not write ledger events to disk yet.

`ResearchAction` is definition/scheduling/recording-only in 0.0.2. It does not execute shell, git, web, benchmark, or MCP tools. Primitive tool execution remains in Kimi's existing tool layer and can be attributed to research actions through recorded ids.

Raw primitive tool usage can be recorded explicitly through `research_action.raw_tool_escape`, but automatic interception of every raw tool call is intentionally deferred.

## Verification

Focused verification:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-ledger packages/agent-core/test/research-action packages/agent-core/test/session/research-ledger.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/flags/resolver.test.ts
```

Result:

- 17 test files passed.
- 46 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/research-ledger packages/agent-core/src/research-action packages/agent-core/src/agent/research-ledger packages/agent-core/src/agent/research-action packages/agent-core/src/tools/builtin/collaboration/research-ledger-tool.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/test/research-ledger packages/agent-core/test/research-action packages/agent-core/test/session/research-ledger.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
```

Result: 0 warnings, 0 errors.

Broader suite:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 172 test files passed.
- 1 test file skipped.
- 2286 tests passed.
- 7 tests skipped.
- 1 todo remains.

Node warning:

- The local environment is Node `v24.14.0`.
- Package metadata requests Node `>=24.15.0`.
- Commands were run with `--config.engine-strict=false`, as in the 0.0.1 audit.

## Remaining Boundaries

0.0.2 does not yet implement:

- automatic ledger writes after every web/git/code/benchmark action;
- a full research-action executor;
- WorkFrame-driven dynamic tool exposure;
- automatic final-answer gating;
- a ForgeCode-style eval runner;
- graph database persistence;
- physics-specific symbolic checks.

Those are the intended next slices. The 0.0.2 foundation gives them typed events, typed actions, obligations, scheduler recommendations, tool records, and harness candidate objects to build on.
