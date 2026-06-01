---
id: benchmark.librpa.chi0.smoke
kind: BenchmarkCase
domain: librpa
title: Chi0 smoke benchmark fixture
reliability: parsed
depends_on:
  - formula.librpa.chi0.independent_particle
  - codemapping.librpa.chi0.placeholder
source_refs:
  - fixture:librpa/benchmark/chi0-smoke
graph_refs:
  - kind: BenchmarkCase
    id: graph.librpa.benchmark.chi0_smoke
    relation: validated_by
---

Fixture-only benchmark case that marks the formula capsule as benchmark-connected for compiler tests.
