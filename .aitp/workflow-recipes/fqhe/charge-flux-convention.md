---
id: workflow.fqhe-cs.charge-flux-convention
kind: workflow_recipe
title: FQHE/CS charge-flux convention workflow
domain: topological-order/fqhe-cs
status: checked
source_refs:
  - source:laughlin-1983
  - source:zhang-hansson-kivelson-1989
  - source:wen-1995
action_bindings:
  - id: binding.fqhe-cs.charge-flux-apply-lens
    action_id: physics.apply_direction_lens
    domain_id: topological-order/fqhe-cs
    workflow_id: workflow.fqhe-cs.charge-flux-convention
    lens_id: charge_flux_quantization
    priority: high
  - id: binding.fqhe-cs.charge-flux-convention
    action_id: validate.check_convention
    domain_id: topological-order/fqhe-cs
    workflow_id: workflow.fqhe-cs.charge-flux-convention
    lens_id: charge_flux_quantization
    check_id: check.charge-flux-quantization.convention
    priority: blocking
    params:
      requiredDistinctions:
        - external_em_flux
        - emergent_cs_flux
        - quasiparticle_ab_flux_period
        - berry_curvature_flux
  - id: binding.fqhe-cs.charge-flux-known-limit
    action_id: derive.compare_with_known_result
    domain_id: topological-order/fqhe-cs
    workflow_id: workflow.fqhe-cs.charge-flux-convention
    lens_id: charge_flux_quantization
    check_id: check.charge-flux-quantization.limiting-case
    priority: high
  - id: binding.fqhe-cs.charge-flux-dependency-closure
    action_id: graph.query_dependency_closure
    domain_id: topological-order/fqhe-cs
    workflow_id: workflow.fqhe-cs.charge-flux-convention
    lens_id: charge_flux_quantization
    priority: normal
required_capsules:
  - definition.fqhe-cs.laughlin-wavefunction
  - derivation.fqhe-cs.flux-insertion-charge-pump
  - formula.fqhe-cs.cs-action-laughlin
  - formula.fqhe-cs.kmatrix-response
  - benchmark.fqhe-cs.known-limits
required_tools:
  - PhysicsMemory
  - ResearchAction
failure_modes:
  - failure.fqhe-cs.flux-identity-conflation
---

Use this workflow when a FQHE/CS answer relies on inverse charge-flux period
reasoning. The blocking check is convention identity; the high-priority known
limit check ties the answer back to nu=1/m Hall response.
