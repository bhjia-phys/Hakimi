---
id: domain.librpa.head-wing
kind: domain_profile
title: LibRPA head-wing formula-code profile
domain: librpa/head-wing
status: checked
source_refs:
  - roadmap:aitp-agent-0.5.0-librpa-vertical
conventions:
  - convention.librpa.head-wing.matrix-blocks
lenses:
  - librpa_head_wing_formula_code_mapping
workflows:
  - workflow.librpa.head-wing.formula-code-mapping
capsule_refs:
  - formula.librpa.head-wing.update
  - codemapping.librpa.head-wing.formula-code-region
  - benchmark.librpa.head-wing.smoke
bridge_capsules: []
context_tags:
  - librpa
  - head_wing
  - code_change
---

The LibRPA head-wing profile keeps local formula-code edits tied to call-site
closure, intermediate observable checks, and a deterministic smoke benchmark.
