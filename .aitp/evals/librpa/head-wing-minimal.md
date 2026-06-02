---
id: eval.librpa.head-wing.minimal
kind: research_eval_case
title: LibRPA head-wing minimal checked loop
task: Map a LibRPA head-wing formula edit to code, capture the diff, run the smoke benchmark, and only claim checked status with benchmark evidence.
domain: librpa/head-wing
source_refs:
  - roadmap:aitp-agent-0.5.0-librpa-vertical
capsule_refs:
  - formula.librpa.head-wing.update
  - codemapping.librpa.head-wing.formula-code-region
  - benchmark.librpa.head-wing.smoke
required_action_bindings:
  - id: binding.librpa-head-wing.inspect-call-sites
    action_id: code.inspect_call_sites
    domain_id: librpa/head-wing
    workflow_id: workflow.librpa.head-wing.formula-code-mapping
    priority: blocking
  - id: binding.librpa-head-wing.map-formula-code-region
    action_id: code.map_formula_to_code_region
    domain_id: librpa/head-wing
    workflow_id: workflow.librpa.head-wing.formula-code-mapping
    check_id: check.librpa-head-wing.code-mapping
    priority: blocking
  - id: binding.librpa-head-wing.capture-git-diff
    action_id: code.capture_git_diff_observation
    domain_id: librpa/head-wing
    workflow_id: workflow.librpa.head-wing.formula-code-mapping
    priority: high
  - id: binding.librpa-head-wing.run-minimal-case
    action_id: benchmark.run_minimal_case
    domain_id: librpa/head-wing
    workflow_id: workflow.librpa.head-wing.formula-code-mapping
    check_id: check.librpa-head-wing.benchmark
    adapter_id: adapter.librpa.head-wing-smoke
    priority: blocking
validations:
  - type: action_outcome
    action_id: benchmark.run_minimal_case
    outcome: pass
  - type: evidence_ref
    pattern: benchmark:case.librpa.head-wing-smoke
  - type: required_check
    check:
      id: check.librpa-head-wing.benchmark
      kind: benchmark
      severity: blocking
expected_final_status: checked
forbidden_claims:
  - checked without benchmark
timeout_seconds: 30
---

This eval exercises the real LibRPA vertical contract without invoking an HPC
run. The smoke adapter is deterministic and failures can be promoted into
additional file-backed harness cases.
