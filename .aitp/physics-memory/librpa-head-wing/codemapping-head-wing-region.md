---
id: codemapping.librpa.head-wing.formula-code-region
kind: CodeMapping
domain: librpa/head-wing
title: LibRPA head-wing formula to code region
reliability: checked
symbols:
  - chi0_G0
  - chi0_Gq
depends_on:
  - formula.librpa.head-wing.update
source_refs:
  - roadmap:aitp-agent-0.5.0-librpa-vertical
graph_refs:
  - kind: CodeMapping
    id: graph.librpa.head-wing.formula-code-region
    relation: maps_to_code
expansion_handles:
  - kind: code
    ref: code:librpa/head-wing
required_checks:
  - id: check.librpa-head-wing.code-mapping
    kind: code_mapping
    severity: blocking
    description: Call sites and intermediate observables must be closed.
action_affordances:
  - action_id: code.inspect_call_sites
    intent: required
    reason: Downstream readers consume the mapped head-wing quantity.
  - action_id: code.capture_git_diff_observation
    intent: recommended
    reason: The exact diff should be captured as ledger evidence.
---

The mapping capsule records the runtime obligation to inspect downstream
callers and preserve a diff observation for any head-wing code edit.
