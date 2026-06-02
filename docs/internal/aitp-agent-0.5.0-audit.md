# AITP Agent 0.5.0 Audit

## Scope

This audit covers the first real LibRPA file-backed vertical slice.

Implemented:

- `benchmark-adapter` contracts with a small registry and default adapter factory;
- a first-class LibRPA head-wing smoke adapter behind `adapter.librpa.head-wing-smoke`;
- compatibility re-exports from `research-action/librpa-head-wing.ts`;
- project file fixtures under `.aitp/domain-profiles`, `.aitp/workflow-recipes`, `.aitp/physics-memory`, and `.aitp/evals`;
- an isolated-session LibRPA vertical test that loads those files from a temporary project root;
- adapter pass/fail/blocked coverage;
- context-pack and runtime-tool-exposure coverage for code/benchmark-oriented LibRPA work;
- harness eval coverage for action sequence, benchmark evidence, required benchmark check, forbidden claim, and final checked status.

## Runtime Behavior

The LibRPA vertical is now represented by durable project files instead of only in-code constants:

```text
.aitp/domain-profiles/librpa-head-wing.md
-> .aitp/workflow-recipes/librpa/head-wing-formula-code-mapping.md
-> .aitp/physics-memory/librpa-head-wing/*.md
-> .aitp/evals/librpa/head-wing-minimal.md
```

When the relevant experimental flags are enabled, an isolated session can load the LibRPA domain profile, workflow recipe, physics capsules, and eval case from the project root. A `WorkFrame` for `librpa/head-wing` then compiles a `ResearchContextPack` containing the workflow and the formula/code/benchmark capsules. Because the pack contains code and benchmark action bindings, runtime tool exposure keeps semantic tools active and also exposes code-capable tools.

The benchmark adapter accepts an unknown payload, validates it locally, and returns:

- adapter id, domain, action id, and case id;
- `pass`, `fail`, or `blocked`;
- deterministic observation text;
- evidence refs such as `benchmark:case.librpa.head-wing-smoke`;
- a `ResearchEvalCheckResult` for `check.librpa-head-wing.benchmark`.

The legacy `runLibrpaHeadWingSmokeBenchmark` export still works for existing tests and callers.

## Isolation Review

The focused vertical test copies the repo `.aitp` fixtures into a temporary project root and creates a fresh session with empty user-home roots. The test proves that the LibRPA profile, recipe, memory, and eval are loaded from the active project, not from hidden global state.

This does not yet implement cross-domain bridge policy beyond the existing context compiler behavior. That is intentionally left for the 0.7.0 bridge-gated isolation slice.

## Boundaries

This slice still does not run a real LibRPA binary, remote HPC job, or ABACUS/FHI-aims pipeline. The adapter is a CI-safe local contract for deterministic minimal evidence. Later runners can attach real execution behind the same `adapterId` without changing universal research action ids.

Automatic conversion of failed adapter runs into new eval files is available through the 0.4.0 writer path, but this slice does not add an end-of-turn policy that writes them without an explicit caller.

## Verification

Focused LibRPA tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/integration/librpa-head-wing.test.ts packages/agent-core/test/physics-verticals/librpa.test.ts
```

Result:

- 2 test files passed.
- 4 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/benchmark-adapter packages/agent-core/src/research-action/librpa-head-wing.ts packages/agent-core/src/index.ts packages/agent-core/test/physics-verticals/librpa.test.ts
```

Result: 0 warnings, 0 errors.

Broad agent-core regression:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 199 test files passed; 1 skipped.
- 2344 tests passed; 6 skipped; 1 todo.

Full type-aware lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint --type-aware
```

Result: 0 errors, with pre-existing warnings outside this slice still reported by the repository-wide lint configuration.

Environment note: commands emitted the known Node engine warning because the local runtime is Node v24.14.0 while the package requests `>=24.15.0`.

## Follow-Ups

The next vertical slice should move to FQHE/CS V2 by adding file-backed theory fixtures and isolated-session tests analogous to this LibRPA pass. The later bridge slice should then prove that LibRPA and FQHE contexts cannot leak into each other unless an explicit bridge capsule permits it.
