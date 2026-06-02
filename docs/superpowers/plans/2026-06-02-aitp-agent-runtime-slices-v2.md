# AITP Agent Runtime Slices V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-baseline AITP Agent after the implemented 0.2.5 foundation and define the remaining slices needed to turn the existing memory, ledger, action, WorkFrame, and ContextPack pieces into a self-consistent theoretical-physics research runtime.

**Architecture:** Keep Kimi Code as the base runtime and treat AITP as a runtime-native extension inside `packages/agent-core`. Do not add more topic-specific behavior until the current components are wired into a real turn lifecycle: WorkFrame inference, ContextPack injection, dynamic tool exposure, controlled auto-capture, graph compilation, promotion, final-gate enforcement, and eval replay must become one closed loop. Borrow Codex-style runtime discipline for tool lifecycle and verification, and ForgeCode-style harness/eval boundaries for replayability and audit.

**Tech Stack:** TypeScript, Kimi Code `agent-core`, existing `Session`/`Agent`/`ToolManager`/`AgentRecords`, Markdown+YAML `.aitp` artifacts, Vitest, oxlint, pnpm/corepack, GitHub upstream sync, AITP feature flags, file-backed registries, replayable records.

---

## Current Implemented Baseline

This plan starts from the actual implemented baseline, not from the original wish list.

Completed or substantially present in code and audit:

- 0.0.1 `physics-memory`
- 0.0.2 `research-ledger` and `research-action`
- 0.0.3 thin primitive tool lifecycle spine
- 0.0.4 ledger writer and controlled capture primitives
- 0.0.5 WorkFrame runtime state and action-call trace
- 0.0.6 first LibRPA proof-of-shape micro slice
- 0.0.7 capsule boundary compiler
- 0.0.8 first applicability-gated physics lenses
- 0.0.9 escalation and final-gate utilities
- 0.1 harness/eval runner foundations
- 0.2 FQHE/CS proof-of-shape vertical
- 0.2.1 Kimi upstream sync lane
- 0.2.2 universal `ResearchActionBinding`
- 0.2.3 file-backed `DomainProfile` and `WorkflowRecipe`
- 0.2.5 first WorkFrame `ResearchContextPack` orchestrator

This means the next phase is not "add another subsystem". The next phase is runtime closure.

## Why Re-Slice Now

The old roadmap was useful when the project was mostly conceptual. It is now too linear and partially stale because several slices were implemented out of the original order, and some remaining work items are no longer the right boundaries.

The current risk is not missing abstractions. The current risk is that the agent has many good local pieces but still lacks the runtime closure that makes them matter in real sessions:

- WorkFrames exist, but they are not yet a reliable turn controller.
- Context packs can compile, but they are not yet injected into the model loop as the default research context boundary.
- Tool lifecycle records exist, but they are not yet systematically converted into evidence.
- Lenses can recommend checks, but those checks are not yet consistently enforced at answer time.
- Harness foundations exist, but failures from live work are not yet turned into durable replay cases by default.
- Domain memory is file-backed, but there is not yet a graph kernel that can robustly manage contradictions, bridges, and dependency queries across domains.

So the new slices are organized around the missing closures in the real runtime.

## Non-Negotiable Runtime Invariants

- Kimi Code remains the implementation baseline.
- AITP behavior stays feature-flagged unless intentionally promoted.
- Universal actions stay domain-neutral.
- Domain guidance belongs in file-backed profiles, recipes, lenses, checks, adapters, capsules, and graph objects.
- Simple answers must remain simple.
- Heavy research protocol should appear only when the task becomes risky, cross-boundary, reusable, or code-affecting.
- Physics memory is not a prompt dump; it is a typed, scoped, trust-aware memory substrate.
- Research ledger is not trusted memory; it is a source-backed event substrate.
- Candidate capsules are boundary objects, not the full graph.
- Cross-domain transfer must require an explicit bridge or equivalent gate.
- Final answers must not silently overclaim when evidence or blocking checks are missing.
- Every slice must produce auditable files, tests where appropriate, and a versioned note in `docs/internal/`.

## North Star User Experience

