# AITP Agent 0.0.2 Architecture

## Purpose

0.0.2 turns the 0.0.1 physics-memory foundation into a research runtime loop. The new layer does not try to guess the final physics graph before a topic begins. It records real research events first, then compiles those events into candidate graph objects, obligations, capsules, and harness cases.

## Source Stack And Knowledge Stack

AITP Agent keeps source-backed research process separate from trusted knowledge.

The source stack is `research-ledger`. It stores what happened:

- source excerpts from papers, web pages, notes, or code;
- derivation scratch and equation candidates;
- assumptions, conventions, and user decisions;
- code observations, git history observations, and diffs;
- benchmark observations and tool runs;
- failure observations and negative results.

The knowledge stack is `physics-memory` and the future `physics-graph`. It stores what has been compiled, checked, validated, rejected, or formalized.

The compiler is the only normal path between the two:

```text
research-ledger event
-> precompile packet
-> compile proposal
-> checks and obligations
-> capsule / graph edge / failure mode / harness candidate
```

## Three Progressive Disclosure Layers

The runtime should expose indexes before details.

```text
Skills
  -> procedural memory index
  -> load selected skill details

PhysicsMemory
  -> domain and capsule index
  -> load capsule or compile context pack

ResearchLedger
  -> topic and event index
  -> load event or compile proposals
```

This gives the model enough awareness to route the task without dumping the entire research history into the prompt.

## ActionAlgebra

ActionAlgebra is the typed transition system for research work. It should not force a single research workflow. It should make the consequences of a reasoning step explicit.

A research action has:

- a stable id;
- a phase such as scope, source, derive, validate, code, benchmark, or compile;
- input and output object kinds;
- preconditions;
- effects;
- generated obligations;
- validators;
- primitive tool policy;
- audit policy.

Example:

```text
derive.derive_step
  input: Formula + AssumptionSet + ConventionSet
  output: DerivationStepCandidate + ClaimCandidate
  obligations: source_support, dimension_check, convention_check, known_limit
```

The model remains free to explore. Once it emits a substantive claim, the runtime turns that claim into an object with obligations.

## WorkFrame

A WorkFrame is the active research problem state:

- domain;
- topic;
- goal;
- active objects;
- active assumptions;
- active conventions;
- source refs;
- context pack;
- open obligations;
- trust state.

Multiple WorkFrames may coexist. A LibRPA feature-development frame should not inherit FQHE or quantum-gravity context unless a bridge is explicit.

## Obligations

Obligations are the convergence mechanism. They make missing checks visible to the model and to the audit trail.

Examples:

- `source_support`;
- `dimension_check`;
- `convention_check`;
- `symbol_closure`;
- `dependency_closure`;
- `known_limit`;
- `code_mapping`;
- `benchmark`;
- `human_decision`.

Blocking obligations should prevent validated promotion. If a final answer depends on unresolved blocking obligations, the answer must remain provisional and name the missing checks.

## Coordination With Existing Tools

AITP research actions are semantic orchestration over Kimi/Codex-style primitive tools. They do not replace primitive tools.

```text
ResearchAction.inspect_git_history
  -> Bash("git log ...")
  -> Bash("git blame ...")
  -> Read(...)
  -> GitHistoryObservation
  -> research-ledger event
  -> follow-up obligations
```

```text
ResearchAction.run_minimal_benchmark
  -> Bash or BackgroundTask or MCP remote runner
  -> BenchmarkObservation
  -> harness candidate or validation result
```

Primitive tool use should be attributed to a semantic action when possible. If the model uses a primitive tool without an enclosing research action, the runtime should record a raw-tool escape with a reason and a follow-up candidate action.

## Kimi Code Role

Kimi Code remains the runtime base:

- TypeScript monorepo and `agent-core`;
- `ToolManager` and builtin tools;
- `SkillRegistry`;
- `Session` lifecycle;
- MCP;
- subagents;
- records/replay;
- permissions;
- hooks and compaction.

AITP extensions should attach through optional managers, experimental flags, builtin tools, records, and existing lifecycle hooks.

## Codex Role

Codex is a reference for tool lifecycle quality:

- explicit source for each tool/action call;
- stable pre/post payloads;
- clear command execution lifecycle;
- cancellation and failure outcomes;
- structured outputs;
- patch and edit discipline;
- audit-friendly event streams.

AITP should borrow those ideas without porting the Codex Rust runtime into Kimi.

## ForgeCode Role

ForgeCode is a reference for harness boundaries:

- durable eval/task files;
- explicit agent definitions;
- tool boundary discipline;
- task data separate from runner;
- validation contracts;
- debug artifacts and repeatable benchmark cases.

AITP harness candidates should be derived from real failed or inconclusive research-action traces.

## Example: FQHE Wavefunction And Chern-Simons Theory

The WorkFrame is theory-oriented:

```text
domain: topological-order
topic: fqhe-wavefunction-cs-relation
goal: explain microscopic wavefunction versus long-wavelength CS theory
```

Likely actions:

- `scope.compile_context_pack`;
- `scope.declare_convention_set`;
- `source.extract_formula`;
- `derive.compare_with_known_result`;
- `validate.check_convention`;
- `validate.check_known_limit`;
- `memory.propose_capsule`.

Likely obligations:

- Hall conductance normalization;
- quasiparticle charge;
- statistics angle;
- Chern-Simons level convention;
- source support for the distinction between microscopic wavefunction and topological effective theory.

The final answer should avoid overclaiming that Chern-Simons theory reconstructs the full Laughlin wavefunction.

## Example: LibRPA Head-Wing Update

The WorkFrame is code-method-oriented:

```text
domain: librpa
topic: update-head-wing
goal: update head-wing treatment with formula-code-test traceability
```

Likely actions:

- `source.capture_source_excerpt` for the formula/spec;
- `code.inspect_git_history`;
- `code.map_formula_to_code`;
- `code.check_intermediate_observable`;
- `benchmark.run_minimal_case`;
- `harness.build_eval_from_failure`.

Likely obligations:

- define head, wing, and body block conventions;
- check q-to-zero limit;
- check Coulomb singularity handling;
- check unit, volume, spin, frequency-grid, and index ordering conventions;
- verify formula-code mapping;
- run a small smoke benchmark before trusting a larger run.

## 0.0.2 Non-Goals

0.0.2 should not:

- implement a full graph database;
- implement symbolic algebra;
- implement a full benchmark runner;
- replace Kimi's primitive tools;
- promote ledger events directly into validated memory;
- make all physics actions universal across all domains.

The goal is the audited substrate: typed events, typed actions, obligations, proposals, scheduling hints, and harness candidates.
