# AITP Agent Next Slices And Upstream Sync Implementation Plan

> Superseded as the primary forward roadmap by [AITP Agent Runtime Slices V2 Implementation Plan](2026-06-02-aitp-agent-runtime-slices-v2.md). This file remains useful as the transitional 0.2.1-0.2.5 planning record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current proof-of-shape AITP runtime into a self-consistent theoretical-physics agent runtime whose universal actions, domain profiles, memory compilation, controlled capture, final gates, harnesses, and Kimi Code upstream updates can all be audited slice by slice.

**Architecture:** Keep Kimi Code as the base runtime and continue adding AITP-native layers inside `packages/agent-core`. First repair the abstraction boundary between universal research actions and topic/domain-specific physics content, then make WorkFrames, ledgers, capsules, lenses, final gates, and harnesses operate over structured bindings instead of ad hoc action strings. Track Kimi upstream as a first-class maintenance lane so upstream runtime/tool/session changes are reviewed, merged, tested, and documented without breaking AITP feature flags.

**Tech Stack:** TypeScript, Kimi Code `agent-core`, existing `Session`/`Agent`/`ToolManager`/`AgentRecords`, Markdown+YAML `.aitp` artifacts, Vitest, oxlint, pnpm/corepack, GitHub upstream sync, Codex-inspired tool lifecycle reliability, ForgeCode-inspired eval boundaries.

---

## Current Baseline

This plan starts after these foundations already exist:

- `physics-memory`: file-backed semantic capsules and `PhysicsMemory` tool.
- `research-ledger`: file-backed research events, writer, controlled capture policy, and `ResearchLedger` tool.
- `research-action`: ActionAlgebra definitions, scheduler, WorkFrame helpers, action-call tracing, and `ResearchAction` tool.
- `tool-lifecycle`: primitive tool call records with WorkFrame/action attribution.
- `research-block`: local derivation block to candidate capsule compiler.
- `physics-direction`: early lenses for FQHE/CS and LibRPA.
- `research-policy`: escalation and final-gate utilities.
- `research-harness`: deterministic eval runner.
- `physics-verticals`: FQHE/CS proof-of-shape vertical.

Known design debt:

- Topic-specific actions leaked into universal action definitions.
- Lens outputs currently suggest plain action ids instead of structured action bindings.
- Domain profiles and workflow recipes are not yet first-class file-backed runtime objects.
- The final gate is implemented as a utility but not yet integrated into the model answer lifecycle.
- Ledger capture is controlled but not yet fully automatic from real web/git/test workflows.
- Kimi upstream is not configured as a Git remote in the local fork.

Current upstream observation on 2026-06-02:

```text
MoonshotAI/kimi-code main = 7a47045af2790eba0e68d5406c670ac759b21755
local aitp-agent remotes = origin only
```

Do not hard-code this commit as permanent truth. Each upstream sync slice must refresh it.

## Non-Negotiable Invariants

- Universal research actions must stay domain-neutral.
- Domain-specific physics knowledge belongs in `DomainProfile`, `WorkflowRecipe`, `PhysicsLens`, `CheckContract`, `BenchmarkAdapter`, `ToolAdapter`, capsules, or ledger events.
- A simple question must not trigger a heavy protocol cascade.
- A locally self-contained derivation block should mostly use light checks.
- Capsule/graph/lens lookup should happen at block boundaries, cross-topic boundaries, or when uncertainty/contradiction appears.
- Code-changing work must produce tool lifecycle records, git diff evidence, minimal verification, and failure-to-harness candidates when appropriate.
- Final claims must expose whether they are `raw`, `provisional`, `checked`, `validated`, or `blocked`.
- All experimental behavior must remain feature-flagged and avoid changing upstream Kimi behavior when flags are off.
- Every slice must have tests, an audit note, a commit, and a push.

## Target Runtime Shape

The desired trace for a serious research turn is:

```text
Session
-> WorkFrame
-> ContextPack
-> ResearchActionBinding
-> PrimitiveToolCall(s)
-> LedgerEvent(s)
-> ResearchBlock(s)
-> CandidateCapsule(s)
-> PhysicsLens recommendation(s)
-> Obligation(s)
-> FinalGate
-> HarnessCase(s)
```

The desired trace for a simple explanatory question is:

