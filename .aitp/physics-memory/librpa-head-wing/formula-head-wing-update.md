---
id: formula.librpa.head-wing.update
kind: Formula
domain: librpa/head-wing
title: LibRPA head-wing response update
reliability: checked
symbols:
  - chi0_G0
  - chi0_Gq
  - q
  - G
assumes:
  - assumption.librpa.no-vertex-correction
depends_on: []
source_refs:
  - roadmap:aitp-agent-0.5.0-librpa-vertical
graph_refs:
  - kind: Formula
    id: graph.librpa.head-wing.update
    relation: defines
expansion_handles:
  - kind: formula
    ref: formula.librpa.head-wing.update
required_checks:
  - id: check.librpa-head-wing.code-mapping
    kind: code_mapping
    severity: blocking
    description: The formula must be mapped to concrete code regions and downstream readers.
  - id: check.librpa-head-wing.benchmark
    kind: benchmark
    severity: blocking
    description: A minimal deterministic smoke benchmark must pass before checked promotion.
action_affordances:
  - action_id: code.map_formula_to_code_region
    intent: required
    reason: A head-wing formula change is unsafe without a concrete code mapping.
  - action_id: benchmark.run_minimal_case
    intent: required
    reason: The mapped quantity must satisfy the smoke benchmark tolerance.
---

This capsule represents the minimal head-wing response quantity used by the
LibRPA vertical slice. It is intentionally narrow: the runtime should only
treat it as checked when both formula-code mapping and benchmark evidence are
present inside the active WorkFrame.
