---
id: formula.librpa.chi0.independent_particle
kind: Formula
domain: librpa
title: Independent-particle polarizability fixture
reliability: linked
symbols:
  - chi0
depends_on:
  - definition.librpa.single_particle_state
  - assumption.librpa.no_vertex
source_refs:
  - fixture:librpa/chi0-independent-particle
graph_refs:
  - kind: Formula
    id: graph.librpa.formula.chi0_independent_particle
    relation: defines
expansion_handles:
  - kind: derivation
    ref: graph.librpa.derivation.chi0_fixture
required_checks:
  - id: check.dimension.chi0_fixture
    kind: dimension
    severity: warning
action_affordances:
  - action_id: code.map_formula_to_code_region
    intent: recommended
    reason: Fixture expects formula-to-code mapping before implementation claims are trusted.
---

Fixture-only formula capsule for testing context compilation. It intentionally avoids making a scientific claim beyond the test contract.
