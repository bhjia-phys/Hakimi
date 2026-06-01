# AITP Agent Runtime Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn AITP Agent from a Kimi Code fork with physics-memory foundations into a theoretical-physics-native research runtime with reliable tool lifecycle, source-backed capture, WorkFrames, capsule boundaries, physics direction lenses, final gates, and self-improving harnesses.

**Architecture:** Keep Kimi Code as the implementation baseline and add AITP runtime layers inside `packages/agent-core`. Learn Codex's base runtime reliability patterns without porting Codex wholesale, and learn ForgeCode's harness/eval boundaries without replacing Kimi's tool manager. Build each slice around a narrow end-to-end demonstration so abstractions stay grounded in real theory/code research.

**Tech Stack:** TypeScript, Kimi Code `agent-core`, existing `Session`/`Agent`/`ToolManager`/`AgentRecords` lifecycle, Markdown+YAML `.aitp` artifacts, Vitest, oxlint, Codex-inspired tool lifecycle envelopes, ForgeCode-inspired eval organization.

---

## Scope

This is the master roadmap after the 0.0.1 physics-memory slice and the 0.0.2 research-ledger/action-algebra foundation.

It covers:

- 0.0.3 thin base runtime spine;
- 0.0.4 ledger writing and controlled capture;
- 0.0.5 WorkFrame and action-call traces;
- 0.0.6 LibRPA micro vertical slice;
- 0.0.7 capsule boundary compiler;
- 0.0.8 physics direction engine and lenses;
- 0.0.9 escalation policy and final gate;
- 0.1 harness/eval runner;
- 0.2 FQHE/CS theory vertical slice.

It does not replace per-slice implementation plans. Before coding each large slice, create a focused plan if the task spans more than one subsystem. This master plan defines the order, interfaces, boundaries, demos, and acceptance criteria.

## Current Foundation

Implemented:

- `packages/agent-core/src/physics-memory/*`
  - compiled semantic memory capsules;
  - project/user scanning;
  - `PhysicsMemory` model tool;
  - session-level loading behind `KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY=1`.
- `packages/agent-core/src/research-ledger/*`
  - source-backed event types, parser, scanner, registry, compiler;
  - `ResearchLedger` model tool with `list_topics`, `list_events`, `load_event`, `compile_proposals`;
  - session-level loading behind `KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER=1`.
- `packages/agent-core/src/research-action/*`
  - ActionAlgebra types;
  - WorkFrame and obligation foundations;
  - default research action definitions;
  - scheduler;
  - `ResearchAction` model tool;
  - failed/inconclusive action to harness candidate conversion.

Known boundaries:

- `ResearchLedger` is read/compile-only in 0.0.2.
- `ResearchAction` is definition/scheduling/recording-only in 0.0.2.
- Primitive tool calls are not yet uniformly wrapped with AITP attribution.
- WorkFrame state is not yet an active session controller.
- Physics lenses are not implemented.
- Final-answer gating is not implemented.

## Design North Star

AITP Agent should not become a verbose protocol machine. The external user experience should remain natural:

```text
simple explanation
-> concise answer with a light caveat when needed

local derivation
-> free scratch reasoning plus cheap invariants

completed derivation block
-> candidate capsule with assumptions and open questions

cross-block relation
-> graph/capsule/lens lookup

code or benchmark task
-> WorkFrame, action trace, git diff capture, minimal benchmark, evidence chain

final conclusion
-> validated/provisional/blocked status with evidence and remaining obligations
```

Core principle:

```text
Keep micro reasoning light.
Use capsules at block boundaries.
Use graph/lenses at cross-block boundaries.
Use strict validation at promotion/final-answer boundaries.
Feed failures into harness.
```

## Core Identifiers

Every slice must preserve these identifiers across records and artifacts:

- `WorkFrameId`: active research problem context.
- `ResearchActionCallId`: semantic action invocation.
- `PrimitiveToolCallId`: raw tool invocation.
- `LedgerEventId`: source-backed research event.
- `CapsuleId`: compiled semantic memory unit.
- `GraphObjectId`: physics/code object in the future graph.
- `ObligationId`: pending or resolved required check.
- `HarnessCaseId`: reusable eval or regression case.