The final runtime shape should feel light from the outside:

```text
simple explanation
-> natural answer, maybe one cheap self-check

local derivation block
-> mostly free reasoning, plus local obligations if needed

derivation block completed
-> candidate capsule compiled at the boundary

cross-topic or cross-block connection
-> graph query, bridge check, or lens-guided distinction

code/repo/benchmark work
-> WorkFrame, action bindings, tool trace, evidence capture, verification obligations

final conclusion
-> validated/provisional/blocked status if the task was high-risk

failure or confusion
-> harness candidate and memory compiler input
```

The user should not feel trapped inside a protocol machine. The runtime should quietly get stricter only when the task needs it.

## Remaining Slices

### Slice 0.2.6: Turn Loop Context Closure

**Goal:** Make WorkFrame and `ResearchContextPack` part of the actual turn lifecycle instead of a side structure.

**Why now:** This is the first missing closure. Without it, memory, profile, workflow, and lens selection remain optional attachments instead of runtime defaults.

**Primary files:**

- Modify: `packages/agent-core/src/agent/turn/index.ts`
- Modify: `packages/agent-core/src/agent/workframe/index.ts`
- Modify: `packages/agent-core/src/agent/workframe/orchestrator.ts`
- Modify: `packages/agent-core/src/agent/workframe/context-pack.ts`
- Modify: `packages/agent-core/src/agent/index.ts`
- Test: `packages/agent-core/test/agent/research-context.test.ts`
- Test: `packages/agent-core/test/agent/workframe.test.ts`

**Deliverables:**

- infer or reuse the active WorkFrame for research turns;
- compile a bounded context pack before model-facing research reasoning;
- inject only the compact pack summary, not whole registries;
- attach the active pack id to the turn records;
- preserve isolation between simultaneous domains unless bridged.

**Acceptance:**

- a LibRPA turn and an FQHE turn get different compact context packs;
- the agent can replay which pack was active for a turn;
- the model loop can see the pack summary without loading the whole memory universe.

### Slice 0.2.7: Dynamic Tool Exposure And Tool Budgeting

**Goal:** Expose tools progressively from WorkFrame, ContextPack, action bindings, and domain adapters so the runtime can narrow what the model sees and what it is expected to use.

**Why now:** A research runtime is only partly about memory. It is also about making the right actions and tools visible at the right time.

**Primary files:**

- Create: `packages/agent-core/src/agent/tool-exposure/`
- Modify: `packages/agent-core/src/agent/tool/index.ts`
- Modify: `packages/agent-core/src/agent/turn/index.ts`
- Modify: `packages/agent-core/src/research-action/types.ts`
- Test: `packages/agent-core/test/agent/tool-exposure.test.ts`

**Deliverables:**

- define exposure classes such as always-available, research-conditional, workflow-conditional, and adapter-conditional;
- let a context pack request a narrowed tool surface;
- record which tools were exposed for a turn;
- keep fallback escape hatches for expert users and debug sessions.

**Acceptance:**

- simple turns do not receive the full research tool universe;
- code tasks expose git/test/diff-oriented tools and relevant research actions;
- theory tasks expose memory/lens/check-oriented tools without irrelevant code-heavy clutter.

### Slice 0.2.8: Controlled Auto Capture From Real Work

**Goal:** Convert real tool outcomes into concise ledger evidence automatically when the runtime has enough structure to know the evidence matters.

**Why now:** The ledger only becomes valuable once it writes from live work rather than hand-authored demonstrations.

**Primary files:**

- Create: `packages/agent-core/src/agent/research-ledger/auto-capture.ts`
- Modify: `packages/agent-core/src/agent/tool-lifecycle/index.ts`
- Modify: `packages/agent-core/src/research-ledger/capture-policy.ts`
- Modify: `packages/agent-core/src/agent/research-ledger/index.ts`
- Test: `packages/agent-core/test/research-ledger/auto-capture.test.ts`

**Deliverables:**

- auto-capture for source excerpts, git diff observations, test/benchmark observations, and blocking failures;
- artifact references for long outputs;
- explicit skip reasons for ignored low-value tool calls;
- linkage from auto-captured events back to WorkFrame and action call ids.

