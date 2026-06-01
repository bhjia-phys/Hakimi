# AITP Agent 0.0.8 Audit

## Scope

This audit covers the first PhysicsDirectionEngine and lens slice.

Implemented areas:

- `physics-direction` types and exports in `packages/agent-core/src/physics-direction`;
- applicability-gated lens evaluation through `checkPhysicsLensApplicability`;
- sorted lens recommendations through `recommendPhysicsLenses`;
- a `topological-order/fqhe-cs` charge-flux quantization lens;
- a `librpa/head-wing` formula-code mapping lens;
- ResearchAction entries for `physics.apply_direction_lens` and `physics.check_flux_quantization_convention`;
- focused tests for accepted, rejected, and hidden-rejected lens behavior.

## Runtime Behavior

Physics lenses are lightweight direction selectors. They are not proofs and they are not keyword-only triggers.

Each lens declares:

- supported domains;
- required object kinds;
- relation cues that must be present;
- supporting context tags;
- reject object/context tags;
- caveats;
- guiding questions;
- required checks;
- suggested ResearchAction ids;
- expansion handles.

The engine normalizes explicit WorkFrame-style inputs plus prompt text into object, relation, and context tags. It then returns auditable recommendations with:

- `status`: `applicable`, `needs_context`, or `rejected`;
- matched and missing object kinds;
- matched and missing relation kinds;
- rejection reasons;
- caveats and guiding questions;
- required checks and suggested actions.

For the FQHE/CS question "smaller fractional charge seems to correspond to larger flux period", the engine proposes the `charge_flux_quantization` lens because both charge and flux objects are present and a Dirac/AB-style inverse charge-flux relation is cued. The lens explicitly warns that external electromagnetic flux, emergent Chern-Simons flux, and quasiparticle AB flux periods must not be conflated.

For Berry-curvature flux in momentum space, the same lens is rejected or hidden from normal recommendations.

For LibRPA head-wing changes, the engine proposes a formula-code mapping lens that points to call-site inspection, formula-code mapping, git diff capture, and a minimal smoke benchmark.

## Boundaries

This slice intentionally does not yet implement:

- automatic final-answer steering;
- automatic WorkFrame escalation;
- proof-level physical validation;
- full FQHE/CS memory population;
- real LibRPA benchmark execution beyond the 0.0.6 smoke stand-in;
- a model-facing `PhysicsDirection` builtin tool.

Those remain 0.0.9, 0.1, and 0.2 work.

## Verification

Focused lens and default-action tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-action/default-actions.test.ts
```

Result:

- 2 test files passed.
- 7 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/physics-direction packages/agent-core/src/research-action/default-actions.ts packages/agent-core/src/index.ts packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-action/default-actions.test.ts
```

Result: 0 warnings, 0 errors.

Broader suite:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 179 test files passed.
- 1 test file skipped.
- 2304 tests passed.
- 7 tests skipped.
- 1 todo remains.

Node warning:

- The local environment is Node `v24.14.0`.
- Package metadata requests Node `>=24.15.0`.
- Commands were run with `--config.engine-strict=false`, as in the earlier audits.
