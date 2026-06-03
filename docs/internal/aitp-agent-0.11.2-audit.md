# AITP Agent 0.11.2 Audit

## Scope

This audit covers the WorkFrame-scoped evidence inspection slice.

Implemented:

- `ResearchAction.list_evidence_refs` lists recent evidence refs for the active WorkFrame, an explicit `frame_id`, or an explicit `domain`/`topic` scope;
- `ResearchAction.load_evidence_ref` loads `ledger:event...` evidence through the existing `ResearchLedger` registry;
- loaded ledger events render with the same XML-like event shape used by the standalone `ResearchLedger` tool;
- event loading records `research_ledger.event_loaded` with model-tool attribution;
- ledger event loading checks the requested WorkFrame/domain/topic before rendering the body;
- cross-topic/domain evidence loads fail before leaking body text.

## Runtime Behavior

The intended evidence reread flow is now:

```text
ResearchAction.plan_primitive_tools(action_id)
-> native Kimi / MCP / shell / web / scheduler tool executes outside ResearchAction
-> ResearchLedger.capture_event writes durable source/code/job evidence
-> ResearchAction.finish_action_call records ledger:event... evidence refs
-> ResearchAction.list_evidence_refs lists refs in the active WorkFrame scope
-> ResearchAction.load_evidence_ref reloads a matching ledger event and audits the read
```

This keeps the same conservative execution boundary as 0.11.0 and 0.11.1. `ResearchAction` still does not run shell, git, web, MCP, scheduler, or HPC commands. It provides a semantic action surface, primitive plans, pure adapters, deterministic graph/formalization executors, and now scoped evidence inspection over ledger events that were produced by the native execution layer.

## Covered Cases

The focused tests prove:

- FQHE and LibRPA WorkFrames can record separate `ledger:event...` evidence refs in the same agent session;
- after switching back to the FQHE WorkFrame, `list_evidence_refs` includes the FQHE ref and excludes the LibRPA ref;
- `load_evidence_ref` renders the FQHE ledger event body and writes a `research_ledger.event_loaded` record;
- attempting to load the LibRPA ref while the FQHE frame is active returns a tool error;
- the LibRPA body is not rendered and no `research_ledger.event_loaded` record is emitted for the rejected event;
- evidence access without an active WorkFrame rejects partial explicit scopes, so `domain` without `topic` cannot broaden evidence lookup.

## Verification

Focused ResearchAction tool tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/tools/research-action-tool.test.ts
```

Result:

- 1 test file passed.
- 14 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.md packages/agent-core/test/tools/research-action-tool.test.ts
```

Result: 0 warnings, 0 errors.

Diff check:

```powershell
git diff --check
```

Result: no whitespace errors. Git reported the usual Windows LF-to-CRLF working-copy warnings.

Environment note: pnpm commands emitted the known Node engine warning because the local runtime is Node v24.14.0 while the package requests `>=24.15.0`.

## Follow-Ups

The next useful slice is deployment-specific native connectors that can populate evidence refs from real scheduler/MCP/HPC or literature backends. Those connectors should remain outside `ResearchAction`; this slice gives the semantic action layer a scoped way to reread and audit the evidence those native tools already produced.