The intended trace shape is:

```text
WorkFrame
-> ResearchActionCall
-> PrimitiveToolCall(s)
-> LedgerEvent(s)
-> Obligation(s)
-> CompileProposal(s)
-> Capsule/GraphEdge/HarnessCase
```

## Runtime Layering

### Layer A: Base Agent Runtime Reliability

Learns from Codex.

Purpose:

- reliable turn lifecycle;
- reliable tool lifecycle;
- permissions and sandbox boundaries;
- diff/output capture;
- interruption and background task state;
- replayable records.

AITP-specific result:

- every meaningful tool call can be attributed to a WorkFrame and ResearchActionCall;
- tool output can be turned into evidence without relying on the model's memory;
- final claims can inspect completed, failed, or running tool states.

### Layer B: AITP Research Runtime

Builds on Kimi `Session`, `Agent`, `ToolManager`, and `AgentRecords`.

Purpose:

- WorkFrames;
- ResearchActions;
- ResearchLedger writes;
- controlled capture;
- obligations;
- scheduling;
- final status.

### Layer C: Physics Intelligence Runtime

Builds on physics-memory and future graph/capsules.

Purpose:

- capsule boundary compiler;
- graph path search;
- physics lenses;
- applicability checks;
- domain-specific vertical slices;
- harness/eval feedback.

## Slice 0.0.3: Thin Base Runtime Spine

### Goal

Add the smallest Codex-inspired runtime spine needed for later AITP capture: primitive tool attribution, pre/post tool envelopes, result status, and diff/output references.

### Non-Goals

- Do not port Codex Rust runtime.
- Do not rewrite Kimi's `ToolManager`.
- Do not implement physics lenses.
- Do not auto-write every tool output to the ledger.

### Files

- Modify: `packages/agent-core/src/agent/tool/index.ts`
- Modify: `packages/agent-core/src/loop/types.ts`
- Modify: `packages/agent-core/src/agent/records/types.ts`
- Create: `packages/agent-core/src/agent/tool-lifecycle/`
- Test: `packages/agent-core/test/tool-lifecycle/`
- Test: `packages/agent-core/test/tools/*`

### Tasks

- [x] Define a primitive tool lifecycle envelope type with tool name, call id, cwd, source, action call id, WorkFrame id, start/end timestamps, status, output summary, and artifact refs.
- [x] Add a narrow tool lifecycle hook around real loop-level primitive tool execution.
- [x] Record successful and failed primitive tool result states.
- [ ] Record interrupted and background-running primitive tool states.
- [ ] Capture file diff metadata after edit/shell tools where Kimi already exposes enough information.
- [x] Expose a read-only helper for later ResearchCapture to inspect recent primitive tool envelopes.
- [x] Add tests that execute a fake builtin tool and assert pre/post records are emitted.

### Acceptance

The agent can answer, from records alone:

```text
which primitive tool ran,
which call id it had,
whether it passed or failed,
which cwd it used,
which action/workframe it belonged to if any,
whether it produced a diff or artifact reference.
```

### Demo

Run a small fake tool call and show one structured lifecycle record without changing user-facing tool behavior.

## Slice 0.0.4: LedgerWriter And Controlled Capture

### Goal

Make `.aitp/research-ledger` writable through a safe, schema-checked path and capture high-value research artifacts without turning the ledger into a noise dump.

### Non-Goals

- Do not auto-capture every `Read`, `Grep`, `Glob`, or `Bash` output.
- Do not promote ledger events into physics memory.
- Do not implement full WorkFrame policy yet.

### Files

- Create: `packages/agent-core/src/research-ledger/writer.ts`
- Create: `packages/agent-core/src/research-ledger/capture-policy.ts`
- Modify: `packages/agent-core/src/research-ledger/types.ts`
- Modify: `packages/agent-core/src/agent/research-ledger/index.ts`
- Modify: `packages/agent-core/src/tools/builtin/collaboration/research-ledger-tool.ts`
- Test: `packages/agent-core/test/research-ledger/writer.test.ts`
- Test: `packages/agent-core/test/tools/research-ledger-tool.test.ts`

### Tasks

