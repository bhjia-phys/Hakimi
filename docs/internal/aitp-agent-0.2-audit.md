# AITP Agent 0.2 Audit

## Scope

This audit covers the first FQHE/CS theory vertical slice.

Implemented areas:

- `physics-verticals/fqhe-cs` exports in `packages/agent-core/src/physics-verticals`;
- four FQHE/CS `ResearchBlock` units:
  - Laughlin wavefunction;
  - flux insertion and fractional charge pump;
  - Abelian Chern-Simons effective action;
  - K-matrix response and Hall conductance;
- compilation of those blocks into candidate `PhysicsCapsule` objects;
- deterministic charge-flux convention check;
- FQHE/CS charge-flux eval case;
- loop integration with physics lenses, eval runner, and final gate.

## Runtime Behavior

The vertical slice demonstrates the intended runtime loop:

```text
FQHE/CS ResearchBlocks
-> capsule boundary compiler
-> charge-flux physics lens
-> convention check
-> eval case
-> final gate
```

The charge-flux convention check accepts the controlled case:

- charge identity: Laughlin quasiparticle charge;
- flux identity: external electromagnetic flux or quasiparticle AB flux period;
- phase invariant: `q Phi / hbar`;
- filling denominator greater than one.

It rejects Berry-flux conflation by creating an open blocking convention obligation. The final gate then downgrades a validated claim to provisional until that obligation is resolved.

This directly encodes the desired behavior for the question "why does smaller fractional charge seem to correspond to larger flux": the agent is nudged toward AB/Dirac-style charge-flux quantization, while explicitly checking that it is not confusing external EM flux, emergent Chern-Simons flux, quasiparticle AB period, or Berry curvature flux.

## Boundaries

This slice intentionally does not yet implement:

- a complete FQHE/CS knowledge graph;
- paper ingestion from arXiv/Zotero;
- proof-assistant formalization;
- model-loop automatic invocation of the vertical slice;
- full non-Abelian/topological-order coverage.

The slice is a narrow executable proof of shape, not a mature theory library.

## Verification

Focused FQHE/CS vertical tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-verticals/fqhe-cs.test.ts packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-harness/runner.test.ts
```

Result:

- 3 test files passed.
- 11 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/physics-verticals packages/agent-core/src/index.ts packages/agent-core/test/physics-verticals/fqhe-cs.test.ts
```

Result: 0 warnings, 0 errors.

Broader suite:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 183 test files passed.
- 1 test file skipped.
- 2318 tests passed.
- 7 tests skipped.
- 1 todo remains.

Node warning:

- The local environment is Node `v24.14.0`.
- Package metadata requests Node `>=24.15.0`.
- Commands were run with `--config.engine-strict=false`, as in the earlier audits.