```text
Session
-> light WorkFrame inference if needed
-> cheap relevant memory/lens hint if confidence is high
-> answer with explicit uncertainty only when needed
```

## Slice 0.2.1: Kimi Upstream Sync Guardrail

### Goal

Make upstream Kimi Code updates a repeatable maintenance operation with a clean audit trail.

### Files

- Create: `docs/internal/upstream-sync-2026-06-02.md`
- Modify only if needed after sync: files changed by upstream merge conflicts.
- Do not modify AITP feature code unless resolving real upstream conflicts.

### Tasks

- [ ] Add or refresh the upstream remote.

```powershell
git -C F:\AI_Workspace\repos\aitp-agent remote add upstream https://github.com/MoonshotAI/kimi-code 2>$null
git -C F:\AI_Workspace\repos\aitp-agent remote -v
```

Expected:

```text
origin   https://github.com/bhjia-phys/Hakimi (fetch)
origin   https://github.com/bhjia-phys/Hakimi (push)
upstream https://github.com/MoonshotAI/kimi-code (fetch)
upstream https://github.com/MoonshotAI/kimi-code (push)
```

- [ ] Fetch upstream and record the upstream commit.

```powershell
git -C F:\AI_Workspace\repos\aitp-agent fetch upstream main
git -C F:\AI_Workspace\repos\aitp-agent rev-parse upstream/main
```

Expected: prints the current upstream `main` commit.

- [ ] Create a sync branch.

```powershell
git -C F:\AI_Workspace\repos\aitp-agent switch -c upstream-sync/2026-06-02
```

- [ ] Run baseline tests before merging.

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Expected: full agent-core suite and typecheck pass, except for the known Node engine warning.

- [ ] Generate upstream delta summaries.

```powershell
git -C F:\AI_Workspace\repos\aitp-agent log --left-right --cherry-pick --oneline main...upstream/main
git -C F:\AI_Workspace\repos\aitp-agent diff --stat main...upstream/main
```

- [ ] Merge or rebase upstream into the sync branch.

```powershell
git -C F:\AI_Workspace\repos\aitp-agent merge upstream/main
```

If conflicts occur, resolve them by preserving upstream Kimi behavior when AITP flags are disabled and preserving AITP feature wiring when flags are enabled.

- [ ] Run post-merge verification.

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src packages/agent-core/test
```

- [ ] Write `docs/internal/upstream-sync-2026-06-02.md` with:

```markdown
# Upstream Sync 2026-06-02

## Upstream

- Remote: https://github.com/MoonshotAI/kimi-code
- Upstream main commit: <commit>
- Local base before sync: <commit>

## Summary

- Files changed by upstream:
- Conflicts:
- AITP feature-flag interactions:
- Runtime/tool/session changes reviewed:

## Verification

- agent-core test:
- agent-core typecheck:
- oxlint:

## Follow-Ups

