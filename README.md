# AITP Agent

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Status](https://img.shields.io/badge/status-pre--0.0.1-orange)](docs/superpowers/plans/2026-05-30-aitp-agent-0.0.1.md)

[Chinese](README.zh-CN.md) | [Upstream Kimi Code docs](https://moonshotai.github.io/kimi-code/en/)

AITP Agent is a research-agent runtime project for theoretical physics. It starts from the Kimi Code CLI codebase and aims to make physics memory, knowledge compilation, research actions, validation, benchmark evidence, replay, and failure feedback first-class parts of the agent runtime.

This repository is currently an early-stage fork of [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code). The default product behavior still follows Kimi Code unless an AITP experimental flag explicitly enables a new runtime feature. The first implementation target is tracked in [AITP Agent 0.0.1 Implementation Plan](docs/superpowers/plans/2026-05-30-aitp-agent-0.0.1.md).

## Why This Exists

The goal is not to wrap a coding agent with a research notebook or a large prompt. AITP Agent should be able to participate in theoretical-physics research as a runtime-native system:

- load domain-scoped physics memory progressively during a session;
- compile notes, papers, derivations, code mappings, benchmarks, and failures into typed graph objects;
- expose compact context packs instead of dumping the whole knowledge base into the prompt;
- keep research domains isolated unless an explicit bridge allows cross-domain context;
- run fine-grained research actions such as convention checks, dimensional checks, formula-to-code mapping, benchmark execution, and failure analysis;
- record action traces so the harness and the research workflow can improve from mistakes.

## Architecture Direction

AITP Agent is planned around four runtime layers.

### Skills

Procedural memory: how the agent should work. Examples include formula-to-code debugging, derive-then-check workflows, benchmark-from-failure workflows, and LibRPA run preparation.

### Physics Memory Capsules

Semantic memory: what is known, with scope, assumptions, provenance, dependency edges, reliability state, and expansion handles into the underlying graph. Capsules are intentionally coarser than graph atoms and are meant to be progressively disclosed.

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

### 0.0.2: Physics Graph Query And Research Action Registry

- introduce universal graph queries such as lookup, expand, dependency tracing, contradiction lookup, benchmark lookup, and failure-mode lookup;
- add `ResearchActionRegistry`;
- add direct, deferred, and hidden action exposure levels;
- implement the first graph, derivation-check, code-mapping, and benchmark actions.

### 0.0.3: Runtime Controller And Action Traces

- connect research actions to the Kimi tool loop through hooks;
- add action source tracking: model, controller, hidden check, subagent, or replay;
- record structured `ResearchActionRecord` entries;
- trigger hidden checks for high-risk physics claims.

### 0.0.4: Harness And Eval Feedback

- convert failed or inconclusive research-action traces into benchmark candidates;
- add eval fixtures for physics memory, graph query, action selection, and validation outcomes;
- borrow ForgeCode-style repeatable eval organization where useful.

### 0.0.5: LibRPA End-To-End Slice

Close a real computational-physics loop:

```text
formula capsule
-> code mapping
-> git diff / implementation trace
-> smoke benchmark
-> intermediate observable check
-> failure mode or validated memory update
-> harness regression case
```

## Current Status

- Upstream parity with `MoonshotAI/kimi-code:main` was checked on 2026-06-01; the fork was identical at commit `933cf67`.
- The AITP Agent 0.0.1 physics-memory vertical slice is implemented behind `KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY=1`.
- `packages/agent-core` now includes physics-memory types, parser, scanner, registry, compiler, session scanning, append-only records, a model-invocable `PhysicsMemory` builtin tool, LibRPA fixture capsules, and a foundational `ResearchActionRegistry`.
- Windows baseline failures in the broader `agent-core` suite have been resolved; see [AITP Agent 0.0.1 Audit](docs/internal/aitp-agent-0.0.1-audit.md).

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

Repository workflow note:

- completed runtime changes should be committed before moving on to the next coherent slice;
- update this README and `README.zh-CN.md` whenever project goals, feature status, setup, verification, or user-visible behavior changes.

## License

Released under the [MIT License](LICENSE).
