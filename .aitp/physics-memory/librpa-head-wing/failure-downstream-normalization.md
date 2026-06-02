---
id: failure.librpa.head-wing.downstream-normalization
kind: FailureMode
domain: librpa/head-wing
title: LibRPA head-wing downstream normalization drift
reliability: parsed
symbols:
  - wing
depends_on:
  - formula.librpa.head-wing.update
  - codemapping.librpa.head-wing.formula-code-region
source_refs:
  - roadmap:aitp-agent-0.5.0-librpa-vertical
graph_refs:
  - kind: FailureMode
    id: graph.librpa.head-wing.downstream-normalization
    relation: fails_under
expansion_handles:
  - kind: failure
    ref: failure.librpa.head-wing.downstream-normalization
required_checks:
  - id: check.librpa-head-wing.benchmark
    kind: benchmark
    severity: blocking
    description: Benchmark failures should become harness cases before retrying promotion.
---

If a head-wing edit changes downstream normalization, the smoke benchmark should
fail and the failure should be captured into the research harness.
