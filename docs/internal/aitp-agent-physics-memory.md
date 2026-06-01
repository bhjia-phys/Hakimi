# AITP Agent Physics Memory

## Purpose

Physics memory is the first runtime-native semantic memory layer for AITP Agent. It is not a prompt appendix and not a RAG index. The goal is to give the model a small, typed, provenance-bearing context pack for the current physics task, while keeping deeper derivations, code mappings, benchmarks, and failure modes available through explicit loading.

## Boundaries

Skills are procedural memory: they describe how the agent should work. A skill can say "derive, then check dimensions" or "map a formula to code before changing LibRPA".

Physics capsules are semantic memory: they describe what is known, under which assumptions, with which sources, dependencies, checks, and failure conditions. Capsules are compiled projections of a finer physics graph, not the whole graph.

The compiler builds a domain-scoped context pack from capsules. It includes focused capsules, direct dependencies, and diagnostics such as missing dependencies, cross-domain contamination, missing benchmark coverage, duplicate ids, or scan warnings.

The context pack is the model-visible working set. It should be compact, auditable, and tied to the current domain.

## Why This Is Not RAG

RAG retrieves text chunks. Physics memory loads typed records. A capsule has a kind, domain, reliability state, source refs, graph refs, dependencies, expansion handles, required checks, and action affordances. The compiler can reason over those fields before text reaches the model.

The key contract is provenance plus structure: the model should know whether a statement is a definition, assumption, formula, code mapping, benchmark case, failure mode, or workflow recipe, and what must be checked before reusing it.

## Reliability States

- `raw`: captured but not parsed or linked.
- `parsed`: syntactically valid and source-bearing.
- `linked`: dependencies and graph refs have been connected.
- `checked`: local checks have run.
- `validated`: benchmark or independent evidence supports reuse.
- `formalized`: represented in a formal system or checked kernel.
- `rejected`: retained as negative memory and excluded from trusted context.

## Domain Isolation

Capsules belong to a domain such as `librpa`, `fqhe`, `qft`, or `quantum-gravity`. `compile_context` includes only the requested domain unless a dependency explicitly permits crossing through capsule metadata. Cross-domain dependencies otherwise produce diagnostics instead of silently contaminating the context.

## LibRPA Vertical Slice

The 0.0.1 fixture slice lives under `packages/agent-core/test/fixtures/physics-memory/librpa`. It contains:

- a `Definition` capsule for a single-particle state fixture;
- an `Assumption` capsule for the no-vertex approximation fixture;
- a `Formula` capsule for independent-particle polarizability;
- a `CodeMapping` capsule that points to a placeholder implementation reference;
- a `BenchmarkCase` capsule that marks the formula as benchmark-connected.

These fixtures are deliberately conservative. They test the memory architecture and audit trail; they are not promoted as scientific claims.

## Audit Trail

When the experimental flag `KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY=1` is enabled, the session scans `.aitp/physics-memory` and `~/.aitp/physics-memory`, then injects a `PhysicsMemoryManager` into agents. The manager records:

- `physics_memory.roots_loaded`;
- `physics_memory.capsule_loaded`;
- `physics_memory.context_compiled`.

The records include capsule ids, domains, loaded roots, diagnostics, and tool call ids where applicable. This is the base for later harness scoring and failure feedback.