- [x] Add a `write_event` action to `ResearchLedger`.
- [x] Implement `LedgerWriter` that generates deterministic topic-scoped Markdown paths.
- [x] Validate event type, status, topic, domain, source refs, dependencies, and candidate capsule kind before writing.
- [x] Emit `research_ledger.event_written` after a successful write.
- [x] Add `ResearchCapturePolicy` with four initial capture classes:
  - `source_excerpt`;
  - `git_diff_observation`;
  - `benchmark_observation`;
  - `failure_observation`.
- [x] Store long outputs as artifact refs rather than embedding unbounded text in event bodies.

### Acceptance

Given a structured request, `ResearchLedger.write_event` writes:

```text
.aitp/research-ledger/<topic>/events/<stable-slug>.md
```

Then `list_events`, `load_event`, and `compile_proposals` see the new event without restarting the session.

### Demo

Write a `git_diff_observation` event for a fake LibRPA change and compile it into a proposal with source refs and open questions preserved.

## Slice 0.0.5: WorkFrame And ResearchAction Call Trace

### Goal

Turn WorkFrame from a passive type into an active session context and connect ResearchAction calls to primitive tools and ledger events.

### Non-Goals

- Do not implement dynamic tool exposure for every tool yet.
- Do not implement final-answer gating yet.
- Do not require all casual chat to enter a WorkFrame.

### Files

- Modify: `packages/agent-core/src/research-action/workframe.ts`
- Create: `packages/agent-core/src/agent/workframe/`
- Modify: `packages/agent-core/src/agent/research-action/index.ts`
- Modify: `packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts`
- Modify: `packages/agent-core/src/agent/records/types.ts`
- Test: `packages/agent-core/test/research-action/workframe.test.ts`
- Test: `packages/agent-core/test/tools/research-action-tool.test.ts`
- Test: `packages/agent-core/test/session/workframe.test.ts`

### Tasks

- [x] Add active WorkFrame storage to `Agent`.
- [x] Add model-visible WorkFrame actions:
  - `open_work_frame`;
  - `switch_work_frame`;
  - `close_work_frame`;
  - `list_work_frames`;
- [ ] Add model-visible ResearchAction call actions:
  - `start_action_call`;
  - `finish_action_call`.
- [ ] Let `record_action_result` accept `ledger_event_ids`.
- [x] Let primitive tool lifecycle envelopes reference the active WorkFrame.
- [ ] Let primitive tool lifecycle envelopes reference the active `ResearchActionCallId`.
- [ ] Generate obligations from action definitions when an action call completes.
- [ ] Keep multiple WorkFrames isolated unless a bridge is explicit.

### Acceptance

A session can hold separate WorkFrames for:

```text
topological-order/fqhe-cs
librpa/head-wing
```

Tool calls and ledger events from one frame do not appear in the other frame's active context unless explicitly bridged.

### Demo

Open two frames, record one action in each, and verify their action traces and obligations remain isolated.

## Slice 0.0.6: LibRPA Micro Vertical Slice

### Goal

Use a narrow real computational-physics workflow to prove the runtime spine is useful before building more abstract physics intelligence.

### Non-Goals

- Do not solve all LibRPA workflows.
- Do not require remote HPC execution.
- Do not build a full code graph.

### Files

- Create: `.aitp/research-ledger/librpa-head-wing/`
- Create: `.aitp/physics-memory/librpa/` fixture capsules if needed.
- Create: `packages/agent-core/test/fixtures/aitp/librpa-head-wing/`
- Create: `packages/agent-core/test/integration/librpa-head-wing.test.ts`
- Modify: `docs/internal/aitp-agent-0.0.3-architecture.md`

### Tasks

- [ ] Define a `librpa/head-wing` WorkFrame fixture.
- [ ] Add fixture ledger events for code observation, git diff observation, benchmark observation, and failure observation.
- [ ] Add default actions:
  - `code.inspect_call_sites`;
  - `code.map_formula_to_code_region`;
  - `code.capture_git_diff_observation`;
  - `benchmark.run_minimal_librpa_case`;
  - `harness.build_eval_from_failure`.
- [ ] Add a minimal local benchmark stand-in fixture that can run in CI without external binaries.
- [ ] Assert that a head-wing code task recommends call-site inspection before benchmark.
- [ ] Assert that a failed benchmark becomes a harness candidate.