**Acceptance:**

- a real code/test turn leaves a compact evidence trail in `.aitp/research-ledger`;
- directory listings and low-value shell noise do not flood the ledger;
- failure evidence can later feed harness creation.

### Slice 0.2.9: Memory Compiler V2 And Candidate Graph Merge

**Goal:** Compile ledger events, blocks, bindings, and traces into typed candidate graph objects with dependency and contradiction checks.

**Why now:** Capsules are not enough once the runtime starts collecting richer evidence. The system needs a graph-aware compilation layer underneath them.

**Primary files:**

- Modify: `packages/agent-core/src/physics-memory/compiler.ts`
- Create: `packages/agent-core/src/physics-memory/graph-types.ts`
- Create: `packages/agent-core/src/physics-memory/dependency-checker.ts`
- Create: `packages/agent-core/src/physics-memory/contradiction-checker.ts`
- Create: `packages/agent-core/src/physics-memory/provenance-checker.ts`
- Test: `packages/agent-core/test/physics-memory/compiler-v2.test.ts`

**Deliverables:**

- universal graph object kinds such as `definition`, `notation`, `convention`, `assumption`, `formula`, `derivation_step`, `code_mapping`, `benchmark_case`, `failure_mode`, `workflow_recipe`, and `bridge`;
- dependency diagnostics for missing prerequisites;
- contradiction diagnostics for incompatible conventions and claims;
- candidate merge rules that preserve provenance and trust state.

**Acceptance:**

- the compiler can explain why a candidate depends on certain assumptions;
- incompatible conventions in one WorkFrame are flagged rather than silently blended;
- compiled outputs are still candidate-level unless promoted.

### Slice 0.3.0: Promotion Pipeline And Trust Ladder Enforcement

**Goal:** Put a strict gate between session material and reusable canonical memory.

**Why now:** Once the compiler becomes stronger, the temptation to treat all compiled objects as trusted memory becomes dangerous.

**Primary files:**

- Create: `packages/agent-core/src/physics-memory/promotion.ts`
- Modify: `packages/agent-core/src/physics-memory/types.ts`
- Modify: `packages/agent-core/src/tools/builtin/collaboration/physics-memory-tool.ts`
- Test: `packages/agent-core/test/physics-memory/promotion.test.ts`

**Deliverables:**

- `PromotionPacket` with source refs, validation refs, failure modes, scope, and human checkpoint fields;
- enforce the trust ladder `raw -> parsed -> linked -> checked -> validated -> formalized` and rejection paths;
- prevent source-free or scope-free candidates from promotion.

**Acceptance:**

- promoted memory remains auditable and conservative;
- raw session material cannot silently become canonical memory;
- the agent can state why a memory object is only `checked` or only `linked`.

### Slice 0.3.1: Final Gate Lifecycle Integration

**Goal:** Make the final gate affect real answer rendering for research turns.

**Why now:** Utilities are not enough. The answer lifecycle must actually honor the runtime's checks.

**Primary files:**

- Modify: `packages/agent-core/src/agent/turn/index.ts`
- Modify: `packages/agent-core/src/research-policy/final-gate.ts`
- Modify: `packages/agent-core/src/research-action/index.ts`
- Test: `packages/agent-core/test/agent/final-gate-integration.test.ts`

**Deliverables:**

- detect when a turn is inside a high-risk WorkFrame;
- gather obligations, evidence refs, and verification actions before final rendering;
- render concise `validated`, `provisional`, or `blocked` status only when the task warrants it;
- keep casual answers clean.

**Acceptance:**

- simple questions stay natural;
- code changes and risky derivations cannot quietly overclaim completion;
- missing checks surface as brief status, not verbose protocol dump.

### Slice 0.4.0: Harness V2 And File-Backed Eval Cases

**Goal:** Make replay and self-improvement file-backed, inspectable, and reusable across sessions.

**Why now:** Auto-capture and final-gate failures should naturally become replayable eval material.

**Primary files:**

