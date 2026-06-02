# AITP Agent 0.2.5 Audit

## Scope

This audit covers the first WorkFrame Orchestrator / ContextPack slice.

Implemented:

- `research-context` compiler module;
- `ResearchContextPack` summary schema;
- `ResearchContextManager` on `Agent`;
- replay-safe `research_context.context_compiled` records;
- replay-safe `workframe.context_attached` records;
- `ResearchAction` tool actions:
  - `compile_context_pack`
  - `list_context_packs`
  - `load_context_pack`

## Runtime Behavior

The ContextPack compiler starts from an active `WorkFrame` and gathers bounded, model-facing summaries from:

- matching `DomainProfile` records;
- matching or profile-referenced `WorkflowRecipe` records;
- `PhysicsMemory` capsule summaries;
- `ResearchLedger` compile proposals;
- workflow and capsule-derived `ResearchActionBinding` records.

The pack deliberately stores summaries, ids, checks, action bindings, and source refs. It does not embed full capsule bodies or full ledger event bodies. Detailed expansion still goes through `PhysicsMemory`, `ResearchLedger`, and later graph/compiler tools.

By default, compiling a pack attaches its id to the WorkFrame:

```text
ResearchAction.compile_context_pack
-> research_context.context_compiled
-> workframe.context_attached
```

This makes the active research state replay-safe and auditable without yet injecting the pack into the model loop automatically.

## Boundaries

0.2.5 does not yet implement:

- automatic WorkFrame inference from arbitrary prompts;
- automatic ContextPack injection into the system prompt;
- dynamic primitive tool exposure from ContextPack bindings;
- token-budgeted body selection for detailed capsule/ledger expansion;
- final-gate enforcement based on the compiled ContextPack.

Those remain the next WorkFrame orchestration and runtime-control slices.

## Verification

Focused verification:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-context packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/workframe.test.ts
```

Result:

- 4 test files passed.
- 12 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/research-context packages/agent-core/src/agent/research-context packages/agent-core/src/agent/workframe/index.ts packages/agent-core/src/agent/index.ts packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/test/research-context packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
```

Result: 0 warnings, 0 errors.

Full verification after the slice:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
corepack pnpm --config.engine-strict=false run build
node apps/kimi-code/dist/main.mjs --help
corepack pnpm --config.engine-strict=false run dev:cli -- --help
```

Results:

- Full `@moonshot-ai/agent-core` suite passed on retry: 190 test files passed, 1 skipped; 2317 tests passed, 6 skipped, 1 todo.
- The first full-suite attempt had one unrelated MCP stdio close-order failure in `test/mcp/client-stdio.test.ts`; the file passed when rerun alone, and the full suite passed on the next run.
- Root build passed.
- Built CLI help passed.
- Dev CLI help passed.

The local Node version remains `v24.14.0`, while package metadata requests `>=24.15.0`; commands used `--config.engine-strict=false`.
