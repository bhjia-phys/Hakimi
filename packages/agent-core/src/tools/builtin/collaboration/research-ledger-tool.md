Query, write, and compile source-backed research ledger events for AITP Agent.

Use this tool when a physics task needs prior session evidence, derivation notes, source excerpts, code observations, git-diff observations, benchmark observations, failures, or user decisions that have not yet been promoted into physics memory.

Use `write_event` only for compact, source-backed observations that should become compile-ready evidence. Do not dump long raw outputs into the ledger; store large logs or artifacts elsewhere and cite them through `source_refs` or the event body.

Do not treat ledger events as validated memory. Use `compile_proposals` to convert linked ledger events into candidate capsules, graph refs, obligations, failure modes, or harness candidates before relying on them.