### Acceptance

The LibRPA micro slice produces a compact trace:

```text
WorkFrame: librpa/head-wing
Actions: inspect call sites -> map formula to code -> capture git diff -> run minimal benchmark
Ledger: code_observation, git_diff_observation, benchmark_observation or failure_observation
Harness: candidate if failed/inconclusive
Final status: validated, provisional, or blocked
```

### Demo

Run one test scenario that simulates a head-wing change and outputs the expected action and ledger chain.

## Slice 0.0.7: Capsule Boundary Compiler

### Goal

Compile locally self-consistent research blocks into candidate capsules at boundaries, without interrupting every micro-step of reasoning.

### Non-Goals

- Do not force every formula line into a graph atom.
- Do not auto-promote candidate capsules.
- Do not perform theorem-prover-level formalization.

### Files

- Create: `packages/agent-core/src/research-block/`
- Create: `packages/agent-core/src/physics-memory/capsule-boundary.ts`
- Modify: `packages/agent-core/src/research-ledger/compiler.ts`
- Test: `packages/agent-core/test/research-block/`
- Test: `packages/agent-core/test/physics-memory/capsule-boundary.test.ts`

### Tasks

- [ ] Define `ResearchBlock` with topic, domain, local claims, formulas, assumptions, source refs, and open questions.
- [ ] Add `compile_block_to_candidate_capsule`.
- [ ] Extract assumptions and conventions from block metadata, not from every micro-step.
- [ ] Preserve unresolved questions as obligations.
- [ ] Mark candidate capsules as unpromoted.

### Acceptance

A completed FQHE derivation block can become a `DerivationStep` candidate capsule with:

```text
source refs,
assumptions,
conventions,
dependencies,
open questions,
required checks.
```

No full graph search is required while the block is still local scratch.

### Demo

Compile a Laughlin flux-insertion block into a candidate capsule and show that it remains provisional until checks pass.

## Slice 0.0.8: PhysicsDirectionEngine And Lenses

### Goal

Give the agent a physics-aware direction mechanism that suggests meaningful conceptual lenses only after applicability checks, avoiding shallow keyword association.

### Non-Goals

- Do not make a universal ontology of all physics.
- Do not trigger heavy lens checks for every simple answer.
- Do not treat a lens as proof.

### Files

- Create: `packages/agent-core/src/physics-direction/`
- Create: `packages/agent-core/src/physics-direction/lens.ts`
- Create: `packages/agent-core/src/physics-direction/applicability.ts`
- Create: `packages/agent-core/src/physics-direction/domain-packs/`
- Test: `packages/agent-core/test/physics-direction/`

### Tasks

- [ ] Define `PhysicsLens` with required objects, required relations, applicability questions, counterexamples, recommended actions, and confidence downgrade rules.
- [ ] Add `candidate_lenses_for_objects`.
- [ ] Add `check_lens_applicability`.
- [ ] Add the first domain pack: `topological-order/fqhe-cs`.
- [ ] Add a `charge_flux_quantization` lens:
  - required objects: charge, flux;
  - possible relations: AB phase, compact U(1), flux insertion, large gauge transformation;
  - key check: distinguish external electromagnetic flux, emergent CS flux, and quasiparticle AB flux period.
- [ ] Add a LibRPA `formula_code_mapping` lens for code-path impact reasoning.

### Acceptance

For the question "why does smaller fractional charge seem to correspond to larger flux?", the engine proposes `charge_flux_quantization` with the caveat that charge and flux identities must be disambiguated.

For unrelated uses of "flux", the lens is either not proposed or returned with low confidence and counterexamples.

### Demo

Run a fixture where:

```text
q* = e/m and AB phase context
-> lens accepted

Berry curvature flux without charge-flux AB context
-> lens rejected or downgraded
```

## Slice 0.0.9: EscalationPolicy And Final Gate

### Goal

Control complexity so simple questions remain simple while high-risk research actions receive strict checks and honest final status.

### Non-Goals

- Do not force WorkFrame creation for casual explanations.
- Do not block all final answers on advisory obligations.
- Do not hide uncertainty.

### Files

