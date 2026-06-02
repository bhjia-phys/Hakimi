# AITP Agent 0.2.2 Audit

## Scope

This audit covers the universal `ResearchActionBinding` refactor.

Implemented areas:

- added `ResearchActionId`, `ResearchActionBinding`, and eval action expectations;
- added action-binding helpers for converting legacy string expectations and structured bindings into action ids;
- removed topic-specific action registration from default research actions;
- converted FQHE/CS charge-flux direction work from `physics.check_flux_quantization_convention` into `validate.check_convention` with `lensId`, `checkId`, and required distinctions;
- converted LibRPA head-wing workflow work from `benchmark.run_minimal_librpa_case` into `benchmark.run_minimal_case` with `adapterId`;
- made physics lenses expose `suggestedActionBindings` while preserving derived `suggestedActions` for compatibility;
- made escalation policy return both `recommendedActionIds` and `recommendedActionBindings`;
- kept deterministic LibRPA smoke benchmark code but stopped exporting LibRPA-specific registered actions.
- fixed Windows local build/run scripts so the repo can build without a globally installed `pnpm.cmd` shim:
  - root scripts now invoke `corepack pnpm --config.engine-strict=false`;
  - `apps/vis` scripts no longer call bare `pnpm`;
  - `packages/node-sdk` no longer shells from `build` back into bare `pnpm`;
  - Windows `.cmd` launch in `packages/node-sdk/scripts/build-dts.mjs` and `apps/kimi-code/scripts/dev.mjs` now goes through `cmd.exe` with the workspace `.bin` path.

## Runtime Behavior

The action layer now separates universal actions from domain-specific intent:

```text
universal action id
-> ResearchActionBinding
-> domainId / workflowId / lensId / checkId / adapterId / params
```

For FQHE/CS charge-flux reasoning:

```text
validate.check_convention
  domainId: topological-order/fqhe-cs
  lensId: charge_flux_quantization
  checkId: check.charge-flux-quantization.convention
```

For LibRPA head-wing benchmark work:

```text
benchmark.run_minimal_case
  domainId: librpa/head-wing
  workflowId: workflow.librpa.head-wing.formula-code-mapping
  adapterId: adapter.librpa.head-wing-smoke
```

This keeps the default action registry universal while preserving the ability to route different theoretical-physics domains into specific checks, workflows, and benchmark adapters.

The local Windows development path now also works with only `corepack` available:

```powershell
corepack pnpm --config.engine-strict=false run build
corepack pnpm --config.engine-strict=false run dev:cli -- --help
node apps/kimi-code/dist/main.mjs --help
```

## Guardrail

`packages/agent-core/test/research-action/default-actions.test.ts` now fails if default action ids contain domain/topic segments such as:

- `librpa`
- `fqhe`
- `chern`
- `cs`
- `laughlin`
- `head`
- `wing`
- `flux`
- `quantization`

## Boundaries

This slice intentionally does not yet implement:

- file-backed `DomainProfile` registry;
- file-backed `WorkflowRecipe` registry;
- automatic WorkFrame context-pack selection from bindings;
- model-loop enforcement of final gates;
- real LibRPA benchmark execution.

Those are planned for the next slices.

## Verification

Focused tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-action/default-actions.test.ts packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-harness/runner.test.ts packages/agent-core/test/physics-verticals/fqhe-cs.test.ts packages/agent-core/test/research-policy/escalation.test.ts packages/agent-core/test/integration/librpa-head-wing.test.ts
```

Result:

- 6 test files passed.
- 20 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/research-action packages/agent-core/src/physics-direction packages/agent-core/src/research-harness packages/agent-core/src/research-policy packages/agent-core/src/physics-verticals packages/agent-core/test/research-action/default-actions.test.ts packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-harness/runner.test.ts packages/agent-core/test/physics-verticals/fqhe-cs.test.ts packages/agent-core/test/research-policy/escalation.test.ts packages/agent-core/test/integration/librpa-head-wing.test.ts
```

Result:

- 0 warnings.
- 0 errors.

Full agent-core suite:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 183 test files passed.
- 1 test file skipped.
- 2319 tests passed.
- 7 tests skipped.
- 1 todo remains.

Local build and run smoke:

```powershell
corepack pnpm --config.engine-strict=false run build
corepack pnpm --config.engine-strict=false run dev:cli -- --help
node apps/kimi-code/dist/main.mjs --help
```

Result:

- root build passed;
- dev CLI help printed successfully;
- built CLI help printed successfully.

Node warning:

- The local environment is Node `v24.14.0`.
- Package metadata requests Node `>=24.15.0`.
- Commands were run with `--config.engine-strict=false`, as in earlier audits.
