---
id: domain.fqhe-cs
kind: domain_profile
title: FQHE/CS charge-flux theory profile
domain: topological-order/fqhe-cs
status: checked
source_refs:
  - source:laughlin-1983
  - source:zhang-hansson-kivelson-1989
  - source:wen-1995
conventions:
  - convention.fqhe.external-em-flux
  - convention.fqhe.cs-normalization
lenses:
  - charge_flux_quantization
workflows:
  - workflow.fqhe-cs.charge-flux-convention
capsule_refs:
  - definition.fqhe-cs.laughlin-wavefunction
  - derivation.fqhe-cs.flux-insertion-charge-pump
  - formula.fqhe-cs.cs-action-laughlin
  - formula.fqhe-cs.kmatrix-response
  - benchmark.fqhe-cs.known-limits
bridge_capsules: []
context_tags:
  - fqhe
  - chern_simons
  - topological_order
---

This profile keeps the FQHE/CS vertical focused on charge normalization, flux
identity, adiabatic flux insertion, Abelian Chern-Simons response, and K-matrix
known limits.