- Create: `packages/agent-core/src/research-harness/parser.ts`
- Create: `packages/agent-core/src/research-harness/scanner.ts`
- Create: `packages/agent-core/src/research-harness/registry.ts`
- Modify: `packages/agent-core/src/research-harness/runner.ts`
- Test: `packages/agent-core/test/research-harness/runner-v2.test.ts`
- Create: `.aitp/evals/`

**Deliverables:**

- file-backed eval cases under project and user roots;
- deterministic replay of action bindings, evidence expectations, and final statuses;
- conversion from failed or inconclusive live traces into candidate evals.

**Acceptance:**

- the runtime can store and rerun lessons from failure;
- harness logic no longer depends only on in-memory demos;
- evals can check required actions, forbidden claims, and required evidence.

### Slice 0.5.0: Real LibRPA Vertical

**Goal:** Replace the existing proof-of-shape LibRPA micro slice with a genuinely generic-action-driven vertical.

**Why now:** After the universal runtime boundary is closed, domain work can become clean rather than special-cased.

**Primary files:**

- Create file-backed test fixtures under:
  - `.aitp/domain-profiles/`
  - `.aitp/workflow-recipes/`
  - `.aitp/physics-memory/`
  - `.aitp/evals/`
- Create: `packages/agent-core/src/benchmark-adapter/`
- Test: `packages/agent-core/test/physics-verticals/librpa.test.ts`

**Deliverables:**

- bind universal code/validation/benchmark actions through workflow recipes;
- auto-capture git diff and smoke benchmark evidence;
- keep real remote or HPC runs outside core tests through adapter contracts.

**Acceptance:**

- the LibRPA lane demonstrates serious code-research discipline without polluting universal actions;
- failures from this lane can become harness cases and candidate failure modes.

### Slice 0.6.0: FQHE/CS Theory Vertical V2

**Goal:** Replace the existing proof-of-shape FQHE/CS vertical with a file-backed and graph-backed theory vertical that better matches the intended physics-native runtime.

**Why now:** The current vertical proves the idea; this slice should prove the runtime architecture.

**Primary files:**

- Create file-backed fixtures under:
  - `.aitp/domain-profiles/`
  - `.aitp/workflow-recipes/`
  - `.aitp/physics-memory/`
  - `.aitp/evals/`
- Test: `packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts`

**Deliverables:**

- encode Laughlin wavefunction, adiabatic flux insertion, charge pump, Abelian CS response, and K-matrix response as reusable memory and workflow material;
- ensure the charge-flux lens can force the right distinctions when needed;
- support common trap detection such as confusing external EM flux with emergent CS flux.

**Acceptance:**

- the runtime gives more physically disciplined answers on this domain without turning every explanation into a ceremony;
- derivation blocks and final statuses behave coherently.

### Slice 0.7.0: Multi-Domain Isolation And Bridge Capsules

**Goal:** Make domain isolation explicit and enforceable.

**Why now:** As more domains are added, accidental contamination becomes a first-order failure mode.

**Primary files:**

- Create: `packages/agent-core/src/physics-memory/bridge.ts`
- Modify: `packages/agent-core/src/agent/workframe/context-pack.ts`
- Modify: `packages/agent-core/src/physics-memory/types.ts`
- Test: `packages/agent-core/test/physics-memory/domain-isolation.test.ts`

**Deliverables:**

- explicit bridge capsule support;
- bridge-gated cross-domain inclusion in context packs;
- diagnostics for accidental domain bleed.

**Acceptance:**

- LibRPA content cannot silently leak into FQHE/QFT contexts;
- legitimate bridges are possible but must be explicit and auditable.

### Slice 0.8.0: Graph Kernel And Query Semantics

**Goal:** Turn the knowledge substrate into a real queryable graph kernel rather than a collection of loosely related compiled objects.

**Why now:** Once the runtime has multiple domains and bridge behavior, graph semantics become part of correctness, not just convenience.

**Primary files:**

- Create: `packages/agent-core/src/physics-graph/`
- Test: `packages/agent-core/test/physics-graph/`

**Deliverables:**

