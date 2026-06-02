# AITP Agent 0.4.0 Audit

## Scope

This audit covers the first Harness V2 file-backed eval pass plus one focused fix found while reviewing the previous final-gate lifecycle implementation.

Implemented:

- file-backed research eval case parser in `research-harness/parser.ts`;
- `.aitp/evals` root discovery in `research-harness/scanner.ts`;
- `ResearchEvalCaseRegistry` with duplicate diagnostics and domain filtering;
- deterministic eval rendering and writing in `research-harness/writer.ts`;
- `KIMI_CODE_EXPERIMENTAL_RESEARCH_HARNESS=1` session loading into `agent.researchHarness`;
- runner support for final-status and forbidden-claim validations;
- failed or inconclusive `HarnessCandidate` conversion into file-backed eval cases;
- scoped final-gate evidence tracking so recent evidence is filtered by active WorkFrame/domain/topic;
- replay restoration for recent evidence refs from `research_action.call_finished` and `research_action.result_recorded`.

## Runtime Behavior

Research eval files can now use Markdown frontmatter such as:

```yaml
id: eval.fqhe.charge-flux
kind: research_eval_case
title: FQHE charge-flux convention
task: Explain inverse fractional charge and flux period safely.
domain: topological-order/fqhe-cs
source_refs:
  - local:test
required_action_bindings:
  - action_id: validate.check_convention
    check_id: check.charge-flux-quantization.convention
expected_final_status: checked
forbidden_claims:
  - Berry curvature flux is identical to external electromagnetic flux
```

When the harness flag is enabled, project and user eval roots load into the session-level registry and are shared with agents as `agent.researchHarness`. Existing sessions remain unchanged when the flag is disabled.

The runner still accepts in-memory `ResearchEvalCase` objects, but it can now also evaluate:

- expected final status;
- forbidden final-answer substrings;
- required checks declared at top level;
- action bindings parsed from file frontmatter.

Failed or inconclusive action records already become `HarnessCandidate` objects through the existing research-action helper. This slice adds the missing durable edge:

```text
ResearchActionRecord(fail/inconclusive)
-> HarnessCandidate
-> ResearchEvalCase
-> .aitp/evals/<domain>/<eval-id>.md
-> registry scan
-> deterministic runner
```

The writer validates required fields, requires source refs, prevents root escapes, rejects duplicate files unless overwrite is explicit, and round-trips through the parser before writing.

## Previous Implementation Review

The 0.3.1 final-gate integration had one important scope bug:

- `recentEvidence()` stored a global string list, so evidence from a previous unrelated WorkFrame could satisfy a current validated-status gate.

This slice fixes that by storing recent evidence with WorkFrame/domain/topic metadata and querying only the active frame's evidence during final-gate continuation checks. A regression test now proves LibRPA evidence cannot satisfy a FQHE validated final claim.

The review did not find a failure in lightweight-turn behavior; the existing one-step path still stays untouched when no WorkFrame/final-gate conditions apply.

## Boundaries

This is not yet a full Harness V2 runtime:

- no model-facing harness tool was added;
- live failed traces can be written through the new writer, but there is no automatic end-of-turn policy that writes them without an explicit caller;
- eval files are loaded and runnable, but no bulk eval CLI or model-in-loop adapter is implemented;
- final status remains a runner input, not a structured UI-rendered answer status.

Those are the natural follow-ups for deeper replay and self-improvement work.

## Verification

Focused tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/final-gate-integration.test.ts packages/agent-core/test/research-harness/runner.test.ts packages/agent-core/test/research-harness/registry.test.ts packages/agent-core/test/research-harness/writer.test.ts packages/agent-core/test/session/research-harness.test.ts
```

Result:

- 5 test files passed.
- 15 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/research-harness packages/agent-core/src/research-action/types.ts packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/src/session/index.ts packages/agent-core/src/agent/index.ts packages/agent-core/src/flags/registry.ts packages/agent-core/test/agent/final-gate-integration.test.ts packages/agent-core/test/research-harness/registry.test.ts packages/agent-core/test/research-harness/writer.test.ts packages/agent-core/test/session/research-harness.test.ts
```

Result: 0 warnings, 0 errors.

Environment note: commands emitted the known Node engine warning because the local runtime is Node v24.14.0 while the package requests `>=24.15.0`.

## Follow-Ups

The next harness slice should add a deterministic registry-backed replay path that can run selected eval cases without hand-constructing `ResearchEvalRunInput`, then decide whether end-of-turn automatic eval-candidate writing should be policy-driven or tool-driven.
