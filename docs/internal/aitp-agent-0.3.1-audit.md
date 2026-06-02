# AITP Agent 0.3.1 Audit

## Scope

This audit covers the first final-gate lifecycle integration pass that makes answer rendering react to active research obligations instead of leaving the final gate as a disconnected utility.

Implemented:

- final-gate continuation helpers in `research-policy/final-gate.ts`;
- obligation and recent-evidence tracking in `agent/research-action/index.ts`;
- turn-loop integration in `agent/turn/index.ts` so a stop event can trigger one more model step when the active WorkFrame still fails the final gate;
- focused lifecycle tests for blocking-check correction and lightweight-turn non-interference.

## Runtime Behavior

The new lifecycle shape is:

```text
model wants to stop
-> active WorkFrame + obligations + evidence refs
-> final gate evaluation
-> if unsafe: append concise final-gate system trigger
-> one more model step to revise the answer
```

This means the runtime can now quietly force a more conservative ending for risky research turns:

- open blocking obligations downgrade the answer instead of letting the turn end cleanly;
- blocked WorkFrames cannot quietly end at checked or validated status;
- missing evidence can force a brief qualification step;
- simple turns without final-gate conditions still end naturally in one step.

The continuation message is intentionally short. It is not a protocol dump; it only asks the model to restate the answer with the allowed status and name the missing checks.

## Boundaries

This first 0.3.1 pass does not yet implement:

- user-visible structured final status rendering outside the model text itself;
- stronger evidence aggregation from the ledger and promotion pipeline beyond recent action evidence refs and WorkFrame source refs;
- multi-turn persistent obligation resolution workflows;
- final-gate integration with every domain-specific vertical and eval case.

So this slice closes the first real answer-lifecycle loop, but it is still an early integration rather than the final polished status UX.

## Verification

Focused tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/final-gate-integration.test.ts packages/agent-core/test/research-policy/final-gate.test.ts
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
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/research-policy/final-gate.ts packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/test/agent/final-gate-integration.test.ts packages/agent-core/test/research-policy/final-gate.test.ts
```

Result: 0 warnings, 0 errors.

## Follow-Ups

The next slice should push the harness and file-backed eval lane forward, so final-gate failures and downgraded endings can become deterministic replay material instead of staying only in session traces.
