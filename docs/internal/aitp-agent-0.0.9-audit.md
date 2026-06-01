# AITP Agent 0.0.9 Audit

## Scope

This audit covers the first EscalationPolicy and Final Gate slice.

Implemented areas:

- `research-policy` types and exports in `packages/agent-core/src/research-policy`;
- `decideEscalationPolicy` for tiered runtime escalation;
- `evaluateFinalGate` for validated-claim gating;
- integration with physics lens recommendations from 0.0.8;
- tests for lightweight FQHE questions, LibRPA verified workflows, memory promotion, and final-answer downgrades/blocks.

## Runtime Behavior

The escalation policy separates four runtime tiers:

- `tier0_light`: ordinary requests with no research runtime requirements;
- `tier1_scoped`: physics-scoped questions where a WorkFrame/action trace/final gate are recommended but not forced;
- `tier2_verified`: derivation checks, code edits, formula-code mapping, benchmark work, or open blocking obligations;
- `tier3_promotion`: validated-status or memory-promotion requests that require ledger capture and final gate.

The policy intentionally keeps simple conceptual physics questions lightweight. For example, the FQHE charge/flux question remains `tier1_scoped`, but the charge-flux quantization lens is attached so the agent sees the relevant caveats and suggested checks.

LibRPA head-wing code work escalates to `tier2_verified`, requiring WorkFrame and action trace, and recommending call-site inspection, formula-code mapping, git diff capture, and a minimal benchmark.

Validated memory promotion escalates to `tier3_promotion`.

The final gate prevents an answer from claiming `validated` status while blocking obligations remain open. If the caller can accept a weaker answer, the gate downgrades the status to `provisional` or `checked`; if validated status is mandatory, the gate blocks.

## Boundaries

This slice intentionally does not yet implement:

- automatic model-loop interception before every final response;
- automatic creation of obligations from every action effect;
- UI-facing status badges;
- persistence of gate decisions as AgentRecords;
- full policy tuning from harness failures.

Those remain 0.1 and later runtime-control work.

## Verification

Focused policy tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-policy packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-action/obligation.test.ts
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
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/research-policy packages/agent-core/src/index.ts packages/agent-core/test/research-policy
```

Result: 0 warnings, 0 errors.

Broader suite:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 181 test files passed.
- 1 test file skipped.
- 2311 tests passed.
- 7 tests skipped.
- 1 todo remains.

Node warning:

- The local environment is Node `v24.14.0`.
- Package metadata requests Node `>=24.15.0`.
- Commands were run with `--config.engine-strict=false`, as in the earlier audits.
