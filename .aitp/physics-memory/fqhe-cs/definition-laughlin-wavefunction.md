---
id: definition.fqhe-cs.laughlin-wavefunction
kind: Definition
domain: topological-order/fqhe-cs
title: Laughlin wavefunction at filling nu=1/m
reliability: checked
symbols:
  - Psi_m
  - z_i
  - m
  - l_B
assumes:
  - assumption.lowest-landau-level
  - assumption.odd-m-fermions
depends_on: []
source_refs:
  - source:laughlin-1983
graph_refs:
  - kind: Definition
    id: graph.fqhe-cs.laughlin-wavefunction
    relation: defines
expansion_handles:
  - kind: definition
    ref: definition.fqhe-cs.laughlin-wavefunction
required_checks:
  - id: check.fqhe-cs.wavefunction.assumption-scope
    kind: assumption_scope
    severity: blocking
    description: State lowest-Landau-level and odd-m assumptions before reusing the wavefunction.
action_affordances:
  - action_id: graph.query_dependency_closure
    intent: recommended
    reason: The wavefunction assumptions are prerequisites for later flux insertion claims.
---

The Laughlin state at filling nu=1/m is represented by a holomorphic Jastrow
factor times the lowest-Landau-level Gaussian, with m odd for fermions.
