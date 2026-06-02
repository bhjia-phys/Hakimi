# AITP Agent 0.9.0 Audit

## Scope

This audit covers the first formalization bridge.

Implemented:

- `formalization` module with contract, readiness, diagnostic, plan, and blueprint types;
- formalization target mapping for definitions, assumptions, formulas, lemmas, and theorems;
- `buildFormalizationPlan` over the physics graph kernel;
- dependency-closure inclusion for formalization targets;
- blueprint-like export format `aitp-formalization-blueprint/v0`;
- tests for theorem-shaped memory, file-backed FQHE formula readiness, and non-formalizable failure modes.

## Runtime Behavior

The bridge consumes a `PhysicsGraph` and target node ids. It can include dependency closure, build per-node contracts, and export a small dependency graph:

```text
PhysicsMemoryRegistry
-> PhysicsGraph
-> FormalizationPlan
-> FormalizationContract[]
-> aitp-formalization-blueprint/v0
```

Readiness is deliberately conservative:

- `formalized` memory remains `formalized`;
- `checked` and `validated` memory becomes `formalization_ready`;
- `raw`, `parsed`, `linked`, and unknown reliability become `needs_review`;
- `rejected` memory becomes `not_formalizable`.

Every non-formalized contract requires a human checkpoint. The export is a candidate blueprint, not a proof-assistant certificate.

## Covered Cases

The focused tests prove:

- a theorem depending on a lemma depending on a definition exports all three contracts and dependency edges;
- checked FQHE K-matrix memory is formalization-ready but not formalized;
- failure-mode capsules are excluded with `not-formalizable-kind` diagnostics.

## Boundaries

This slice does not call Lean, Physlib, OMDoc, or another external formal system. It does not synthesize theorem statements or proofs. It only identifies candidate material and exports a dependency skeleton suitable for later tooling.

## Verification

Focused formalization test:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/formalization/contracts.test.ts
```

Result:

- 1 test file passed.
- 3 tests passed.

Focused formalization/graph regression:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/formalization/contracts.test.ts packages/agent-core/test/physics-graph/query.test.ts packages/agent-core/test/physics-memory/domain-isolation.test.ts packages/agent-core/test/physics-memory/promotion.test.ts
```

Result:

- 4 test files passed.
- 13 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/formalization packages/agent-core/src/physics-graph packages/agent-core/test/formalization/contracts.test.ts packages/agent-core/test/physics-graph/query.test.ts
```

Result: 0 warnings, 0 errors.

Broad agent-core regression:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 203 test files passed.
- 1 test file skipped.
- 2357 tests passed.
- 6 tests skipped.
- 1 test marked todo.

Broad typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Broad lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint --type-aware
```

Result: 337 warnings, 0 errors. The warnings are the repository's pre-existing warning set; the focused lint gate for the new formalization, graph, bridge, and isolation paths is clean.

Environment note: commands emitted the known Node engine warning because the local runtime is Node v24.14.0 while the package requests `>=24.15.0`.

## Follow-Ups

Future work can attach external formal systems to the blueprint export. The runtime should continue to preserve the boundary between checked physics memory, formalization-ready contracts, and truly formalized artifacts.
