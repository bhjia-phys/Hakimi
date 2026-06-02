---
id: formula.fqhe-cs.kmatrix-response
kind: Formula
domain: topological-order/fqhe-cs
title: K-matrix Hall response for Laughlin state
reliability: checked
symbols:
  - sigma_xy
  - e
  - h
  - K
  - t
assumes:
  - assumption.abelian-topological-order
  - convention.fqhe.charge-vector
depends_on:
  - formula.fqhe-cs.cs-action-laughlin
source_refs:
  - source:wen-1995
graph_refs:
  - kind: Formula
    id: graph.fqhe-cs.kmatrix-response
    relation: derives_from
expansion_handles:
  - kind: formula
    ref: formula.fqhe-cs.kmatrix-response
required_checks:
  - id: check.charge-flux-quantization.limiting-case
    kind: limiting_case
    severity: warning
    description: For Laughlin K=(m), t=1 gives sigma_xy=(e^2/h)/m.
action_affordances:
  - action_id: derive.compare_with_known_result
    intent: required
    reason: The response formula should reproduce the Laughlin nu=1/m Hall conductance.
---

The Abelian K-matrix response gives sigma_xy = (e^2 / h) t^T K^{-1} t. For the
Laughlin state, K=(m) and t=1.
