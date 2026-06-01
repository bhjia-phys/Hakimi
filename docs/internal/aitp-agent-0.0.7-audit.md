# AITP Agent 0.0.7 Audit

## Scope

This audit covers the first capsule boundary compiler slice.

Implemented areas:

- `ResearchBlock` types in `packages/agent-core/src/research-block/types.ts`;
- `compileResearchBlockToCandidateCapsule` in `packages/agent-core/src/research-block/compiler.ts`;
- package exports through `packages/agent-core/src/research-block/index.ts` and `packages/agent-core/src/index.ts`;
- a FQHE/Laughlin flux-insertion style compiler fixture.

## Runtime Behavior

The boundary compiler is for locally self-contained reasoning blocks. It does not interrupt every micro-step of reasoning.

When a derivation/code block reaches a boundary, it can be compiled into an unpromoted `PhysicsCapsule` candidate with:

- `reliability: raw`;
- source refs;
- dependency capsule ids;
- symbols;
- assumptions;
- graph refs for related objects;
- derivation/source expansion handles;
- required checks inferred from formulas, conventions, and assumptions;
- a `memory.propose_capsule` action affordance.

Open questions are preserved in the capsule body and diagnostics instead of being erased by summarization.

## Boundaries

This slice intentionally does not yet implement:

- automatic extraction from arbitrary chat scratch;
- promotion into trusted physics memory;
- graph database persistence;
- proof-assistant-level formalization;
- full FQHE/CS domain memory.

Those remain later capsule/compiler and FQHE vertical work.

## Verification

Focused capsule boundary compiler test:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-block/compiler.test.ts
```

Result:

- 1 test file passed.
- 1 test passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/research-block packages/agent-core/src/index.ts packages/agent-core/test/research-block/compiler.test.ts
```

Result: 0 warnings, 0 errors.

Broader suite:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 178 test files passed.
- 1 test file skipped.
- 2300 tests passed.
- 7 tests skipped.
- 1 todo remains.

Node warning:

- The local environment is Node `v24.14.0`.
- Package metadata requests Node `>=24.15.0`.
- Commands were run with `--config.engine-strict=false`, as in the earlier audits.
