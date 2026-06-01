---
id: codemapping.librpa.chi0.placeholder
kind: CodeMapping
domain: librpa
title: Chi0 placeholder code mapping fixture
reliability: parsed
depends_on:
  - formula.librpa.chi0.independent_particle
source_refs:
  - fixture:librpa/code/chi0-placeholder
graph_refs:
  - kind: CodeMapping
    id: graph.librpa.codemapping.chi0_placeholder
    relation: maps_to_code
expansion_handles:
  - kind: code
    ref: fixture:librpa/src/chi0-placeholder
required_checks:
  - id: check.code_mapping.chi0_fixture
    kind: code_mapping
    severity: warning
---

Fixture-only code mapping used to verify that formula-to-code references can be represented without asserting a real source location.
