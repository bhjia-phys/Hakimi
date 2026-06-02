# AITP Agent 0.6.0 Audit

## Scope

This audit covers the FQHE/CS theory vertical V2.

Implemented:

- file-backed FQHE/CS domain profile under `.aitp/domain-profiles`;
- file-backed charge-flux workflow recipe under `.aitp/workflow-recipes`;
- file-backed physics-memory capsules for Laughlin wavefunction, flux insertion, Abelian CS response, K-matrix response, known-limit checks, and flux-identity failure mode;
- file-backed eval case `eval.fqhe-cs.charge-flux-v2`;
- isolated-session tests that load FQHE and LibRPA `.aitp` fixtures together while compiling a domain-clean FQHE context pack;
- eval tests for the successful convention/known-limit path and for the flux-identity conflation trap.

## Runtime Behavior

The FQHE/CS vertical now has the same durable runtime shape as the LibRPA vertical:

```text
.aitp/domain-profiles/fqhe-cs.md
-> .aitp/workflow-recipes/fqhe/charge-flux-convention.md
-> .aitp/physics-memory/fqhe-cs/*.md
-> .aitp/evals/fqhe/charge-flux-v2.md
```

The workflow binds universal actions through FQHE-specific metadata:

- `physics.apply_direction_lens` with `lensId=charge_flux_quantization`;
- `validate.check_convention` with `checkId=check.charge-flux-quantization.convention`;
- `derive.compare_with_known_result` with `checkId=check.charge-flux-quantization.limiting-case`;
- `graph.query_dependency_closure` for prerequisite tracing.

The eval requires action outcomes, convention evidence, required convention and limiting-case checks, validated final status, and absence of forbidden flux-conflation claims.

## Isolation Review

The focused V2 test copies the full repo `.aitp` tree, including both LibRPA and FQHE fixtures, into a temporary project root. It then opens an FQHE WorkFrame and compiles a `ResearchContextPack`.

The resulting pack includes only:

- `benchmark.fqhe-cs.known-limits`;
- `definition.fqhe-cs.laughlin-wavefunction`;
- `derivation.fqhe-cs.flux-insertion-charge-pump`;
- `formula.fqhe-cs.cs-action-laughlin`;
- `formula.fqhe-cs.kmatrix-response`.

The test explicitly asserts that no LibRPA capsule enters this FQHE context pack. This is not yet full bridge enforcement, but it proves the current profile/workflow/memory compilation path can keep domain packs separate when no bridge is requested.

## Boundaries

This slice does not add new physics-direction logic; it reuses the existing charge-flux lens and convention checker. It also does not implement graph-kernel path search or bridge capsules. Those are left for 0.7.0 and 0.8.0.

The known-limit check is represented as a deterministic theory `BenchmarkCase` capsule, not as a numerical benchmark.

## Verification

Focused FQHE V2 test:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts
```

Result:

- 1 test file passed.
- 3 tests passed.

Focused FQHE regression:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-verticals/fqhe-cs.test.ts packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-harness/runner.test.ts
```

Result:

- 4 test files passed.
- 14 tests passed.

Focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/benchmark-adapter packages/agent-core/src/research-action/librpa-head-wing.ts packages/agent-core/src/index.ts packages/agent-core/test/physics-verticals/librpa.test.ts packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts
```

Result: 0 warnings, 0 errors.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Broad agent-core regression:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Result:

- 200 test files passed; 1 skipped.
- 2347 tests passed; 6 skipped; 1 todo.

Environment note: commands emitted the known Node engine warning because the local runtime is Node v24.14.0 while the package requests `>=24.15.0`.

## Follow-Ups

0.7.0 should now add explicit bridge capsules and diagnostics for accidental domain bleed. The new FQHE/CS and LibRPA fixtures provide concrete domains for that bridge-gating test.
