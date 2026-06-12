---
id: eval.theoretical-physics.random-open-boundary-ads-massive-matter
kind: research_eval_case
title: Random open AdS boundary massive-matter regression
task: Analyze massive matter motion in a fixed-background AdS reflecting cavity where a stochastic boundary detector switches between reflecting and bath-coupled absorbing behavior; distinguish true conformal-boundary coupling from finite cutoff-wall interaction.
domain: theoretical-physics/general
source_refs:
  - topic:random-open-boundary-ads-cavity
  - rubric:ads-massive-matter-random-boundary-2026-06-12
capsule_refs:
  - concept.ads.reflecting-cavity
  - concept.ads.massive-timelike-geodesic-boundary-reachability
required_action_bindings:
  - id: binding.ads-massive.open-workframe
    action_id: open_work_frame
    domain_id: theoretical-physics/general
    workflow_id: workflow.theoretical-physics.general
    priority: blocking
  - id: binding.ads-massive.compile-context
    action_id: compile_context_pack
    domain_id: theoretical-physics/general
    workflow_id: workflow.theoretical-physics.general
    priority: blocking
  - id: binding.ads-massive.inspect-aitp-profiles
    action_id: inspect_aitp_runtime_payload_profiles
    domain_id: theoretical-physics/general
    workflow_id: workflow.theoretical-physics.general
    priority: high
  - id: binding.ads-massive.draft-aitp-run
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
      id: check.ads-massive.conformal-boundary-reachability
      kind: known_limit
      severity: blocking
  - type: required_check
    check:
      id: check.ads-massive.massive-matter-observables
      kind: convention
      severity: blocking
expected_final_status: checked
forbidden_claims:
  - massive particle automatically hits the AdS conformal boundary
  - normal modes are the primary object of the massive-matter problem
  - boundary absorption is literal destruction rather than flux transfer to a bath
timeout_seconds: 90
---

Regression rubric:

- 25 pts: states that finite-energy classical massive timelike motion in global AdS generally does not reach the conformal boundary, so boundary absorption must be modeled through a finite cutoff wall, a wavepacket tail/field boundary condition, or a kinetic matter distribution with a boundary sink.
- 20 pts: defines the stochastic boundary process: detector off gives reflecting boundary, detector on couples the boundary/cutoff surface to an external measurement or bath channel and removes subsystem energy/particle flux.
- 20 pts: centers massive matter dynamics: particle trajectory/reflection map, wavepacket propagation, or kinetic distribution evolution, with survival probability, hitting-time distribution, particle number, and energy flux as observables.
- 15 pts: separates model layers: classical massive particle at a cutoff wall, massive KG wavepacket with absorbing boundary, and optional kinetic/ensemble description.
- 10 pts: treats normal modes/QNMs as auxiliary spectral diagnostics only, not the main question.
- 5 pts: uses Hakimi runtime planning correctly: opens a WorkFrame, compiles ContextPack, checks AITP payload readiness, and drafts a startResearchRun write.
- 5 pts: executes the Hakimi AITP write bridge for startResearchRun, rather than relying only on direct MCP fallback calls; if blocked, the report must expose the bridge blocker separately from physical answer quality.
