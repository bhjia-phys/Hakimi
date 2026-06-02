---
id: benchmark.fqhe-cs.known-limits
kind: BenchmarkCase
domain: topological-order/fqhe-cs
title: FQHE/CS known-limit checks
reliability: checked
symbols:
  - nu
  - sigma_xy
  - Delta_Phi
depends_on:
  - formula.fqhe-cs.cs-action-laughlin
  - formula.fqhe-cs.kmatrix-response
source_refs:
  - source:laughlin-1983
  - source:wen-1995
graph_refs:
  - kind: BenchmarkCase
    id: graph.fqhe-cs.known-limits
    relation: validated_by
expansion_handles:
  - kind: benchmark
    ref: benchmark.fqhe-cs.known-limits
required_checks:
  - id: check.charge-flux-quantization.limiting-case
    kind: limiting_case
    severity: warning
    description: Compare inverse charge-flux period and K-matrix Hall response against nu=1/m.
action_affordances:
  - action_id: derive.compare_with_known_result
    intent: required
    reason: Known limits prevent convention-correct but physically wrong summaries.
---

This theory benchmark is a deterministic known-limit check: Laughlin K=(m), t=1
gives sigma_xy=(e^2/h)/m, and a smaller quasiparticle charge enlarges the AB
external-flux period rather than identifying external and emergent fluxes.
