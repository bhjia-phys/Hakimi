---
id: benchmark.librpa.head-wing.smoke
kind: BenchmarkCase
domain: librpa/head-wing
title: LibRPA head-wing deterministic smoke benchmark
reliability: checked
symbols:
  - head
  - wing
depends_on:
  - formula.librpa.head-wing.update
  - codemapping.librpa.head-wing.formula-code-region
source_refs:
  - adapter:adapter.librpa.head-wing-smoke
graph_refs:
  - kind: BenchmarkCase
    id: graph.librpa.head-wing.smoke
    relation: validated_by
expansion_handles:
  - kind: benchmark
    ref: adapter.librpa.head-wing-smoke
required_checks:
  - id: check.librpa-head-wing.benchmark
    kind: benchmark
    severity: blocking
    description: The deterministic adapter must pass inside the active WorkFrame.
action_affordances:
  - action_id: benchmark.run_minimal_case
    intent: required
    reason: This benchmark is the minimal guard for the head-wing vertical.
---

The smoke benchmark compares expected and observed scalar head/wing observables
with a fixed tolerance. It is a local adapter contract, not a remote HPC run.
