---
id: failure.fqhe-cs.flux-identity-conflation
kind: FailureMode
domain: topological-order/fqhe-cs
title: External EM flux and emergent CS flux conflation
reliability: parsed
symbols:
  - Phi
  - A
  - a
depends_on:
  - derivation.fqhe-cs.flux-insertion-charge-pump
  - formula.fqhe-cs.cs-action-laughlin
source_refs:
  - source:laughlin-1983
  - source:zhang-hansson-kivelson-1989
graph_refs:
  - kind: FailureMode
    id: graph.fqhe-cs.flux-identity-conflation
    relation: fails_under
expansion_handles:
  - kind: failure
    ref: failure.fqhe-cs.flux-identity-conflation
required_checks:
  - id: check.charge-flux-quantization.convention
    kind: convention
    severity: blocking
    description: Block answers that identify external EM flux, emergent CS flux, AB period, and Berry flux.
---

A common trap is to treat external electromagnetic flux insertion, emergent
Chern-Simons flux, quasiparticle AB period, and Berry curvature flux as the
same object. The runtime should force the distinction before checked or
validated claims.
