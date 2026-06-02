# AITP Agent 0.2.7 Audit

## Scope

This audit covers the first dynamic tool-exposure pass after 0.2.6 connected WorkFrame and ResearchContextPack handling to the turn loop.

Implemented:

- runtime `ToolManager` exposure overlays;
- file-local `RuntimeToolExposurePlan` builder from `ResearchContextPack`;
- WorkFrame orchestrator wiring that applies a runtime exposure plan after compiling the active context pack;
- focused tests for theory-oriented versus code-oriented managed tool exposure.

## Runtime Behavior

Once a research turn has an inferred active WorkFrame and a compiled `ResearchContextPack`, the runtime now also computes a temporary tool-exposure overlay:

```text
ResearchContextPack
-> RuntimeToolExposurePlan
-> ToolManager runtime overlay
-> loopTools / toolInfos reflect the narrowed managed tool surface
```

This first pass manages a narrow set of research-relevant tools:

- `PhysicsMemory`
- `ResearchLedger`
- `ResearchAction`
- `Bash`
- `Write`
- `Edit`

Theory-oriented research packs keep the semantic research tools active while hiding code-capable managed tools. Code-oriented research packs can reactivate `Bash` / `Write` / `Edit`, either because the domain is code-heavy, the action bindings indicate code or benchmark work, or the workflow recipes explicitly require those tools.

The overlay is runtime-scoped. It does not replace the profile's baseline active-tool configuration; it temporarily rewrites only the managed subset while leaving unrelated active tools alone.

## Boundaries

This first 0.2.7 pass does not yet implement:

- fine-grained exposure classes for every builtin, MCP, and adapter tool;
- prompt-token-budgeted exposure summaries for the model;
- exposure planning driven by richer adapter contracts;
- automatic de-exposure based on final-gate outcomes or completed obligations.

So this slice establishes the runtime overlay mechanism and the first theory/code distinction, but it is not yet the full mature tool-budgeting system.

## Verification

Focused tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/agent/workframe.test.ts
```

Result:

- 3 test files passed.
- 7 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/agent/tool-exposure/index.ts packages/agent-core/src/agent/tool/index.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/src/agent/workframe/orchestrator.ts packages/agent-core/test/agent/tool-exposure.test.ts
```

Result: 0 warnings, 0 errors.

## Follow-Ups

The next runtime-closure slice should move from tool exposure to controlled auto-capture, so the tools that are now correctly exposed for a WorkFrame also begin producing compact evidence in the research ledger by default.