- <specific follow-up or "None">
```

- [ ] Commit and push the sync branch.

```powershell
git -C F:\AI_Workspace\repos\aitp-agent add .
git -C F:\AI_Workspace\repos\aitp-agent commit -m "chore: sync Kimi Code upstream"
git -C F:\AI_Workspace\repos\aitp-agent push -u origin upstream-sync/2026-06-02
```

### Acceptance

There is a pushed branch and audit document that explain exactly what changed upstream, whether AITP runtime hooks still work, and whether flags-off behavior remains aligned with Kimi.

## Slice 0.2.2: Universal ActionBinding Refactor

### Goal

Remove topic-specific action ids from universal research actions and introduce structured `ResearchActionBinding`.

### Files

- Modify: `packages/agent-core/src/research-action/types.ts`
- Modify: `packages/agent-core/src/research-action/actionalgebra.ts`
- Modify: `packages/agent-core/src/research-action/default-actions.ts`
- Modify: `packages/agent-core/src/research-action/scheduler.ts`
- Modify: `packages/agent-core/src/research-action/harness.ts`
- Modify: `packages/agent-core/src/physics-direction/types.ts`
- Test: `packages/agent-core/test/research-action/action-binding.test.ts`
- Test: `packages/agent-core/test/research-action/default-actions.test.ts`

### Required Type Shape

Add a structured binding type close to:

```ts
export type ResearchActionBinding = {
  id: string
  actionId: ResearchActionId
  domainId?: string
  workflowId?: string
  lensId?: string
  checkId?: string
  adapterId?: string
  objectRefs?: string[]
  params?: Record<string, unknown>
  reason?: string
  priority?: 'low' | 'normal' | 'high' | 'blocking'
}
```

Universal action ids should include generic primitives such as:

```text
scope.define_workframe
source.collect_and_quote
derive.write_local_block
validate.check_convention
validate.check_dimensions
validate.check_limits
validate.check_formula_code_mapping
code.inspect_call_sites
code.capture_diff_observation
benchmark.run_minimal_case
memory.compile_research_block
harness.promote_failure_case
```

### Tasks

- [ ] Add `ResearchActionBinding`.
- [ ] Convert scheduler recommendations to return bindings while preserving a compatibility field for existing tests.
- [ ] Replace LibRPA/FQHE-specific action ids with universal action ids plus `domainId`, `workflowId`, `lensId`, `checkId`, or `adapterId`.
- [ ] Add a guard test that fails if default action ids contain domain nouns such as `librpa`, `fqhe`, `chern`, `cs`, `laughlin`, `head_wing`, or `flux_quantization`.
- [ ] Add a compatibility test proving old string action suggestions can still be read and converted into bindings during the transition.
- [ ] Commit and push.

### Verification

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-action packages/agent-core/test/physics-direction
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

### Acceptance

No universal default action is topic-specific. Lenses, profiles, and evals can still request domain-specific work through structured bindings.

## Slice 0.2.3: DomainProfile And WorkflowRecipe Registry

### Goal

Make domain-specific research guidance file-backed and runtime-loadable instead of hard-coded inside default actions.

### Files

- Create: `packages/agent-core/src/domain-profile/types.ts`
- Create: `packages/agent-core/src/domain-profile/parser.ts`
- Create: `packages/agent-core/src/domain-profile/scanner.ts`
- Create: `packages/agent-core/src/domain-profile/registry.ts`
- Create: `packages/agent-core/src/domain-profile/index.ts`
- Create: `packages/agent-core/src/workflow-recipe/types.ts`
- Create: `packages/agent-core/src/workflow-recipe/parser.ts`
- Create: `packages/agent-core/src/workflow-recipe/scanner.ts`
- Create: `packages/agent-core/src/workflow-recipe/registry.ts`
- Create: `packages/agent-core/src/workflow-recipe/index.ts`
- Modify: `packages/agent-core/src/session/index.ts`
- Modify: `packages/agent-core/src/agent/index.ts`
- Test: `packages/agent-core/test/domain-profile/registry.test.ts`
- Test: `packages/agent-core/test/workflow-recipe/registry.test.ts`

### File-Backed Layout

Project:

```text
.aitp/domain-profiles/**/*.md
.aitp/workflow-recipes/**/*.md
```

User:

```text
~/.aitp/domain-profiles/**/*.md
~/.aitp/workflow-recipes/**/*.md
```

### DomainProfile Frontmatter

```yaml
id: domain.fqhe-cs
title: Fractional quantum Hall and Abelian Chern-Simons theory
kind: domain_profile
domain: fqhe-cs
status: raw
source_refs:
  - ref:user-authored-profile
conventions:
  - convention.external_em_flux
  - convention.emergent_cs_flux
lenses:
  - lens.charge_flux_quantization
workflows:
  - workflow.fqhe-cs.explain-wavefunction-cs-link
```

### WorkflowRecipe Frontmatter

```yaml
id: workflow.librpa.formula-code-mapping
title: Formula to code mapping check
kind: workflow_recipe
domain: librpa
status: raw
action_bindings:
  - actionId: code.inspect_call_sites
    priority: high
  - actionId: validate.check_formula_code_mapping
    priority: blocking
  - actionId: benchmark.run_minimal_case
    priority: high
