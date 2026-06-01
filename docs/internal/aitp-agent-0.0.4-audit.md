# AITP Agent 0.0.4 Audit

## Scope

This audit currently covers the first coherent 0.0.4 sub-slice: schema-checked research ledger writes.

Implemented areas:

- `writeResearchLedgerEvent` in `packages/agent-core/src/research-ledger/writer.ts`;
- deterministic event paths under `.aitp/research-ledger/<topic>/events/<event-id>.md`;
- frontmatter rendering that is immediately re-parsed through the existing ledger parser before writing;
- source-ref validation so ledger events cannot be written without provenance;
- path slug checks to avoid path traversal;
- duplicate-id/file protection unless `overwrite` is explicitly set;
- `ResearchLedgerManager.writeEvent`, which writes the event, registers it in the current session registry, and records `research_ledger.event_written`;
- `ResearchLedger.write_event` model tool action behind the existing `KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER=1` feature flag.

## Runtime Behavior

`write_event` is intentionally controlled capture, not automatic logging.

Required fields:

- `id`
- `type`
- `topic`
- `domain`
- `body`
- `source_refs`

Optional fields:

- `status`
- `depends_on`
- `candidate_capsule_kind`
- `open_questions`
- `related_objects`
- `created_at`
- `overwrite`

After a successful write, the new event is immediately available to:

- `list_events`
- `load_event`
- `compile_proposals`

without restarting the session.

## Audit Records

Successful writes emit:

```text
research_ledger.event_written
```

Key fields:

- `source`
- `eventId`
- `topic`
- `domain`
- `eventType`
- `status`
- `path`
- `toolCallId`

## Boundaries

This sub-slice intentionally does not yet implement:

- automatic capture after every web/git/code/benchmark action;
- capture policy classification;
- artifact storage for long outputs;
- WorkFrame-aware write routing;
- promotion from ledger events into trusted physics memory.

Those are later 0.0.4 and 0.0.5 steps.

## Verification

Focused writer/tool tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-ledger/writer.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts packages/agent-core/test/research-ledger packages/agent-core/test/tools/research-ledger-tool.test.ts
```

Result:

- 7 test files passed.
- 19 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/research-ledger/writer.ts packages/agent-core/src/research-ledger/index.ts packages/agent-core/src/research-ledger/registry.ts packages/agent-core/src/agent/research-ledger/index.ts packages/agent-core/src/tools/builtin/collaboration/research-ledger-tool.ts packages/agent-core/test/research-ledger/writer.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts
```

Result: 0 warnings, 0 errors.

Broader suite:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 174 test files passed.
- 1 test file skipped.
- 2290 tests passed.
- 7 tests skipped.
- 1 todo remains.

Node warning:

- The local environment is Node `v24.14.0`.
- Package metadata requests Node `>=24.15.0`.
- Commands were run with `--config.engine-strict=false`, as in the earlier audits.
