Query the compiled theoretical-physics memory graph for the current research task.

Use this tool when you need domain-scoped physics context, capsule metadata, derivation dependencies, code mappings, benchmark cases, failure modes, or expansion handles before continuing a derivation or implementation.

Prefer `compile_context` before a focused derivation or code change. Use `load_capsule` only when a specific capsule needs its full body.

Use `promote_candidate` only after a candidate object has explicit provenance, scope, and validation evidence. Promotion is conservative: raw or source-free session material must not silently become canonical physics memory.
