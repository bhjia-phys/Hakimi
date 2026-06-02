# AITP Agent 0.2.8 Audit

## Scope

This audit covers the first controlled auto-capture pass that converts real primitive tool outcomes into compact research-ledger evidence.

Implemented:

- `tool_lifecycle.completed` now triggers a runtime auto-capture attempt when a research ledger manager is present;
- a dedicated auto-capture classifier maps real tool outcomes into `git_diff_observation`, `benchmark_observation`, `failure_observation`, or `source_excerpt`;
- successful auto-capture writes deterministic ledger events through the existing controlled capture policy;
- skipped auto-captures now leave explicit `research_ledger.auto_capture_skipped` records with reasons and diagnostics;
- focused tests cover git diff capture, blocking failure capture, and low-value noise suppression.

## Runtime Behavior

The runtime closure for this slice is:

```text
tool_lifecycle.completed
-> WorkFrame-aware auto-capture classifier
-> controlled capture policy
-> ResearchLedger.writeEvent(...)
-> research_ledger.event_written
```

The current classifier is intentionally conservative.

It will only capture when the runtime can attach the tool result to an active or referenced `WorkFrame`, so the event has a stable `topic` and `domain`. It also skips semantic research tools such as `ResearchLedger`, `ResearchAction`, and `PhysicsMemory`, because those tools already operate at the structured research layer and should not recursively create more ledger noise.

For now, the first auto-capture pass recognizes:

- git diff style evidence from diff-like args or outputs;
- benchmark/test style evidence from benchmark-like args or outputs;
- failed tool executions as blocking failure observations;
- source-like excerpts only when source-shaped refs such as URLs, arXiv ids, or DOI-shaped strings are present.

Low-value directory and listing noise is explicitly skipped and audited instead of being silently ignored.

## Boundaries

This first 0.2.8 pass does not yet implement:

- artifact-file persistence for very large raw outputs beyond incoming `artifactRefs`;
- richer source extraction from browser/MCP/document tools;
- action-definition-aware capture rules keyed by `ResearchActionBinding`;
- direct conversion from auto-captured failures into harness candidates.

So this slice closes the live evidence-writing loop, but it is still a conservative first pass rather than the full mature controlled-capture system.

## Verification

Focused tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-ledger/auto-capture.test.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/research-ledger/capture-policy.test.ts
```

Result:

- 3 test files passed.
- 6 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/agent/research-ledger/auto-capture.ts packages/agent-core/src/agent/research-ledger/index.ts packages/agent-core/src/agent/tool-lifecycle/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/test/research-ledger/auto-capture.test.ts
```

Result: 0 warnings, 0 errors.

## Follow-Ups

The next runtime-closure slice should strengthen the compiler path that consumes these captured events, so the newly live ledger evidence can merge into candidate graph objects instead of staying as isolated event files.