```

### Tasks

- [ ] Implement parsers with strict frontmatter validation and readable diagnostics.
- [ ] Implement registries following the existing physics-memory and research-ledger registry pattern.
- [ ] Load project and user roots in `Session` behind feature flags:

```text
KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE=1
KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE=1
```

- [ ] Expose registries on `Agent` without exposing new model tools yet.
- [ ] Add tests for project root precedence, user root loading, duplicate ids, invalid frontmatter, and recursive scanning.
- [ ] Commit and push.

### Verification

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/domain-profile packages/agent-core/test/workflow-recipe packages/agent-core/test/session
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

### Acceptance

Domain guidance can be added or changed by editing `.aitp/domain-profiles` and `.aitp/workflow-recipes` without changing universal action code.

## Slice 0.2.4: Physics Lens Binding Refactor

### Goal

Make physics lenses produce structured checks and action bindings, not loose natural-language hints or topic-specific action ids.

### Files

- Modify: `packages/agent-core/src/physics-direction/types.ts`
- Modify: `packages/agent-core/src/physics-direction/lens.ts`
- Modify: `packages/agent-core/src/physics-direction/domain-packs/fqhe-cs.ts`
- Modify: `packages/agent-core/src/physics-direction/domain-packs/librpa-head-wing.ts`
- Test: `packages/agent-core/test/physics-direction/lens.test.ts`

### Required Output Shape

Lens recommendation should include:

```ts
{
  lensId: 'lens.charge_flux_quantization',
  applicability: 'applicable',
  suggestedActionBindings: [
    {
      id: 'binding.charge-flux-convention',
      actionId: 'validate.check_convention',
      domainId: 'fqhe-cs',
      lensId: 'lens.charge_flux_quantization',
      checkId: 'check.charge-flux-quantization.convention',
      priority: 'blocking'
    }
  ],
  requiredDistinctions: [
    'external_em_flux',
    'emergent_cs_flux',
    'berry_curvature_flux'
  ]
}
```

### Tasks

- [ ] Add `CheckContract` fields to lens recommendations.
- [ ] Move domain-specific check details from action ids into `checkId`, `requiredDistinctions`, and `params`.
- [ ] Make FQHE/CS charge-flux lens recommend `validate.check_convention`.
- [ ] Make LibRPA head-wing lens recommend `validate.check_formula_code_mapping` and `benchmark.run_minimal_case`.
- [ ] Update eval runner compatibility with action bindings.
- [ ] Commit and push.

### Acceptance

The same universal validator action can serve FQHE charge-flux convention checks, LibRPA formula-code mapping checks, and future quantum-gravity convention checks by changing the lens/profile binding.

## Slice 0.2.5: WorkFrame Orchestrator And Dynamic Context Packs

### Goal

Make WorkFrame the runtime control unit that decides what memory, ledger events, domain profiles, workflows, lenses, obligations, and tools should be visible in the current turn.

### Files

- Create: `packages/agent-core/src/agent/workframe/context-pack.ts`
- Create: `packages/agent-core/src/agent/workframe/orchestrator.ts`
- Modify: `packages/agent-core/src/agent/workframe/index.ts`
- Modify: `packages/agent-core/src/agent/turn/index.ts`
- Modify: `packages/agent-core/src/session/index.ts`
- Test: `packages/agent-core/test/workframe/orchestrator.test.ts`
- Test: `packages/agent-core/test/agent/workframe-context-pack.test.ts`

### ContextPack Shape

```ts
export type ContextPack = {
  id: string
  workFrameId: string
  capsuleRefs: string[]
  ledgerEventRefs: string[]
  domainProfileRefs: string[]
  workflowRecipeRefs: string[]
  lensRefs: string[]
  openObligationRefs: string[]
  exposedToolNames: string[]
  budget: {
    maxCapsules: number
    maxLedgerEvents: number
    maxLenses: number
  }
}
```

### Tasks

- [ ] Implement WorkFrame inference from user message, active files, current cwd, and active action calls.
- [ ] Compile a small ContextPack from registries and recent records.
- [ ] Expose only relevant AITP tools when a WorkFrame needs them.
- [ ] Record `workframe.context_pack_compiled`.
- [ ] Add tests proving LibRPA context does not leak into FQHE/CS and FQHE/CS does not leak into LibRPA unless an explicit bridge exists.
- [ ] Commit and push.

### Acceptance

In a real turn, the model receives a small, relevant, progressive context pack instead of the whole memory/ledger/skill universe.

## Slice 0.2.6: Controlled Auto Capture From Real Work

### Goal

Automatically write high-value research-ledger events from real source search, git diff inspection, code changes, test runs, and failures.

### Files

- Modify: `packages/agent-core/src/research-ledger/capture-policy.ts`
- Modify: `packages/agent-core/src/agent/tool-lifecycle/index.ts`
- Modify: `packages/agent-core/src/agent/research-ledger/index.ts`
- Modify: `packages/agent-core/src/agent/research-action/index.ts`
- Create: `packages/agent-core/src/agent/research-ledger/auto-capture.ts`
- Test: `packages/agent-core/test/research-ledger/auto-capture.test.ts`

### Capture Rules

Capture automatically only when at least one condition is true:

- tool call is inside an active `ResearchActionCall`;
- tool output is a test/benchmark result;
- tool output is a git diff or commit observation;
- tool output is a source excerpt with URL, DOI, arXiv id, paper id, or local artifact ref;
- tool failure belongs to a blocking or high-priority obligation.

Never auto-capture:

- arbitrary directory listings;
- full secrets or environment dumps;
- large raw logs without an artifact reference;
- model-only speculation without source or artifact refs.

### Tasks

- [ ] Add auto-capture classifier tests for source, git, benchmark, failure, and ignored low-value calls.
- [ ] Implement `autoCaptureToolLifecycleRecord`.
- [ ] Write ledger events into `.aitp/research-ledger/<topic>/events/`.
- [ ] Add artifact references for large outputs rather than copying large outputs into event bodies.
- [ ] Record `research_ledger.auto_capture_skipped` with a reason when capture is rejected.
- [ ] Commit and push.

### Acceptance

After a real code/test turn, the ledger contains concise evidence events with artifact refs, not a noisy transcript dump.

## Slice 0.2.7: Memory Compiler V2

### Goal

Compile ledger events, research blocks, action traces, profiles, and workflow recipes into typed candidate graph objects and capsules.

### Files

- Modify: `packages/agent-core/src/physics-memory/types.ts`
- Modify: `packages/agent-core/src/physics-memory/compiler.ts`
- Modify: `packages/agent-core/src/research-block/compiler.ts`
- Create: `packages/agent-core/src/physics-memory/graph-types.ts`
- Create: `packages/agent-core/src/physics-memory/dependency-checker.ts`
- Create: `packages/agent-core/src/physics-memory/provenance-checker.ts`
- Test: `packages/agent-core/test/physics-memory/compiler-v2.test.ts`

### Candidate Object Types

Use universal object kinds, not topic nouns:

```text
definition
notation
convention
assumption
formula
derivation_step
theorem
lemma
code_mapping
intermediate_observable
benchmark_case
failure_mode
workflow_recipe
bridge
```

### Tasks

- [ ] Add candidate graph node and edge types with provenance and trust state.
- [ ] Compile ledger `equation_candidate` into formula candidates.
- [ ] Compile ledger `code_observation` into code-mapping candidates.
- [ ] Compile failed action traces into failure-mode candidates.
- [ ] Add contradiction diagnostics for incompatible conventions in the same WorkFrame.
- [ ] Add dependency diagnostics for formulas that refer to missing definitions or assumptions.
- [ ] Commit and push.

### Acceptance

The compiler produces a small typed graph/capsule proposal that can explain what it depends on, what evidence supports it, and why it is not yet validated.

## Slice 0.2.8: Promotion Pipeline And Trust States

### Goal

Add a strict path from raw research material to promoted physics memory.

### Files

- Create: `packages/agent-core/src/physics-memory/promotion.ts`
- Modify: `packages/agent-core/src/physics-memory/types.ts`
- Modify: `packages/agent-core/src/tools/builtin/collaboration/physics-memory-tool.ts`
- Test: `packages/agent-core/test/physics-memory/promotion.test.ts`

### Trust States

Use the existing trust ladder consistently:

```text
raw -> parsed -> linked -> checked -> validated -> formalized
raw -> parsed -> rejected
```

### Tasks

- [ ] Add `PromotionPacket` type with source refs, validation refs, known failure modes, and human checkpoint fields.
- [ ] Implement promotion checks that reject source-free or scope-free candidates.
- [ ] Add a `compile_promotion_packet` action to `PhysicsMemory` or a separate guarded manager.
- [ ] Require explicit human checkpoint for `validated` and above.
- [ ] Add tests for rejected, checked, validated, and formalized transitions.
- [ ] Commit and push.

### Acceptance

Long-term physics memory remains reusable and trusted because raw session material cannot silently become canonical memory.

## Slice 0.2.9: Final Gate Integration

### Goal

Connect the final gate to the actual assistant answer lifecycle so unresolved blocking obligations and missing evidence affect final response status.

### Files

- Modify: `packages/agent-core/src/agent/turn/index.ts`
- Modify: `packages/agent-core/src/research-policy/final-gate.ts`
- Modify: `packages/agent-core/src/agent/research-action/index.ts`
- Test: `packages/agent-core/test/research-policy/final-gate.test.ts`
- Test: `packages/agent-core/test/agent/final-gate-integration.test.ts`

### Tasks

- [ ] Detect when a turn is inside an active WorkFrame.
- [ ] Gather open obligations, evidence refs, action calls, and final claim status.
- [ ] For simple/low-risk answers, append no extra protocol text unless the gate finds a real issue.
- [ ] For blocked claims, force a concise status such as:

```text
Status: provisional. Blocking checks still open: convention.check.charge-flux-distinction.
```

- [ ] For code-changing work, require at least one relevant verification action or explicitly state it was not run.
- [ ] Add tests that simple answers stay simple, while validated claims with missing evidence are downgraded.
- [ ] Commit and push.

### Acceptance

The agent becomes harder to overclaim without becoming verbose for every small question.

## Slice 0.3: Harness V2 And Eval Files

### Goal

Make harness cases file-backed, replayable, and tied to action bindings, WorkFrames, ledger events, and final-gate outcomes.

### Files

- Create: `packages/agent-core/src/research-harness/parser.ts`
- Create: `packages/agent-core/src/research-harness/scanner.ts`
- Create: `packages/agent-core/src/research-harness/registry.ts`
- Modify: `packages/agent-core/src/research-harness/runner.ts`
- Modify: `packages/agent-core/src/research-action/harness.ts`
- Test: `packages/agent-core/test/research-harness/registry.test.ts`
- Test: `packages/agent-core/test/research-harness/runner-v2.test.ts`

### File Layout

```text
.aitp/evals/**/*.md
~/.aitp/evals/**/*.md
```

### Eval Case Frontmatter

```yaml
id: eval.fqhe-cs.charge-flux-convention.basic
domain: fqhe-cs
kind: research_eval_case
input_kind: theory_question
required_action_bindings:
  - actionId: validate.check_convention
    lensId: lens.charge_flux_quantization
