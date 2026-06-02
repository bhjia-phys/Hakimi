---
id: derivation.fqhe-cs.flux-insertion-charge-pump
kind: DerivationStep
domain: topological-order/fqhe-cs
title: Flux insertion and fractional charge pump
reliability: checked
symbols:
  - q
  - Phi
  - Delta_Phi
  - hbar
assumes:
  - assumption.adiabatic-gap
  - convention.fqhe.external-em-flux
depends_on:
  - definition.fqhe-cs.laughlin-wavefunction
source_refs:
  - source:laughlin-1983
graph_refs:
  - kind: Formula
    id: graph.fqhe-cs.ab-phase
    relation: derives_from
  - kind: Formula
    id: graph.fqhe-cs.quasiparticle-flux-period
    relation: checks
expansion_handles:
  - kind: derivation
    ref: derivation.fqhe-cs.flux-insertion-charge-pump
required_checks:
  - id: check.charge-flux-quantization.convention
    kind: convention
    severity: blocking
    description: Declare the charge identity, flux identity, and phase invariant.
  - id: check.charge-flux-quantization.limiting-case
    kind: limiting_case
    severity: warning
    description: Compare with the electron-charge and nu=1/m known limits.
action_affordances:
  - action_id: physics.apply_direction_lens
    intent: recommended
    reason: The charge-flux lens exposes the dangerous flux-identity distinction.
  - action_id: validate.check_convention
    intent: required
    reason: This derivation is invalid if external EM, emergent CS, AB, and Berry flux are conflated.
---

The AB phase depends on q Phi / hbar. For a quasiparticle AB period, reducing
the quasiparticle charge increases the external-flux period. This does not by
itself identify external electromagnetic flux with emergent Chern-Simons flux.
