---
id: eval.theoretical-physics.stochastic-leaky-wall-massive-impurity
kind: research_eval_case
title: Stochastic leaky-wall massive-impurity object-discovery regression
task: Analyze a new non-AdS theoretical-physics problem where a massive impurity moves in a finite trap with one wall randomly switching between reflecting and reservoir-coupled leaky behavior.
domain: theoretical-physics/general
source_refs:
  - topic:stochastic-leaky-wall-massive-impurity
  - rubric:leaky-wall-massive-impurity-object-discovery-2026-06-14
capsule_refs:
  - workflow.theoretical-physics.boundary-sink-motion-inventory
  - workflow.theoretical-physics.research-object-discovery
  - workflow.theoretical-physics.lecture-guided-object-discovery
required_action_bindings:
  - id: binding.leaky-wall.open-workframe
    action_id: open_work_frame
    domain_id: theoretical-physics/general
    workflow_id: workflow.theoretical-physics.general
    priority: blocking
  - id: binding.leaky-wall.compile-context
    action_id: compile_context_pack
    domain_id: theoretical-physics/general
    workflow_id: workflow.theoretical-physics.general
    priority: blocking
  - id: binding.leaky-wall.inspect-aitp-profiles
    action_id: inspect_aitp_runtime_payload_profiles
    domain_id: theoretical-physics/general
    workflow_id: workflow.theoretical-physics.general
    priority: high
  - id: binding.leaky-wall.draft-aitp-run
    action_id: draft_aitp_write_bridge_call
    domain_id: theoretical-physics/general
    workflow_id: workflow.theoretical-physics.general
    priority: blocking
validations:
  - type: action_outcome
    action_id: open_work_frame
    outcome: pass
  - type: action_outcome
    action_id: compile_context_pack
    outcome: pass
  - type: action_outcome
    action_id: draft_aitp_write_bridge_call
    outcome: pass
  - type: required_check
    check:
      id: check.theoretical-physics.boundary-sink-motion-inventory
      kind: assumption_scope
      severity: blocking
  - type: required_check
    check:
      id: check.theoretical-physics.model-layer-motion-map
      kind: assumption_scope
      severity: blocking
expected_final_status: checked
forbidden_claims:
  - spectrum is the primary object of the leaky-wall motion problem
  - reservoir coupling is identical to deleting probability without flux accounting
  - the wall loss can be analyzed without naming the moving object or hitting condition
timeout_seconds: 90
---

Regression rubric:

- 20 pts: identifies the moving massive impurity/excitation and the effective leaky wall or reservoir-coupled surface as distinct physical objects.
- 20 pts: defines the random boundary process: reflecting when closed/off and reservoir/loss-channel coupled when open/on.
- 20 pts: centers motion observables such as survival probability, first-passage or hitting-time distribution, current, energy flux, and absorption rate.
- 15 pts: separates model layers: classical trajectory or stochastic billiard, wavepacket/Schrodinger or KG field, kinetic ensemble/master equation, and optional spectral diagnostics.
- 10 pts: treats spectra, modes, or resonances as secondary diagnostics rather than the primary object.
- 10 pts: uses Hakimi runtime planning correctly: opens a WorkFrame, compiles ContextPack, checks AITP payload readiness, and drafts a startResearchRun write.
- 5 pts: executes the Hakimi AITP write bridge for startResearchRun, or reports the bridge blocker separately from physical answer quality.