expected_final_status: checked
forbidden_claims:
  - "Berry curvature flux is identical to external electromagnetic flux"
```

### Tasks

- [ ] Add parser/registry for file-backed evals.
- [ ] Run evals against deterministic traces first.
- [ ] Add model-in-loop eval adapter later behind a separate feature flag.
- [ ] Convert failed/inconclusive action records into candidate eval files.
- [ ] Add tests for required actions, forbidden claims, required evidence, and expected final status.
- [ ] Commit and push.

### Acceptance

AITP can store and rerun lessons from past failures instead of only storing memories.

## Slice 0.4: Real LibRPA Vertical

### Goal

Replace the LibRPA proof-of-shape with a real, generic-action-driven workflow for formula-code mapping and minimal benchmark verification.

### Files

- Create file-backed profiles under test fixtures for:
  - `.aitp/domain-profiles/librpa.md`
  - `.aitp/workflow-recipes/librpa/formula-code-mapping.md`
  - `.aitp/evals/librpa/head-wing-minimal.md`
- Modify: `packages/agent-core/src/physics-direction/domain-packs/librpa-head-wing.ts`
- Create: `packages/agent-core/src/benchmark-adapter/types.ts`
- Create: `packages/agent-core/src/benchmark-adapter/librpa-smoke.ts`
- Test: `packages/agent-core/test/physics-verticals/librpa.test.ts`

### Tasks

- [ ] Move LibRPA-specific action details into workflow recipes and adapters.
- [ ] Bind `code.inspect_call_sites`, `validate.check_formula_code_mapping`, and `benchmark.run_minimal_case` through workflow recipes.
- [ ] Capture git diff observations automatically.
- [ ] Run a CI-safe smoke benchmark stand-in in tests.
- [ ] Keep real remote/HPC execution out of core tests; expose it as an adapter contract.
- [ ] Commit and push.

### Acceptance

The LibRPA vertical demonstrates real code-research discipline while keeping the universal action algebra clean.

## Slice 0.5: FQHE/CS Theory Vertical V2

### Goal

Move FQHE/CS theory content from hard-coded vertical proof into file-backed profiles, capsules, workflows, lenses, and evals.

### Files

- Create file-backed fixtures for:
  - `.aitp/domain-profiles/fqhe-cs.md`
  - `.aitp/physics-memory/fqhe-cs/*.md`
  - `.aitp/workflow-recipes/fqhe-cs/*.md`
  - `.aitp/evals/fqhe-cs/*.md`
- Modify: `packages/agent-core/src/physics-verticals/fqhe-cs.ts`
- Test: `packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts`

### Tasks

- [ ] Represent Laughlin wavefunction, charge pump, Abelian CS action, and K-matrix response as file-backed memory/capsule fixtures.
- [ ] Make the charge-flux lens load its distinctions from DomainProfile.
- [ ] Ensure the question "why does smaller fractional charge seem to correspond to larger flux" triggers Dirac/Aharonov-Bohm style charge-flux convention checks.
- [ ] Add eval cases for common wrong answers:

```text
confusing external EM flux with emergent CS flux
confusing Berry curvature flux with AB flux
forgetting the charge in q Phi / hbar
overstating non-Abelian generality from Abelian examples
```

- [ ] Commit and push.

### Acceptance

The model is not forced through a giant protocol, but when this conceptual trap appears, the runtime can expose the right capsule/lens/check at the right boundary.

## Slice 0.6: Multi-Domain Isolation And Bridge Capsules

### Goal

Prevent accidental contamination between LibRPA, QFT, quantum gravity, topological order, FQHE/CS, and future domains.

### Files

- Modify: `packages/agent-core/src/physics-memory/types.ts`
- Modify: `packages/agent-core/src/physics-memory/compiler.ts`
- Modify: `packages/agent-core/src/agent/workframe/context-pack.ts`
- Create: `packages/agent-core/src/physics-memory/bridge.ts`
- Test: `packages/agent-core/test/physics-memory/domain-isolation.test.ts`

### Tasks

- [ ] Add explicit `bridge` capsule support.
- [ ] Require bridge capsules for cross-domain ContextPack inclusion.
- [ ] Add tests proving LibRPA memory cannot enter QFT/FQHE contexts without bridge evidence.
- [ ] Add tests for allowed bridges, such as Chern-Simons theory between QFT and topological order when explicitly declared.
- [ ] Commit and push.

### Acceptance

Cross-domain creativity is possible, but accidental context pollution is blocked by default.

## Slice 0.7: Formalization Bridge

### Goal

Prepare a narrow bridge to Lean/Physlib/OMDoc-style formalization without requiring full formal proofs for every physics task.

### Files

- Create: `packages/agent-core/src/formalization/types.ts`
- Create: `packages/agent-core/src/formalization/lean-contract.ts`
- Create: `packages/agent-core/src/formalization/blueprint.ts`
- Test: `packages/agent-core/test/formalization/lean-contract.test.ts`

### Tasks

- [ ] Define formalizable object contracts for definitions, assumptions, lemmas, and theorem-like claims.
- [ ] Add a `formalization_candidate` trust state transition path.
- [ ] Export dependency graphs in a simple blueprint-like format.
- [ ] Add tests that non-formalized physics claims remain useful but cannot be mislabeled as formalized.
- [ ] Commit and push.

### Acceptance

AITP can learn from proof-assistant architecture while remaining useful for physics that is not yet formalizable.

## Continuous Upstream Lane

Run this lane before each major runtime refactor and at least once every two weeks while active development continues.

### Checklist

- [ ] Fetch upstream Kimi.
- [ ] Compare upstream runtime/session/tool changes.
- [ ] Run baseline tests before merge.
- [ ] Merge on a dedicated sync branch.
- [ ] Run full tests after merge.
- [ ] Update an upstream sync audit doc.
- [ ] Merge or fast-forward back into the AITP development branch only after review.

### Risk Areas To Inspect In Every Upstream Sync

- `packages/agent-core/src/session/index.ts`
- `packages/agent-core/src/agent/index.ts`
- `packages/agent-core/src/agent/turn/index.ts`
- `packages/agent-core/src/agent/tool/index.ts`
- `packages/agent-core/src/tools/builtin/*`
- records/replay/compaction code paths
- MCP/tool registry changes
- package manager, lockfile, Node engine, test runner, and lint config

### Sync Acceptance

AITP feature flags off:

```text
Behavior should match Kimi upstream expectations.
```

AITP feature flags on:

```text
PhysicsMemory, ResearchLedger, ResearchAction, WorkFrame, tool lifecycle, final gate, and harness tests should pass.
```

## Standard Verification For Every Slice

Run focused tests first:

```powershell
corepack pnpm --config.engine-strict=false vitest run <focused-test-files>
```

Run agent-core typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Run focused lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint <changed-src-and-test-paths>
```

Run full agent-core suite before final push:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

Then commit and push:

```powershell
git -C F:\AI_Workspace\repos\aitp-agent status --short
git -C F:\AI_Workspace\repos\aitp-agent add <changed-files>
git -C F:\AI_Workspace\repos\aitp-agent commit -m "<type>(agent-core): <slice summary>"
git -C F:\AI_Workspace\repos\aitp-agent push
```

Every slice must update one audit document under `docs/internal/` with:

- scope;
- files changed;
- runtime behavior;
- feature flags;
- verification;
- remaining boundaries;
- upstream interaction if relevant.

## Recommended Execution Order

Do not build more topic-specific verticals before completing these four slices:

```text
0.2.1 Kimi Upstream Sync Guardrail
0.2.2 Universal ActionBinding Refactor
0.2.3 DomainProfile And WorkflowRecipe Registry
0.2.4 Physics Lens Binding Refactor
```

Reason:

```text
The current runtime proves the concept, but adding more domain content now would make the action layer less universal.
The next priority is architectural self-consistency.
```

After those are complete, execute:

```text
0.2.5 WorkFrame Orchestrator
0.2.6 Controlled Auto Capture
0.2.7 Memory Compiler V2
0.2.8 Promotion Pipeline
0.2.9 Final Gate Integration
0.3 Harness V2
0.4 Real LibRPA Vertical
0.5 FQHE/CS V2
0.6 Multi-Domain Isolation
0.7 Formalization Bridge
```

## Expected User-Visible Shape After Completion

For a physics theory question:

```text
User asks a conceptual or derivation question.
Agent opens or infers a WorkFrame.
Agent loads a compact ContextPack.
Agent answers normally if the task is simple.
If a known trap appears, a physics lens raises a specific check.
If the derivation becomes a reusable block, the compiler proposes a capsule.
If final claims exceed evidence, the final gate downgrades the status.
Failures become harness cases.
```

For a code-research task:

```text
User asks for a LibRPA or numerical-code change.
Agent opens a code_method WorkFrame.
WorkflowRecipe binds universal actions to the LibRPA domain.
Tool lifecycle records shell/git/test calls.
Controlled capture writes git/test/failure evidence to the ledger.
Formula-code mapping checks and minimal benchmark checks become obligations.
Final answer reports what changed, what was verified, what remains uncertain.
Failures become eval/harness candidates.
```

For upstream maintenance:

```text
Agent syncs Kimi upstream on a dedicated branch.
Agent audits runtime/tool/session changes.
AITP flags-off behavior remains compatible with Kimi.
AITP flags-on tests prove physics runtime hooks still work.
The sync is committed, pushed, and documented.
```

## Self-Review

Spec coverage:

- Upstream Kimi updates are covered by 0.2.1 and the continuous upstream lane.
- The action pollution problem is covered by 0.2.2 and 0.2.4.
- Domain-specific physics guidance is moved into file-backed profiles and recipes in 0.2.3.
- Real session intelligence is handled by WorkFrame orchestration, ContextPack compilation, lenses, final gate, and controlled capture.
- Harness/self-evolution is covered by 0.3 and by failure-to-eval conversion.
- LibRPA and FQHE/CS are handled as vertical slices after the universal runtime boundary is repaired.

Placeholder scan:

- No task uses `TBD` or an unspecified "handle later" placeholder.
- Each slice has concrete files, tests, commands, and acceptance criteria.

Type consistency:

- `ResearchActionBinding`, `DomainProfile`, `WorkflowRecipe`, `ContextPack`, `CheckContract`, `PromotionPacket`, and eval-case frontmatter are introduced before they are used in later slices.
