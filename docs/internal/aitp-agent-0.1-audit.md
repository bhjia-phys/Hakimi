# AITP Agent 0.1 Audit

## Scope

This audit covers the first Harness and Eval Runner slice.

Implemented areas:

- `research-harness` types and exports in `packages/agent-core/src/research-harness`;
- `promoteHarnessCandidateToEvalCase` for turning failed/inconclusive action traces into deterministic eval cases;
- `runResearchEvalCase` for validating action sequence, action outcomes, evidence refs, and required checks;
- focused LibRPA and FQHE/CS eval runner tests.

## Runtime Behavior

The harness layer now has a deterministic path:

```text
ResearchActionRecord fail/inconclusive
-> HarnessCandidate
-> ResearchEvalCase
-> runResearchEvalCase
-> pass/fail diagnostics
```

The runner checks:

- whether the observed action trace contains the expected action sequence in order;
- whether expected action outcomes were observed;
- whether expected evidence refs are present in the run evidence;
- whether required checks passed.

This is deliberately narrower than a full model benchmark runner. It gives the AITP runtime a typed, auditable eval target that later model-loop harnesses can execute or score.

The initial tests cover:

- a LibRPA head-wing formula-code mapping failure promoted into an eval case;
- a passing LibRPA eval run with a benchmark action and required code-mapping check;
- a failing FQHE/CS eval run where the flux-quantization convention action is missing;
- a passing FQHE/CS charge-flux convention eval case.

## Boundaries

This slice intentionally does not yet implement:

- model invocation as part of eval execution;
- filesystem eval-case discovery;
- remote benchmark execution;
- dashboard/UI reporting;
- automatic promotion of all harness candidates.

Those remain later harness and product-runtime work.

## Verification

Focused harness tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-harness/runner.test.ts packages/agent-core/test/research-action/harness.test.ts
```

Result:

- 2 test files passed.
- 6 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/research-harness packages/agent-core/src/index.ts packages/agent-core/test/research-harness/runner.test.ts
```

Result: 0 warnings, 0 errors.

Broader suite:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 182 test files passed.
- 1 test file skipped.
- 2315 tests passed.
- 7 tests skipped.
- 1 todo remains.

Node warning:

- The local environment is Node `v24.14.0`.
- Package metadata requests Node `>=24.15.0`.
- Commands were run with `--config.engine-strict=false`, as in the earlier audits.