- relation schema and query primitives;
- neighborhood expansion, dependency closure, contradiction path, and bridge-aware path search;
- graph-facing query contracts for actions and context compilation.

**Acceptance:**

- actions can query graph structure systematically;
- capsule expansion and cross-block lookup become predictable and testable;
- contradiction and dependency reasoning stop being ad hoc compiler behavior.

### Slice 0.9.0: Formalization Bridge

**Goal:** Add a narrow path toward Lean/Physlib/OMDoc-style formalization without pretending the whole runtime is a theorem prover.

**Why now:** This is not a prerequisite for runtime closure, but it is the right long-term lane once graph objects and trust states become mature.

**Primary files:**

- Create: `packages/agent-core/src/formalization/`
- Test: `packages/agent-core/test/formalization/`

**Deliverables:**

- formalizable contracts for definitions, assumptions, lemmas, and theorem-like claims;
- export formats for blueprint-like dependency graphs;
- separation between useful checked physics memory and truly formalized artifacts.

**Acceptance:**

- formalization-ready material becomes identifiable without overstating certainty;
- the runtime can later interoperate with external formal systems.

## Execution Order

The recommended order is:

```text
0.2.6 Turn Loop Context Closure
0.2.7 Dynamic Tool Exposure And Tool Budgeting
0.2.8 Controlled Auto Capture From Real Work
0.2.9 Memory Compiler V2 And Candidate Graph Merge
0.3.0 Promotion Pipeline And Trust Ladder Enforcement
0.3.1 Final Gate Lifecycle Integration
0.4.0 Harness V2 And File-Backed Eval Cases
0.5.0 Real LibRPA Vertical
0.6.0 FQHE/CS Theory Vertical V2
0.7.0 Multi-Domain Isolation And Bridge Capsules
0.8.0 Graph Kernel And Query Semantics
0.9.0 Formalization Bridge
```

This order is intentional:

- first close the turn loop;
- then close tool exposure and evidence capture;
- then close graph compilation and trust;
- then close answer-time enforcement and replay;
- only after that deepen domain verticals and graph semantics.

## What The User Should Eventually See

If this roadmap succeeds, the user-facing system should look like this:

- it still answers ordinary questions naturally;
- it becomes more careful when a derivation reaches a boundary;
- it becomes much more careful when code, benchmarks, or risky theory claims are involved;
- it remembers research work as structured evidence instead of chat residue;
- it improves by turning failures and confusions into replayable evals;
- it can expose the right physical distinctions, not just more text, when a problem is conceptually dangerous.

That is the actual target. Not a larger prompt. Not a prettier notebook. A runtime that is harder to fool and more useful for theoretical-physics work.

## Relation To Earlier Plans

This plan supersedes the earlier cross-slice sequencing documents as the main roadmap after the implemented 0.2.5 baseline:

- `docs/superpowers/plans/2026-06-02-aitp-agent-runtime-roadmap.md`
- `docs/superpowers/plans/2026-06-02-aitp-agent-next-slices-and-upstream-sync.md`

Those older files remain useful as historical design records and for already-completed slices, but future slice execution should key off this document.

## Self-Review

Spec coverage:

- runtime closure of WorkFrame and ContextPack is covered by 0.2.6;
- progressive tool exposure is covered by 0.2.7;
- live evidence capture is covered by 0.2.8;
- deeper graph compilation is covered by 0.2.9 and 0.8.0;
- trust/promotion is covered by 0.3.0;
- answer-time honesty is covered by 0.3.1;
- replay/self-improvement is covered by 0.4.0;
- domain vertical maturity is covered by 0.5.0 and 0.6.0;
- domain isolation is covered by 0.7.0;
- long-term formalization is covered by 0.9.0.

Placeholder scan:

- no `TBD` placeholders;
- each slice is defined by closure purpose, boundary, and acceptance;
- later implementation plans should expand each slice into task-by-task code work.

Type consistency:

- WorkFrame, `ResearchContextPack`, `ResearchActionBinding`, ledger event, candidate capsule, graph object, promotion packet, bridge capsule, and final gate are used consistently with the already-implemented baseline.
