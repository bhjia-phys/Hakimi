---
id: eval.fqhe-cs.charge-flux-v2
kind: research_eval_case
title: FQHE/CS charge-flux file-backed vertical
task: Explain inverse fractional charge and flux period using Laughlin flux insertion, Abelian CS response, and K-matrix known limits without conflating flux identities.
domain: topological-order/fqhe-cs
source_refs:
  - source:laughlin-1983
  - source:zhang-hansson-kivelson-1989
  - source:wen-1995
capsule_refs:
  - definition.fqhe-cs.laughlin-wavefunction
  - derivation.fqhe-cs.flux-insertion-charge-pump
  - formula.fqhe-cs.cs-action-laughlin
  - formula.fqhe-cs.kmatrix-response
  - benchmark.fqhe-cs.known-limits
required_action_bindings:
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
validations:
  - type: action_outcome
    action_id: validate.check_convention
    outcome: pass
  - type: action_outcome
    action_id: derive.compare_with_known_result
    outcome: pass
  - type: evidence_ref
    pattern: vertical:fqhe-cs.charge-flux-convention
  - type: required_check
    check:
      id: check.charge-flux-quantization.convention
      kind: convention
      severity: blocking
  - type: required_check
    check:
      id: check.charge-flux-quantization.limiting-case
      kind: limiting_case
      severity: warning
expected_final_status: validated
forbidden_claims:
  - external EM flux is identical to emergent CS flux
  - Berry curvature flux is the same as external flux insertion
timeout_seconds: 45
---

This eval exercises the file-backed FQHE/CS vertical. It should pass only when
the answer preserves charge identity, flux identity, phase invariant, and known
limits.
