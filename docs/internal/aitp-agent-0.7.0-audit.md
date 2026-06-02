# AITP Agent 0.7.0 Audit

## Scope

This audit covers multi-domain isolation and bridge capsules.

Implemented:

- `Bridge` as a first-class `PhysicsCapsuleKind`;
- `BridgeSpec` metadata with `fromDomain`, `toDomain`, `capsuleRefs`, and optional reason;
- Markdown parser support for `bridge:` frontmatter;
- `physics-memory/bridge.ts` helpers for collecting bridge permissions and matching allowed target capsules;
- bridge-aware `compilePhysicsContext` behavior;
- a file-backed FQHE-to-LibRPA bridge fixture;
- domain-isolation tests for no-bridge, explicit-bridge, and deny-policy behavior.

## Runtime Behavior

The default context policy remains `explicit-only`, but it now has concrete semantics:

- same-domain capsules are included normally;
- cross-domain capsules are rejected unless policy is `allow`, the capsule explicitly allows cross-domain reuse, or a focused `Bridge` capsule grants the target;
- `bridgePolicy: deny` rejects cross-domain inclusion even when a bridge exists;
- allowed bridge inclusion leaves an `info` diagnostic with code `bridge-cross-domain-inclusion`;
- denied cross-domain inclusion leaves a warning diagnostic with code `cross-domain-denied`.

The file-backed bridge fixture is:

```text
.aitp/physics-memory/bridges/fqhe-to-librpa-response-notation.md
```

It allows a FQHE/CS WorkFrame to explicitly inspect `formula.librpa.head-wing.update` as response-notation context. It is not referenced by the FQHE profile by default, so ordinary FQHE context packs stay domain-clean.

## Isolation Review

The focused test proves three cases:

1. FQHE focus on `formula.fqhe-cs.kmatrix-response` includes only FQHE capsules.
2. FQHE focus plus `bridge.fqhe-cs-to-librpa.response-notation` includes the named LibRPA formula and records a bridge diagnostic.
3. The same focus with `bridgePolicy: deny` excludes the LibRPA formula and records a denial diagnostic.

This directly supports the roadmap requirement that LibRPA content cannot silently leak into FQHE/QFT contexts, while legitimate bridges remain possible and auditable.

## Boundaries

This slice does not implement a full graph query kernel. Bridge matching is capsule-id and domain based; path search, bridge-aware dependency closure, and contradiction-path queries remain for 0.8.0.

The bridge metadata is conservative: it grants named capsule inclusion, not broad domain import or action-binding import.

## Verification

Focused bridge test:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-memory/domain-isolation.test.ts
```

Result:

- 1 test file passed.
- 3 tests passed.

Focused regression:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-memory/compiler.test.ts packages/agent-core/test/physics-memory/compiler-v2.test.ts packages/agent-core/test/physics-memory/domain-isolation.test.ts packages/agent-core/test/physics-verticals/librpa.test.ts packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts packages/agent-core/test/research-context/compiler.test.ts
```

Result:

- 6 test files passed.
- 17 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/physics-memory/bridge.ts packages/agent-core/src/physics-memory/compiler.ts packages/agent-core/src/physics-memory/parser.ts packages/agent-core/src/physics-memory/types.ts packages/agent-core/test/physics-memory/domain-isolation.test.ts
```

Result: 0 warnings, 0 errors.

Broad agent-core regression:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 201 test files passed; 1 skipped.
- 2350 tests passed; 6 skipped; 1 todo.

Environment note: commands emitted the known Node engine warning because the local runtime is Node v24.14.0 while the package requests `>=24.15.0`.

## Follow-Ups

0.8.0 should add a graph kernel so bridge behavior can support predictable dependency closure, neighborhood expansion, contradiction paths, and bridge-aware path search instead of only compile-time capsule inclusion.
