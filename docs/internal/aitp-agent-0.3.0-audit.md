# AITP Agent 0.3.0 Audit

## Scope

This audit covers the first promotion pipeline and trust-ladder enforcement pass for physics memory.

Implemented:

- `physics-memory/promotion.ts` with conservative promotion gating from graph candidates to promoted capsules;
- `PhysicsPromotionPacket` and additional capsule trust metadata in `physics-memory/types.ts`;
- `PhysicsMemoryTool.promote_candidate` for runtime-facing promotion with explicit packet fields;
- promotion record logging through `physics_memory.capsules_promoted`;
- focused tests for successful validated promotion, rejected source/scope/validation gaps, and formalized promotion checkpoint requirements.

## Runtime Behavior

The runtime now has a strict promotion gate:

```text
graph candidate
-> promotion packet
-> scope / provenance / validation / checkpoint checks
-> promoted capsule
```

This first pass enforces the trust ladder conservatively:

- source refs are required for any promotion;
- explicit scope is required for any promotion;
- `validated` and `formalized` promotion require validation refs;
- `formalized` promotion also requires an explicit human checkpoint label;
- promoted output is a `PhysicsCapsule` with trust metadata, not an untyped blob.

The promotion tool does not silently infer missing evidence. If a packet is under-specified, the promotion fails and returns diagnostics instead of mutating canonical memory.

## Boundaries

This first 0.3.0 pass does not yet implement:

- file-backed persistence for promoted capsules beyond in-memory registry replacement;
- multi-candidate merge review workflows;
- stronger integration with graph-candidate compilation provenance beyond packet-supplied refs;
- human approval UI wiring for the checkpoint itself.

So this slice establishes the trust gate and runtime contract, but it is still an early promotion pipeline rather than a full canonical-memory publication workflow.

## Verification

Focused tests:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-memory/promotion.test.ts packages/agent-core/test/tools/physics-memory-tool.test.ts packages/agent-core/test/physics-memory/compiler-v2.test.ts
```

Result:

- 3 test files passed.
- 10 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/physics-memory/types.ts packages/agent-core/src/physics-memory/promotion.ts packages/agent-core/src/tools/builtin/collaboration/physics-memory-tool.ts packages/agent-core/src/tools/builtin/collaboration/physics-memory-tool.md packages/agent-core/src/agent/physics-memory/index.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/test/physics-memory/promotion.test.ts packages/agent-core/test/tools/physics-memory-tool.test.ts
```

Result: 0 warnings, 0 errors.

## Follow-Ups

The next runtime-closure slice should wire final-gate lifecycle behavior into actual answer rendering, so validated/provisional/blocked status reflects the new promotion and evidence requirements during real research turns.