- Create: `packages/agent-core/src/research-policy/escalation.ts`
- Create: `packages/agent-core/src/research-policy/final-gate.ts`
- Modify: `packages/agent-core/src/research-action/obligation.ts`
- Test: `packages/agent-core/test/research-policy/escalation.test.ts`
- Test: `packages/agent-core/test/research-policy/final-gate.test.ts`

### Tasks

- [ ] Define tiers:
  - Tier 0: direct answer;
  - Tier 1: light self-check;
  - Tier 2: lens-guided reasoning;
  - Tier 3: action/benchmark/final gate.
- [ ] Add task classifiers for explanation, derivation, code modification, benchmark, promotion, and final answer.
- [ ] Add final gate checks for blocking obligations.
- [ ] Require final status:
  - `validated`;
  - `provisional`;
  - `blocked`.
- [ ] Add user-facing concise status rendering.

### Acceptance

Simple FQHE conceptual questions do not trigger heavy workflow. LibRPA code edits and benchmark/promotion tasks do.

If blocking obligations remain open, the final answer cannot claim validation.

### Demo

One fixture question returns Tier 1/2. One LibRPA edit task returns Tier 3 and requires benchmark/action trace evidence.

## Slice 0.1: Harness And Eval Runner

### Goal

Make failures and wrong turns reusable, so the agent's workflow improves from its own mistakes.

### Non-Goals

- Do not train the base model.
- Do not store benchmark answers as memory.
- Do not require a full external eval platform.

### Files

- Create: `packages/agent-core/src/research-harness/`
- Create: `packages/agent-core/test/research-harness/`
- Create: `.aitp/harness/candidates/`
- Create: `.aitp/harness/evals/`
- Modify: `packages/agent-core/src/research-action/harness.ts`

### Tasks

- [ ] Define `HarnessCase` with prompt, expected actions, expected obligations, expected status, fixtures, and allowed tools.
- [ ] Promote confirmed `HarnessCandidate` objects into `HarnessCase` files.
- [ ] Add a small eval runner for deterministic unit-style checks.
- [ ] Add FQHE charge/flux lens eval.
- [ ] Add LibRPA head-wing action-trace eval.
- [ ] Record eval results as artifacts, not as trusted physics memory.

### Acceptance

Failed or inconclusive action traces can become reviewable harness candidates. Confirmed candidates can run as evals and assert expected AITP behavior.

### Demo

Run two evals:

```text
FQHE charge/flux question
LibRPA head-wing code task
```

## Slice 0.2: FQHE/CS Theory Vertical Slice

### Goal

Build the first formal-theory vertical slice that demonstrates capsule boundaries, physics lenses, and escalation policy on a real theoretical physics topic.

### Non-Goals

- Do not formalize all topological order.
- Do not claim proof-assistant-level correctness.
- Do not conflate external electromagnetic flux and emergent CS flux.

### Files

- Create: `.aitp/research-ledger/fqhe-cs-effective-theory/`
- Create: `.aitp/physics-memory/topological-order/`
- Create: `packages/agent-core/test/fixtures/aitp/fqhe-cs/`
- Create: `packages/agent-core/test/integration/fqhe-cs.test.ts`

### Capsule Set

Start with these candidate capsule families:

- Laughlin wavefunction;
- filling fraction and Landau degeneracy;
- Laughlin flux insertion;
- Dirac/AB charge-flux quantization;
- Chern-Simons effective theory;
- K-matrix response;
- quasiparticle charge and statistics;
- common convention pitfalls.

### Tasks

- [ ] Add fixture source-backed ledger events for the capsule set.
- [ ] Add capsule summaries with expansion handles.
- [ ] Add the `charge_flux_quantization` physics lens.
- [ ] Add tests that distinguish:
  - electron flux quantum `h/e`;
  - quasiparticle AB flux period `h/q*`;
  - emergent CS gauge flux.
- [ ] Add a derivation-block fixture for Laughlin flux insertion.
- [ ] Add final-gate checks for unresolved convention questions.

### Acceptance

The agent can answer:

```text
What is the relation between FQHE wavefunctions and Chern-Simons effective theory?
Why can smaller fractional charge correspond to a larger flux period?
```

with:

