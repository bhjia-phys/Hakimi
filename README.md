# AITP Agent

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Status](https://img.shields.io/badge/status-runtime--roadmap-blue)](docs/superpowers/plans/2026-06-02-aitp-agent-runtime-roadmap.md)

[Chinese](README.zh-CN.md) | [Upstream Kimi Code docs](https://moonshotai.github.io/kimi-code/en/)

AITP Agent is a research-agent runtime project for theoretical physics. It starts from the Kimi Code CLI codebase and aims to make physics memory, knowledge compilation, research actions, validation, benchmark evidence, replay, and failure feedback first-class parts of the agent runtime.

This repository is currently an early-stage fork of [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code). The default product behavior still follows Kimi Code unless an AITP experimental flag explicitly enables a new runtime feature. The completed first slices are tracked in [AITP Agent 0.0.1 Implementation Plan](docs/superpowers/plans/2026-05-30-aitp-agent-0.0.1.md) and [AITP Agent 0.0.2 Research Ledger And ActionAlgebra Implementation Plan](docs/superpowers/plans/2026-06-01-aitp-agent-0.0.2-research-ledger-actionalgebra.md). The cross-slice runtime roadmap is tracked in [AITP Agent Runtime Roadmap Implementation Plan](docs/superpowers/plans/2026-06-02-aitp-agent-runtime-roadmap.md).

## Why This Exists

The goal is not to wrap a coding agent with a research notebook or a large prompt. AITP Agent should be able to participate in theoretical-physics research as a runtime-native system:

- load domain-scoped physics memory progressively during a session;
- compile notes, papers, derivations, code mappings, benchmarks, and failures into typed graph objects;
- expose compact context packs instead of dumping the whole knowledge base into the prompt;
- keep research domains isolated unless an explicit bridge allows cross-domain context;
- run fine-grained research actions such as convention checks, dimensional checks, formula-to-code mapping, benchmark execution, and failure analysis;
- record action traces so the harness and the research workflow can improve from mistakes.

## Architecture Direction

AITP Agent is planned around five runtime layers.

### Skills

Procedural memory: how the agent should work. Examples include formula-to-code debugging, derive-then-check workflows, benchmark-from-failure workflows, and LibRPA run preparation.

### Physics Memory Capsules

Semantic memory: what is known, with scope, assumptions, provenance, dependency edges, reliability state, and expansion handles into the underlying graph. Capsules are intentionally coarser than graph atoms and are meant to be progressively disclosed.

### Research Ledger

Source-backed research events: what actually happened in a session before it is trusted as reusable physics memory. The ledger records papers, web excerpts, derivation scratch, equations, code observations, git diffs, benchmark observations, failures, tool runs, and user decisions in a deterministic, compile-ready layout.

### Compiler

The compiler turns raw sources, topic notes, derivations, code traces, benchmark outputs, and failures into typed graph objects and context packs. Compilation is not summarization: it preserves dependencies, scope, contradiction markers, validation status, and failure conditions.

### Research Actions

Research actions are fine-grained, auditable work units over the physics graph and the local tool environment. They are lower-level than "use an MCP server" and higher-level than raw shell commands. Examples:

- `graph.expand_capsule`
- `graph.trace_dependency_closure`
- `derive.check_dimension_consistency`
- `derive.check_convention_consistency`
- `physics.check_flux_quantization_convention`
- `code.map_formula_to_code_region`
- `code.compare_git_diff_to_mapping`
- `benchmark.run_smoke_case`
- `memory.propose_failure_mode`
- `harness.build_eval_from_failure`

The action layer is intended to cover graph queries, derivation checks, code mapping, numerical validation, failure feedback, and harness evolution.

### WorkFrames, Obligations, And Harness

`WorkFrame` is the active research problem state: domain, topic, goal, active objects, assumptions, conventions, context pack, and trust state. Research actions create obligations such as source support, dimensional consistency, convention consistency, known-limit checks, formula-code mapping, and benchmark validation. Blocking obligations should prevent validated promotion and can become harness candidates when they fail or remain inconclusive.

## Relationship To Other Agent Runtimes

### Kimi Code

Kimi Code is the implementation baseline. It already provides the TypeScript monorepo, terminal agent runtime, model/tool loop, skills, MCP, subagents, sessions, records/replay, compaction, permissions, and lifecycle hooks. AITP Agent should extend this runtime rather than sit outside it.

### Codex

Codex is a reference for tool engineering. The most relevant ideas to migrate are explicit tool exposure levels, stable pre/post tool-use payloads, structured tool outputs, tool-call source tracking, deferred tool discovery, and action traces suitable for harness analysis.

### ForgeCode

ForgeCode is a reference for harness and evaluation design: explicit agent definitions, tool boundaries, benchmark cases, and repeatable eval-style workflows.

## Version Plan

### 0.0.1: Physics Memory Vertical Slice

Build the first runtime-native memory path inside `packages/agent-core`:

- add `physics-memory` types, parser, scanner, registry, compiler, and exports;
- add a model-invocable `PhysicsMemory` builtin tool;
- support `list_domains`, `list_capsules`, `load_capsule`, and `compile_context`;
- keep physics memory parallel to skills rather than embedding it inside skills;
- gate the feature behind an experimental flag;
- prove the shape with a narrow LibRPA fixture set.

The 0.0.1 schema should already reserve fields for graph references, expansion handles, required checks, and action affordances so the later research-action layer has a stable target.

### 0.0.2: Research Ledger And ActionAlgebra

- add a `research-ledger` subsystem that scans `.aitp/research-ledger` and stores source-backed research events separately from trusted physics memory;
- add compile proposals from ledger events into candidate capsules, graph refs, obligations, and harness candidates;
- extend `ResearchActionRegistry` into an ActionAlgebra with phases, preconditions, effects, generated obligations, validators, and primitive tool attribution;
- add `WorkFrame`, `ResearchObligation`, and `ValidationScheduler` foundations;
- expose `ResearchLedger` and `ResearchAction` model tools behind experimental flags;
- coordinate Kimi primitive tools, Codex-style lifecycle ideas, and ForgeCode-style harness boundaries without replacing Kimi's tool manager.

### 0.0.3: Thin Base Runtime Spine

Add the smallest Codex-inspired reliability layer needed for AITP capture:

- primitive tool lifecycle envelopes;
- action/workframe attribution for tool calls;
- result status and artifact refs;
- diff/output capture boundaries;
- interruption/background awareness where needed.

This slice should not port Codex or rewrite Kimi's tool manager.

### 0.0.4: LedgerWriter And Controlled Capture

- add schema-checked `ResearchLedger.write_event`;
- write deterministic `.aitp/research-ledger/<topic>/events/*.md` files;
- capture only high-value source, git diff, benchmark, and failure observations at first;
- keep long outputs as artifact refs instead of ledger noise.

### 0.0.5: WorkFrame And ResearchAction Call Trace

- make WorkFrame an active session context;
- support opening, switching, listing, and closing WorkFrames;
- connect ResearchAction calls to primitive tool calls and ledger events;
- generate obligations from action effects;
- preserve domain isolation across simultaneous research frames.

### 0.0.6: LibRPA Micro Vertical Slice

Prove the runtime spine on a narrow computational-physics workflow:

```text
formula capsule
-> code mapping
-> git diff / implementation trace
-> smoke benchmark
-> intermediate observable check
-> failure mode or validated memory update
-> harness regression case
```

### 0.0.7: Capsule Boundary Compiler

- compile locally self-consistent derivation/code blocks into candidate capsules;
- keep micro reasoning lightweight;
- use capsule boundaries only when local blocks connect to memory, graph, final answers, or other blocks.

### 0.0.8: PhysicsDirectionEngine And Lenses

- add applicability-gated physics lenses rather than keyword triggers;
- start with `topological-order/fqhe-cs` and `librpa/head-wing` domain packs;
- include a charge-flux quantization lens that distinguishes external electromagnetic flux, emergent Chern-Simons flux, and quasiparticle AB flux periods.

### 0.0.9: EscalationPolicy And Final Gate

- keep simple questions light;
- escalate code edits, benchmark work, promotion, and high-risk theory claims;
- prevent final answers from claiming validated status while blocking obligations remain open.

### 0.1: Harness And Eval Runner

- convert failed or inconclusive action traces into reviewable harness candidates;
- promote confirmed candidates into deterministic eval cases;
- add end-to-end evals for FQHE/CS reasoning and LibRPA head-wing workflows.

### 0.2: FQHE/CS Theory Vertical Slice

Close the first formal-theory loop with capsules, derivation blocks, physics lenses, convention checks, and final-answer status around Laughlin wavefunctions, flux insertion, charge-flux quantization, Chern-Simons effective theory, and K-matrix response.

## Current Status

- Upstream parity with `MoonshotAI/kimi-code:main` was checked on 2026-06-01; the fork was identical at commit `933cf67`.
- The AITP Agent 0.0.1 physics-memory vertical slice is implemented behind `KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY=1`.
- `packages/agent-core` now includes physics-memory types, parser, scanner, registry, compiler, session scanning, append-only records, a model-invocable `PhysicsMemory` builtin tool, LibRPA fixture capsules, and a foundational `ResearchActionRegistry`.
- Windows baseline failures in the broader `agent-core` suite have been resolved; see [AITP Agent 0.0.1 Audit](docs/internal/aitp-agent-0.0.1-audit.md).
- The 0.0.2 foundation is implemented: `research-ledger` types/parser/scanner/registry/compiler, session scanning, append-only records, `ResearchLedger` tool, ActionAlgebra types, default research actions, scheduler, `ResearchAction` tool, raw-tool escape records, and harness candidate conversion. See [AITP Agent 0.0.2 Audit](docs/internal/aitp-agent-0.0.2-audit.md).
- 0.0.3 has started with the thin primitive tool lifecycle spine: real loop-level tool calls now emit `tool_lifecycle.started` and `tool_lifecycle.completed` records with status, bounded summaries, timing, cwd, and future WorkFrame/ResearchAction attribution slots. See [AITP Agent 0.0.3 Audit](docs/internal/aitp-agent-0.0.3-audit.md).
- The remaining implementation sequence is defined in [AITP Agent Runtime Roadmap Implementation Plan](docs/superpowers/plans/2026-06-02-aitp-agent-runtime-roadmap.md): action/workframe attribution, diff/artifact capture, controlled ledger capture, WorkFrames/action traces, LibRPA micro slice, capsule boundaries, physics lenses, final gate, harness/eval, and FQHE/CS vertical slice.

## Development

Requirements are inherited from Kimi Code:

- Node.js `>=24.15.0`
- pnpm `10.33.0`

```sh
pnpm install
pnpm dev:cli
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Focused verification for the planned 0.0.1 work will be:

```sh
pnpm vitest run packages/agent-core/test/physics-memory packages/agent-core/test/tools/physics-memory-tool.test.ts
pnpm --filter @moonshot-ai/agent-core test
pnpm --filter @moonshot-ai/agent-core typecheck
```

Focused verification for the planned 0.0.2 work will be:

```sh
pnpm vitest run packages/agent-core/test/research-ledger packages/agent-core/test/research-action packages/agent-core/test/tools/research-ledger-tool.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
pnpm --filter @moonshot-ai/agent-core test
pnpm --filter @moonshot-ai/agent-core typecheck
```

Focused verification for the 0.0.3 primitive tool lifecycle work is:

```sh
pnpm vitest run packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/agent/basic.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/agent/tool-lifecycle/index.ts packages/agent-core/src/agent/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/agent/harness/snapshots.ts
```

Repository workflow note:

- completed runtime changes should be committed before moving on to the next coherent slice;
- update this README and `README.zh-CN.md` whenever project goals, feature status, setup, verification, or user-visible behavior changes.

## License

Released under the [MIT License](LICENSE).
