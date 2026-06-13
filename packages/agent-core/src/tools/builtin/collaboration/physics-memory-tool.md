Query the compiled theoretical-physics memory graph for the current research task.

Boundary: `PhysicsMemory` is a Hakimi-local compatibility/projection surface. It can provide domain fixtures, capsule context, and migration candidates, but it is not the canonical AITP typed-record graph, does not create AITP evidence, and cannot update claim trust. AITP typed records, process graph slices, relation maps, and curated RAG promotion paths are authoritative for durable research state.

Use this tool when you need domain-scoped physics context, capsule metadata, derivation dependencies, code mappings, benchmark cases, failure modes, or expansion handles before continuing a derivation or implementation.

Prefer `compile_context` before a focused derivation or code change. Use `load_capsule` only when a specific capsule needs its full body.

For broad discovery, use `list_capsules` with `domain` and optional `kind`; add `max_capsules` when you only need a short summary list.

Use `promote_candidate` only after a candidate object has explicit provenance, scope, and validation evidence. Promotion is conservative and local to the compatibility projection: raw or source-free session material must not silently become canonical physics memory or AITP claim support.
