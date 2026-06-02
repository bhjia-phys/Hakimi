# AITP Agent 0.8.0 Audit

## Scope

This audit covers the first physics graph kernel and query semantics pass.

Implemented:

- `physics-graph` module with graph node, edge, diagnostic, query, and path result types;
- graph builder from `PhysicsMemoryRegistry`;
- neighborhood expansion;
- dependency closure expansion over `depends_on`, `assumes`, and `bridges_to`;
- bridge-policy-aware shortest path search;
- contradiction-edge query;
- focused graph tests over the file-backed FQHE/CS, LibRPA, and bridge fixtures.

## Runtime Behavior

The graph builder turns registered physics capsules into queryable graph nodes and edges:

- capsule nodes preserve kind, domain, title, reliability, source refs, and source capsule id;
- `depends_on` edges come from capsule dependencies;
- `assumes` edges come from capsule assumptions;
- `graph_refs` can add typed external graph nodes and relation edges;
- `bridge` metadata adds `bridges_to` edges.

Query semantics are intentionally conservative:

- default bridge policy is `explicit-only`;
- same-domain edges are traversable;
- cross-domain `bridges_to` edges are traversable only under `explicit-only` or `allow`;
- `bridgePolicy: deny` blocks `bridges_to`;
- `bridgePolicy: allow` permits all relation traversal.

## Covered Cases

The focused test proves:

- FQHE K-matrix response dependency closure includes the CS action plus relevant assumption/convention nodes;
- a bridge-aware path can connect FQHE K-matrix response to the explicitly bridged LibRPA formula;
- the same path is unavailable under `bridgePolicy: deny`;
- ordinary neighborhood expansion respects bridge policy;
- `contradicts` edges can be queried as first-class graph semantics.

## Boundaries

This is not yet a full graph database or a proof graph. It does not perform typed unification, theorem dependency checking, semantic contradiction detection, or bridge scoring. It gives the runtime a deterministic graph substrate that later research actions and context compilation can query instead of rebuilding local traversal logic.

## Verification

Focused graph test:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-graph/query.test.ts
```

Result:

- 1 test file passed.
- 4 tests passed.

Focused graph/bridge regression:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-graph/query.test.ts packages/agent-core/test/physics-memory/domain-isolation.test.ts packages/agent-core/test/physics-memory/compiler.test.ts packages/agent-core/test/physics-memory/compiler-v2.test.ts packages/agent-core/test/physics-verticals/librpa.test.ts packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts
```

Result:

- 6 test files passed.
- 19 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/physics-graph packages/agent-core/src/physics-memory/bridge.ts packages/agent-core/src/physics-memory/compiler.ts packages/agent-core/src/physics-memory/parser.ts packages/agent-core/src/physics-memory/types.ts packages/agent-core/test/physics-graph/query.test.ts packages/agent-core/test/physics-memory/domain-isolation.test.ts
```

Result: 0 warnings, 0 errors.

Broad agent-core regression:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 202 test files passed; 1 skipped.
- 2354 tests passed; 6 skipped; 1 todo.

Environment note: commands emitted the known Node engine warning because the local runtime is Node v24.14.0 while the package requests `>=24.15.0`.

## Follow-Ups

0.9.0 can now build formalization contracts over graph nodes and dependency paths instead of only over individual capsules. Later work should also connect `ResearchAction` graph queries to this kernel.