- correct lens selection;
- explicit flux-type caveats;
- local derivation blocks;
- candidate capsules;
- provisional/validated status.

### Demo

Run a theory QA fixture that produces a concise natural answer plus an internal evidence trace:

```text
Lens: charge_flux_quantization
Capsules: Laughlin flux insertion, AB phase, CS/K-matrix response
Open obligations: CS level normalization if not checked
Final status: provisional or validated depending on fixture evidence
```

## User-Visible Shape After These Slices

### Casual Theory Question

The user sees:

```text
This is mainly an AB/Dirac charge-flux quantization intuition: q Phi is the phase-carrying product, so a smaller effective charge q* has a larger flux period h/q*. In FQHE, this must be separated from inserting one electron flux quantum h/e, which pumps fractional charge, and from emergent CS gauge flux.
```

The user does not see:

- every internal obligation;
- every graph lookup;
- every lens candidate.

### Research Derivation

The user sees:

```text
Derivation block completed.
Candidate capsule: DerivationStep:fqhe.flux-insertion-charge
Assumptions: Laughlin filling, adiabatic insertion, gap remains open.
Open checks: charge-sign convention, CS normalization if connecting to K-matrix.
Status: provisional.
```

### LibRPA Code Task

The user sees:

```text
WorkFrame: librpa/head-wing
Actions:
  passed inspect_call_sites
  passed map_formula_to_code_region
  passed capture_git_diff_observation
  failed run_minimal_librpa_case
Ledger:
  event.code_observation...
  event.git_diff_observation...
  event.failure_observation...
Harness:
  candidate created from failed benchmark
Final status: blocked until benchmark is fixed.
```

## Risks And Guardrails

### Risk: Rewriting Codex

Guardrail:

- only import Codex-style concepts that Kimi lacks;
- keep implementation inside Kimi `agent-core`;
- prove each runtime addition with one AITP trace test.

### Risk: Keyword Physics

Guardrail:

- lenses require applicability checks;
- lenses carry counterexamples;
- low-confidence lenses cannot force final conclusions.

### Risk: Ledger Noise

Guardrail:

- controlled capture first;
- no automatic capture of low-value shell/file search noise;
- long outputs become artifacts.

### Risk: Overcomplicated Simple Answers

Guardrail:

- escalation tiers;
- Tier 0/1 stay lightweight;
- WorkFrame is required only for research execution or high-risk conclusions.

### Risk: Abstract Architecture Without Research Value

Guardrail:

- move LibRPA micro vertical slice before the full physics lens work;
- every slice must have a visible demo and tests.

## Verification Matrix

Run focused tests per slice:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/tool-lifecycle
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-ledger
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-action
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-policy
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-harness
```

Run broader checks after each coherent implementation slice:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
corepack pnpm --config.engine-strict=false exec oxlint <changed-paths>
```

The local Windows environment may require `--config.engine-strict=false` until Node is updated to `>=24.15.0`.

## Implementation Discipline

- Keep one coherent slice per commit group.
- Update `README.md` and `README.zh-CN.md` whenever user-visible behavior, version status, setup, or verification changes.
- Add audit docs for every completed runtime slice.
- Preserve Kimi defaults unless an AITP experimental flag enables a feature.
- Do not promote ledger or benchmark artifacts into trusted physics memory without validation.
- Prefer narrow vertical demos over broad abstract subsystems.

## Self-Review

Spec coverage:

- Base runtime reliability: 0.0.3.
- Source-backed automatic research capture: 0.0.4.
- WorkFrames and action-call trace: 0.0.5.
- Early real vertical validation: 0.0.6 LibRPA.
- Capsule boundary behavior: 0.0.7.
- Physics direction and lens applicability: 0.0.8.
- Complexity control and final-answer status: 0.0.9.
- Harness/eval feedback: 0.1.
- Theory vertical slice: 0.2 FQHE/CS.

Placeholder scan:

- This plan intentionally uses slice-level tasks and concrete file targets.
- Per-slice implementation plans should expand code-level steps before coding large slices.

Type consistency:

- Identifiers are consistently named as WorkFrame, ResearchActionCall, PrimitiveToolCall, LedgerEvent, Capsule, GraphObject, Obligation, and HarnessCase.
