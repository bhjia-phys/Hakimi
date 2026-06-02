---
id: workflow.librpa.head-wing.formula-code-mapping
kind: workflow_recipe
title: LibRPA head-wing formula-code mapping workflow
domain: librpa/head-wing
status: checked
source_refs:
  - roadmap:aitp-agent-0.5.0-librpa-vertical
action_bindings:
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
required_capsules:
  - formula.librpa.head-wing.update
  - codemapping.librpa.head-wing.formula-code-region
  - benchmark.librpa.head-wing.smoke
required_tools:
  - Bash
  - Edit
failure_modes:
  - failure.librpa.head-wing.downstream-normalization
---

Run this workflow before promoting a LibRPA head-wing code edit beyond checked:
inspect consumers, map the formula to the edited code region, capture the git
diff as evidence, and run the deterministic minimal benchmark adapter.
