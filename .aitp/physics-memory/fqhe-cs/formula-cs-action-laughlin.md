---
id: formula.fqhe-cs.cs-action-laughlin
kind: Formula
domain: topological-order/fqhe-cs
title: Abelian Chern-Simons effective action for Laughlin state
reliability: checked
symbols:
  - S
  - m
  - a
  - A
assumes:
  - assumption.compact-u1
  - convention.fqhe.cs-normalization
depends_on:
  - derivation.fqhe-cs.flux-insertion-charge-pump
source_refs:
  - source:zhang-hansson-kivelson-1989
graph_refs:
  - kind: Formula
    id: graph.fqhe-cs.cs-action-laughlin
    relation: derives_from
expansion_handles:
  - kind: formula
    ref: formula.fqhe-cs.cs-action-laughlin
required_checks:
  - id: check.charge-flux-quantization.convention
    kind: convention
    severity: blocking
    description: Declare CS normalization and distinguish A from a.
  - id: check.charge-flux-quantization.limiting-case
    kind: limiting_case
    severity: warning
    description: Check that the response reproduces nu=1/m.
action_affordances:
  - action_id: validate.check_convention
    intent: required
    reason: The effective action is sensitive to normalization and flux identity.
---

In the Abelian Laughlin description, S = (m / 4 pi) int a da + (1 / 2 pi) int A
da, using external electromagnetic field A and emergent compact U(1) field a.
