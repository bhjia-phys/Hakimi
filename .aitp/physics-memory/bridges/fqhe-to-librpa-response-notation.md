---
id: bridge.fqhe-cs-to-librpa.response-notation
kind: Bridge
domain: topological-order/fqhe-cs
title: FQHE response notation to LibRPA response-observable bridge
reliability: checked
symbols:
  - chi
  - sigma_xy
depends_on:
  - formula.fqhe-cs.kmatrix-response
  - formula.librpa.head-wing.update
source_refs:
  - roadmap:aitp-agent-0.7.0-domain-bridge
graph_refs:
  - kind: Bridge
    id: graph.bridge.fqhe-cs-to-librpa.response-notation
    relation: bridges_to
expansion_handles:
  - kind: bridge
    ref: bridge.fqhe-cs-to-librpa.response-notation
required_checks:
  - id: check.bridge.fqhe-librpa.scope
    kind: assumption_scope
    severity: blocking
    description: The bridge is only a response-notation comparison, not a physical equivalence.
bridge:
  from_domain: topological-order/fqhe-cs
  to_domain: librpa/head-wing
  capsule_refs:
    - formula.librpa.head-wing.update
  reason: Compare response-observable notation without importing LibRPA code-workflow obligations by default.
---

This bridge permits a FQHE/CS WorkFrame to explicitly inspect the LibRPA
head-wing response formula as notation-adjacent context. It does not make LibRPA
benchmark or code-mapping obligations part of ordinary FQHE answers.
