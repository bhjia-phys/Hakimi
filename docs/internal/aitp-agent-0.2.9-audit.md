# AITP Agent 0.2.9 Audit

## Scope

This audit covers the first graph-aware compiler pass that turns research-ledger events into typed physics graph candidates with dependency, contradiction, and provenance diagnostics.

Implemented:

- `physics-memory/graph-types.ts` for candidate-level graph objects and diagnostics;
- `compilePhysicsGraphCandidates(...)` as a new compiler lane on top of the existing physics-memory module;
- provenance checks for source-free graph candidates;
- dependency checks that explain missing prerequisites and surface assumption traces;
- contradiction checks that warn when convention/definition candidates with the same focus encode incompatible content;
- focused tests for dependency tracing, contradiction detection, and candidate-level promotion conservatism.

## Runtime Behavior

The new compiler lane is intentionally candidate-oriented:

```text
research-ledger events
-> graph candidate mapping
-> provenance check
-> dependency check
-> contradiction check
-> candidate graph objects
```

This means the runtime now has a structured intermediate object below capsules and above raw ledger events. It is still conservative:

- the output objects remain `promotionState: "candidate"`;
- ledger status is translated into reliability state, but reliability does not imply canonical memory;
- missing dependencies are reported instead of silently dropped;
- conflicting conventions are surfaced instead of blended into one synthesized answer.

The current graph candidate kinds cover the universal memory kernel needed for the next slices:

- `definition`
- `notation`
- `convention`
- `assumption`
- `formula`
- `derivation_step`
- `code_mapping`
- `benchmark_case`
- `failure_mode`
- `workflow_recipe`
- `bridge`

## Boundaries

This first 0.2.9 pass does not yet implement:

- deep transitive graph closure across candidate-to-candidate relations;
- bridge-gated cross-domain graph queries;
- richer merge logic for multiple events targeting the same object beyond contradiction warnings;
- promotion-pipeline integration that writes graph candidates into a canonical memory store.

So this slice establishes the graph-aware compilation substrate, but it is not yet the full graph kernel or trust-enforced promotion system.

## Verification

Focused tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-memory/compiler-v2.test.ts packages/agent-core/test/research-block/compiler.test.ts
```

Result:

- 2 test files passed.
- 3 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/physics-memory/compiler.ts packages/agent-core/src/physics-memory/graph-types.ts packages/agent-core/src/physics-memory/dependency-checker.ts packages/agent-core/src/physics-memory/contradiction-checker.ts packages/agent-core/src/physics-memory/provenance-checker.ts packages/agent-core/src/physics-memory/index.ts packages/agent-core/test/physics-memory/compiler-v2.test.ts
```

Result: 0 warnings, 0 errors.

## Follow-Ups

The next slice should enforce the trust ladder and promotion boundary, so these new graph candidates can move toward reusable canonical memory only when provenance, validation, and scope are sufficiently explicit.
