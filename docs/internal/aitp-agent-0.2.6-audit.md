# AITP Agent 0.2.6 Audit

## Scope

This audit covers the first turn-loop context-closure pass after the 0.2.5 WorkFrame ContextPack foundation.

Implemented:

- `WorkFrameOrchestrator` for prompt-sensitive WorkFrame reuse and switching;
- compact `ResearchContextPack` reminder rendering for model-facing injection;
- `ResearchContextInjector` wired into the agent's dynamic injection cycle;
- focused tests proving prompt-sensitive frame selection and research-context injection.

## Runtime Behavior

Before each model-facing step, the standard injection cycle now includes a research-context phase:

```text
latest user prompt
-> infer/reuse matching WorkFrame from currently open frames
-> compile bounded ResearchContextPack for that frame
-> attach pack id back to the WorkFrame
-> inject a compact research-context reminder into ContextMemory
```

The injected reminder includes only bounded runtime summaries:

- WorkFrame id, domain, topic, and goal;
- focus objects and conventions;
- matching domain profiles and workflow recipes;
- physics capsule ids plus reliability;
- ledger proposal ids plus confidence;
- action binding ids and compact diagnostics.

This is intentionally not full memory/ledger dump behavior. The goal is to give the model a small bounded working context for research turns while keeping the larger registries behind their own tools.

When multiple WorkFrames are open, the orchestrator scores the latest user prompt against frame id, domain, topic, and goal text, with a small bias toward the already-active frame. If one frame clearly matches, the orchestrator switches the active frame before compiling the pack.

## Boundaries

This first 0.2.6 pass does not yet implement:

- automatic creation of a new WorkFrame from an arbitrary prompt when no frame is already open;
- dynamic primitive tool exposure from the compiled ContextPack;
- final-gate enforcement from the injected context;
- auto-capture from primitive tool lifecycle into the research ledger;
- richer bridge-aware cross-domain inference beyond what the existing context compiler already enforces.

So this slice closes the first gap in the turn loop, but it does not yet complete the whole runtime-closure lane.

## Verification

Focused tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/agent/workframe.test.ts
```

Result:

- 2 test files passed.
- 5 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

## Follow-Ups

The next runtime-closure slice should move from context injection to dynamic tool exposure and budgeting, so the model not only sees the right bounded research context but also the right narrowed tool surface for the current WorkFrame.
