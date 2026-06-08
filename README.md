# Hakimi

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi terminal welcome screen with a pixel cat-ear exploration spacecraft" />
</p>

<p align="center">
  <strong>Physics agent for exploring the truth of the world.</strong><br />
  <span>Hakimi is a truth-seeking physics research agent built inside the native Kimi Code runtime.</span>
</p>

<p align="center">
  <a href="README.zh-CN.md">Chinese</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">Repository</a> |
  <a href="https://moonshotai.github.io/kimi-code/en/">Upstream Kimi Code docs</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Status](https://img.shields.io/badge/status-runtime--roadmap-blue)](docs/superpowers/plans/2026-06-02-aitp-agent-runtime-slices-v2.md)

## The Idea

Hakimi is intentionally a little playful. The name carries the lightness of "Hakimi" and the curiosity of a small exploration spacecraft with cat-ear fins: not a cold oracle, not a giant black box, but a companion for entering unknown physics problems with care, memory, and evidence.

The serious part is the mission. Hakimi is built for theoretical physics work where a conversation can touch papers, derivations, code, benchmarks, failed runs, conventions, and long-lived research memory. The agent should not merely answer from a prompt. It should help keep the research state coherent.

## Why This Exists

Hakimi is not a notebook bolted onto a coding agent. It is a runtime-native fork of [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code): the terminal loop, tools, sessions, skills, MCP, subagents, records/replay, permissions, OAuth path, and package shape remain Kimi Code-compatible where compatibility matters. The theoretical-physics system is inserted into the runtime itself through `.hakimi` research files, legacy `.aitp` compatibility files, `packages/agent-core`, turn-loop context injection, tool exposure, records, replay, and model-facing research tools.

That means a research action can search literature, inspect code, prepare patches, submit or normalize external job receipts, capture evidence, and return to the correct WorkFrame without mixing unrelated topics. The goal is simple to say and hard to do: each research thread should remember what it knows, what it assumes, what evidence supports it, what remains unverified, and which tools produced the trail.

## Native Runtime Fusion

<p align="center">
  <img src="docs/assets/hakimi-native-runtime-fusion.svg" width="860" alt="Hakimi native runtime fusion diagram" />
</p>

## Research Loop

<p align="center">
  <img src="docs/assets/hakimi-research-loop.svg" width="860" alt="Hakimi research loop diagram" />
</p>

## What Works Today

- `hakimi` is the only CLI command installed by this package, so it does not overwrite a separate Kimi Code `kimi` command.
- The TUI welcome screen uses the Hakimi pixel spacecraft identity and physics research copy.
- WorkFrames keep active research topics scoped by domain, topic, assumptions, conventions, context pack, and trust state.
- Domain packs, workflow recipes, physics memory, evals, action bindings, and tool inventories can be loaded from file-backed `.hakimi` fixtures, with legacy `.aitp` fixtures still scanned for compatibility.
- New topics do not require hand-written packs up front: Hakimi now registers a built-in generic theoretical-physics profile, workflow recipes, process-memory capsules, and a smoke eval by default, then falls back to that scaffold when a WorkFrame has no dedicated pack.
- AITP v5 `process_graph_slice` payloads can be parsed and locally compiled into research-context reminders, open-obligation summaries, trust-boundary warnings, and recommended `ResearchAction` ids without copying the AITP graph into Hakimi as truth.
- AITP `exploratory_records` inside a process graph slice now compile into first-class moments for question decomposition, relation-path brainstorming, source/backtrace continuity, original-question drift audit, and `aitp.record_exploratory_record`.
- AITP `source_asset` nodes, `source_asset_ids`, and `source_asset_index[]` now compile into source-backtrace and source-asset-index reminders, so raw papers, lectures, notes, code snapshots, datasets, generated artifacts, hashes, version anchors, reference locations, and duplicate-hash diagnostics stay canonical in `.aitp` while Hakimi keeps only bounded WorkFrame context.
- AITP `moment_policy.decisions` now compile into first-class Hakimi `callObligations`: required-now decisions become blocking action bindings, trust-changing prerequisites are surfaced in ContextPacks, and AITP `entrypoints` stay visible so the model knows which typed AITP write/preflight surface is expected.
- AITP lifecycle trigger fields such as `lifecycle_phases`, `trigger_conditions`, `recording_threshold`, `trust_boundary_inputs`, and `recommended_host_behavior` are preserved as orientation-only policy projections on action params and call obligations, so the model and final gate can see why a ResearchAction belongs in pre-turn, pre-action, or pre-final flow without creating a Hakimi record.
- AITP theory-reasoning handles from exploratory records and `payload_hints[].draft`, including relation-path questions, backtrace targets, definition/derivation/source dependency questions, and original-question guards, compile into `params.theoryReasoning`, explicit WorkFrame reminder lines, and ContextPack XML `<theory_reasoning>` bindings. Hakimi uses them to constrain local physics brainstorming/backtrace prompts, not as canonical memory.
- AITP `route_state` now compiles into native route summaries, WorkFrame reminders, ContextPack XML `<live_routes>`, `<blocked_routes>`, `<abandoned_routes>`, and `<pivot_required_routes>`, plus `aitp.record_route_choice`, `aitp.record_failed_route_lesson`, and `aitp.checkpoint_before_route_switch` recommendations. Hakimi treats ordinary route notes as process-continuity guidance; they only become final-gate blockers when AITP explicitly marks `final_gate_required` or `required_before_trust_change`.
- AITP `provenance_gaps[]` now compile into provenance summaries, WorkFrame reminder lines, ContextPack provenance fields, and capture-oriented `ResearchAction` bindings such as `aitp.capture_source_asset_auto`, `aitp.register_source_asset`, `aitp.capture_code_state_auto`, `aitp.capture_tool_run_auto`, `aitp.record_tool_run`, `aitp.create_validation_contract`, `aitp.record_validation_result`, `aitp.attach_artifact_auto`, `aitp.attach_artifact`, and `code.capture_git_diff_observation`. Gap-level AITP `payload_hints[]` become `writeBridge.payloadDraft` and `writeBridge.payloadDraftSchema` values for those local writes, including local source-asset auto-capture, code-state, local tool-run transcript/result auto-capture, local artifact auto-attach, manual tool-run, validation, source-asset, reference-location, and artifact payloads. The schema tells the model/host which placeholder fields still require real local provenance before execution. Ordinary source/code/tool/artifact gaps are reuse-before-trust guidance, not final-gate blockers, unless AITP explicitly marks them as required before a trust change.
- AITP `source_asset_index[]` now compiles into native `sourceAssets` summaries, WorkFrame reminders, and ContextPack XML fields for all indexed source asset ids, missing hashes, and duplicate hashes. Hakimi reads the index to decide what source/code/artifact provenance needs attention, but it does not create a `.hakimi` source asset store.
- AITP `source_stack_coverage` now compiles into native `sourceStackCoverage` summaries, WorkFrame reminders, and ContextPack XML fields for covered claim ids, evidence-output gaps, reconstruction gaps, review gaps, and AITP next actions. Hakimi uses it as source-stack readiness guidance and leaves final-gate blocking to explicit AITP trust/final prerequisites.
- AITP `source_reconstruction_review` now compiles into native source reconstruction review summaries, WorkFrame reminders, and ContextPack XML fields for review claim ids, open review claim ids, needs-revision/inconclusive claim ids, review-packet claim ids, and AITP next actions. Hakimi uses it as review worklist guidance, not as claim-trust authority.
- Hakimi's final gate now reads active ContextPack AITP `callObligations`: unchecked required-now calls or trust-boundary prerequisites force a final-gate continuation and status downgrade unless the corresponding `ResearchAction` was recorded as passed or explicitly blocked.
- AITP write moments now carry explicit bridge metadata inside `ResearchActionBinding.params`, so ContextPacks can show whether the next durable write or preflight should use `recordEvidence`, `recordReferenceLocation`, `recordToolRun`, `recordExploratoryRecord`, `captureSourceAssetAuto`, `captureToolRunAuto`, `captureCodeStateAuto`, `attachArtifactAuto`, `attachArtifact`, `createProofObligation`, `requestHumanCheckpoint`, `preflightTrustUpdate`, or another constrained AITP bridge operation.
- AITP write/preflight moments now also carry MCP-first runtime target metadata derived from AITP's `runtime_bridge_target_manifest`: `entrypointKey`, `mcpTool`, `cliFallback`, public surface, preferred/fallback transport, MCP invocation contract, and state-effect fields are visible in ContextPack action params without creating a Hakimi-owned entrypoint catalog. Configured AITP process-graph reads, writes, and preflight calls now prefer the connected AITP MCP tool and fall back to the CLI bridge when MCP is unavailable, disabled, or fails.
- The same runtime target table now includes the read-only `readRuntimePayloadProfiles` target for `runtime_payload_profiles` / `aitp_v5_get_runtime_payload_profiles` / `aitp-v5 adapter payload-profiles`. Hakimi now parses that catalog as a typed AITP-owned read surface, including `catalog_version`, `profile_index`, `capture_policy`, `host_usage_policy`, and no-trust result semantics, and can read it through MCP-first transport with CLI fallback. `ResearchAction.inspect_aitp_runtime_payload_profiles` exposes the parsed catalog to the model for payload construction and bridge diagnostics only; it remains host payload-profile metadata, not validation, evidence, or claim-trust authority.
- The same AITP-owned bridge now exposes curated heuristic RAG: `readCuratedRagCorpus` maps to `curated_rag_corpus` / `aitp_v5_get_curated_rag_corpus` / `aitp-v5 adapter curated-rag-corpus`, `searchCuratedRagCorpus` maps to `curated_rag_search_result` / `aitp_v5_search_curated_rag_corpus` / `aitp-v5 adapter curated-rag-search <query>`, `draftCuratedRagPromotion` maps to `curated_rag_promotion_draft` / `aitp_v5_draft_curated_rag_promotion` / `aitp-v5 adapter curated-rag-promotion-draft <chunk-id>`, and `ingestCuratedRagCorpus` maps to `curated_rag_ingest_result` / `aitp_v5_ingest_curated_rag_corpus` / `aitp-v5 curated-rag ingest <args>`. Hakimi passes the current Agent cwd as AITP `base`, so reads can use `.aitp/curated_rag/corpus.json` plus derived `lexical_file_backed` index diagnostics, and ingestion can ask AITP to create or refresh the corpus manifest and lexical index from local text/Markdown/TeX/RST and optional PDF sources. Hakimi parses catalog, retrieval, promotion draft, and ingestion results as `heuristic_context`, rejects tampered validation/trust/final-gate semantics, and exposes `ResearchAction.inspect_aitp_curated_rag_corpus`, `ResearchAction.search_aitp_curated_rag_corpus`, `ResearchAction.draft_aitp_curated_rag_promotion`, plus the `execute_aitp_write_bridge` operation `ingestCuratedRagCorpus`. Retrieved chunks, drafts, and ingestion refs can scaffold concepts, methods, literature orientation, and source-backtrace suggestions, but they are not evidence, validation, final-gate satisfaction, or claim-trust authority unless promoted through normal AITP source/evidence/validation records.
- Hakimi now also detects curated-RAG-helpful turns automatically. Conceptual explanation, literature orientation, derivation scaffolding, method-selection, and source-backtrace prompts trigger a small AITP-owned `searchCuratedRagCorpus` call during WorkFrame context preparation. The bounded results are compiled into `ResearchContextPack.curatedRag`, the injected WorkFrame reminder, compaction snapshots, and ContextPack XML as `heuristic_context` / `orientation_only`, with chunk ids, document ids, hashes, summaries, and the same promotion boundary. Ordinary implementation/action prompts do not call the RAG provider, and automatic RAG never records Hakimi evidence or satisfies final-gate/trust requirements.
- When a curated RAG turn is specifically about source backtrace, source support, or whether a retrieved chunk should become claim support, Hakimi now derives `ResearchAction.draft_aitp_curated_rag_promotion` bindings directly from `ResearchContextPack.curatedRag.results`. Each binding carries the chunk/document/hash ids plus active topic/claim scope into the WorkFrame reminder and ContextPack XML, but it is still only a read-only draft request. The model or user must explicitly choose that draft action, and any later AITP source/evidence/validation write remains a separate explicit bridge operation.
- `ResearchAction.run_benchmark_adapter` now follows AITP's `benchmark_adapter_run_to_tool_run` runtime payload profile: when a configured AITP write bridge and scoped topic/claim are present, the benchmark adapter outcome is also recorded through `recordToolRun` as `aitp:tool_run:<id>` provenance and merged into the same benchmark action evidence refs. `ResearchAction.capture_primitive_tool_run` now follows AITP's `primitive_tool_lifecycle_to_tool_run` profile for explicit one-call primitive tool capture by `primitive_tool_call_id`. These captures/builders never call `recordValidationResult`, never update claim trust, and report skipped/failed capture instead of inventing provenance when bridge or AITP scope is missing.
- Hakimi sessions now auto-configure a narrow MCP-first AITP bridge for `aitp_v5_get_process_graph_slice`, `aitp-v5 graph slice`, `aitp-v5 curated-rag ingest`, `aitp-v5 evidence record`, `aitp-v5 tool run record`, `aitp-v5 tool run capture-auto`, `aitp-v5 reference location record`, `aitp-v5 exploration record`, `aitp-v5 route record`, `aitp-v5 asset register`, `aitp-v5 asset capture-auto`, `aitp-v5 code state auto`, `aitp-v5 research-state attach-artifact`, `aitp-v5 research-state attach-artifact-auto`, `aitp-v5 checkpoint request`, `aitp-v5 trust preflight`, `aitp-v5 source reconstruction-review-result`, `aitp-v5 research-state create-proof-obligation`, and AITP validation contract/result records. The bridge resolves `base` / `--base` from the current Agent cwd at call time, fetches an AITP slice before research-context injection only when a WorkFrame carries explicit `aitp:session:<id>` scope, executes only a configured AITP command or MCP tool with structured args, and keeps `.aitp` as the canonical record store.
- `ResearchAction.execute_aitp_write_bridge` can now execute a configured AITP write bridge for curated RAG corpus ingestion, evidence records, tool-run provenance, local tool-run transcript/result auto-capture, reference locations, exploratory records, source asset registration, local source asset auto-capture, auto-captured git code state, local artifact auto-attach, proof obligations, validation contracts, validation results, source-reconstruction review results, human-checkpoint requests, and non-mutating trust preflight. Successful writes or preflights are recorded as scoped `research_action.result_recorded` events with AITP evidence refs, and the model-facing XML result includes the canonical AITP runtime target instead of becoming a hidden side effect.
- A native bridge smoke now verifies the QG/MIPT-shaped loop from fake AITP `process_graph_slice` to Hakimi `ContextPack` action bindings, `writeBridge` metadata, and constrained AITP CLI write-back for proof obligations, source-reconstruction evidence, and human checkpoints. This proves the local runtime contract without requiring Python/AITP dependencies during Hakimi unit tests.
- Research actions can run in-process graph queries, benchmark adapters, formalization blueprint exports, and external job receipt normalization.
- Literature search, code patch preparation, and external benchmark workflows are orchestrated through native Kimi tools rather than being executed inside `ResearchAction` itself.
- Evidence can be written to the research ledger, reread only inside matching WorkFrame scope, compiled into graph candidates, and checked by harness/final-gate logic.
- Full context compaction is now research-aware: when WorkFrames are open, Hakimi injects and stores a runtime-generated `Hakimi Research State` block with the initial research question, domain/topic, ContextPack/domain pack, physics memory ids, evidence refs, action attempts/outcomes, raw primitive-tool escapes, open obligations, and next steps. Separate WorkFrames stay separated in the compacted summary.

## Architecture Layers

Hakimi is organized around six research-runtime layers.

| Layer | Role |
| --- | --- |
| Skills | Procedural memory: how the agent should work, such as derivation checks, formula-to-code debugging, and LibRPA run preparation. |
| Physics memory capsules | Semantic memory: claims with scope, assumptions, provenance, dependency edges, reliability state, and expansion handles. |
| Research ledger | Source-backed events from real sessions before they are trusted as reusable memory. |
| Compiler and graph | A knowledge compiler that preserves dependencies, contradiction markers, validation status, and failure conditions. |
| Research actions | Auditable work units such as convention checks, graph expansion, formula-code mapping, benchmark validation, and harness generation. |
| AITP native adapter | A boundary layer that consumes AITP typed process graph slices as canonical local research-process context, then compiles them into Hakimi turn-local reminders and action recommendations. |

`WorkFrame` is the live research problem state tying these layers together. It tracks the active domain, topic, goal, assumptions, conventions, context pack, evidence, obligations, and final-gate status. Blocking obligations prevent a result from being treated as validated memory.

This matters most when the conversation is compacted. Ordinary chat history can be shortened, but the runtime state for each open WorkFrame is rendered into the compaction request and then appended deterministically to the stored compaction summary. For real research topics, open a WorkFrame early; that makes the initial question, physics memory, current derivation/code progress, failed attempts, and next obligations recoverable after automatic compaction and session replay.

## AITP Boundary

The long-term architecture treats `.aitp` as the host-agnostic canonical typed
research graph and source-asset store. Hakimi should be its most native reader,
not a second authority that reimplements the same research ledger schema.

The first adapter slices are now implemented at the library/context/runtime
boundary:
Hakimi accepts an AITP `process_graph_slice`, normalizes current v5 field names,
preserves the orientation-only boundary, and compiles it into ContextPack lines,
diagnostics, source-asset reminders, native `ResearchActionBinding`
recommendations, explicit write-bridge hints for durable AITP records, and
structured `callObligations` derived from AITP `moment_policy.decisions`.
Those obligations distinguish current-turn required calls from calls that must
happen before any trust-changing step, while keeping the canonical policy and
entrypoint names in AITP. When AITP provides orientation-only `payload_hints`,
Hakimi projects them into `writeBridge.payloadDraft` and
`writeBridge.payloadDraftSchema` so the model sees the local fields needed for
the next typed write plus the placeholder fields the host must resolve without
turning that draft into Hakimi truth. Lifecycle trigger fields from AITP policy
are projected the same way:
they annotate `ResearchActionBinding.params` and `callObligations` with
pre-turn/pre-action/pre-final timing reasons, but they remain policy guidance
from AITP and do not cause Hakimi to record anything automatically. Theory
reasoning fields are also projected as `params.theoryReasoning`: they preserve
local questions, relation paths, backtrace targets, and original-question guards
for the current WorkFrame prompt without becoming Hakimi canonical memory. The
same normalized projection is rendered into the injected WorkFrame reminder and
the model-facing ContextPack XML so it is visible at the moment the local
brainstorm/backtrace action is chosen, rather than remaining hidden inside raw
params JSON. AITP `route_state` is projected through the same boundary:
Hakimi reads `active_route_id`, `routes`, `live_route_ids`,
`blocked_route_ids`, `abandoned_route_ids`, and
`pivot_required_route_ids`, normalizes route refs as `research_route:<id>`,
and surfaces route-choice, failed-route-lesson, and route-switch-checkpoint
moments. Those route moments are not evidence and do not update claim trust;
ordinary route guidance remains non-blocking unless AITP marks a final/trust
prerequisite explicitly. AITP `provenance_gaps[]` are projected through the
same boundary as source/code/tool/artifact capture hints: Hakimi summarizes the
gap ids, renders source/code/artifact reminders, and recommends capture actions
such as `aitp.capture_source_asset_auto`, `aitp.register_source_asset`,
`aitp.capture_code_state_auto`, `aitp.capture_tool_run_auto`,
`aitp.record_tool_run`, `aitp.create_validation_contract`,
`aitp.record_validation_result`, `aitp.attach_artifact_auto`, and
`aitp.attach_artifact`. When a gap carries
AITP-owned `payload_hints[]`, Hakimi projects the matching hint into
`writeBridge.payloadDraft` and `writeBridge.payloadDraftSchema` for
`captureSourceAssetAuto`, `captureToolRunAuto`, `captureCodeStateAuto`,
`attachArtifactAuto`, `recordToolRun`, `createValidationContract`,
`recordValidationResult`, `attachArtifact`, `registerSourceAsset`, or
`recordReferenceLocation`. Those drafts and schemas are execution orientation
for the model and still require real local provenance before the AITP bridge is
called. `aitp.attach_artifact_auto` now carries an
`attachArtifactAuto` write bridge for
`aitp-v5 research-state attach-artifact-auto`, so benchmark logs, validation
outputs, patches, plots, JSON results, or generated files can be sent to AITP
for hash/size/mtime/MIME-ish capture without Hakimi hand-filling file metadata.
`aitp.attach_artifact` keeps the manual `attachArtifact` bridge for
`aitp-v5 research-state attach-artifact`, so benchmark logs, validation outputs,
patches, plots, JSON results, and generated files can be attached by reference
before reuse. These gaps are not Hakimi truth and do not block the final gate by
default; they become strict only when AITP marks a final/trust prerequisite
explicitly. AITP owns source asset identity, hashes, version anchors, duplicate
diagnostics, reference locations, and raw asset provenance; Hakimi reads
`source_asset_index[]` into bounded `sourceAssets` summaries and model-visible
ContextPack fields for indexed asset ids, missing hashes, and duplicate hashes.
When AITP recommends `aitp_v5_capture_source_asset_auto`, Hakimi exposes it as
`captureSourceAssetAuto` so a local source file path can be handed to AITP for
hash, size, mtime, inferred asset type, and version metadata capture; the
resulting `source_asset_record` is still provenance only, not evidence or trust
authority.
That projection is a reminder to capture or repair provenance before reuse, not
a `.hakimi` source store or claim-trust update. AITP `source_stack_coverage`
is projected next to that source/provenance context: Hakimi parses the scoped
coverage manifest, summarizes claim ids with missing required outputs,
incomplete source reconstruction, or review gaps, renders AITP next actions in
WorkFrame reminders and ContextPack XML, and keeps it orientation-only. Coverage
gaps do not become Hakimi final-gate blockers unless AITP also marks an
explicit final/trust prerequisite. AITP `source_reconstruction_review` is
projected as the adjacent review worklist: Hakimi parses pending,
needs-revision, inconclusive, and passed review state, surfaces review-packet
claim ids plus AITP next actions, and keeps review guidance separate from
claim-trust authority. AITP trust-boundary policy decisions are also projected
as `aitp.run_trust_preflight` action bindings with a `preflightTrustUpdate`
write bridge for `aitp-v5 trust preflight`. The returned
`aitp:trust_preflight:<token>` ref is WorkFrame-scoped policy evidence only:
it can satisfy the preflight call obligation, but it is not `trust apply` and
does not mutate claim trust. Those write/preflight bindings now include
AITP runtime target metadata compatible with
`runtime_bridge_target_manifest`: `entrypointKey`, `mcpTool`, `cliFallback`,
surface, preferred/fallback transport, state effect, and
`claimTrustMutation="none"`. Hakimi renders that target into ContextPack action
params and `ResearchAction.execute_aitp_write_bridge` results so the model can
see the MCP-first target. Hakimi also reads AITP's read-only
`readRuntimePayloadProfiles` bridge target for the `runtime_payload_profiles`
catalog, so hosts can discover profile metadata through the same MCP-first
target table without treating it as evidence, validation, or trust authority.
The parser checks AITP's `catalog_version`, `profile_count`, `profile_index`,
`capture_policy`, `host_usage_policy`, and no-trust result semantics; tampered
trust, validation, forbidden-use, or bulk-auto-capture flags fail parsing
instead of becoming runtime guidance. `ResearchAction.inspect_aitp_runtime_payload_profiles`
is a model-facing read-only diagnostic action over that provider: it renders
catalog version, profile index, allowed/forbidden host uses, no-trust flags,
capture modes, and benchmark/primitive profile bindings without writing AITP
records or recording Hakimi evidence. The dynamic reader calls
`aitp_v5_get_runtime_payload_profiles` with no scope args and falls back to
`aitp-v5 adapter payload-profiles` if MCP is unavailable. The catalog now
carries AITP-owned `capture_policy` metadata: benchmark adapter runs are
controlled-auto inside `run_benchmark_adapter`, while primitive tool lifecycle
capture is explicit-request only. Hakimi therefore exposes
`ResearchAction.capture_primitive_tool_run` for a single recent
`primitive_tool_call_id`, builds the `primitive_tool_lifecycle_to_tool_run`
payload from the stored lifecycle envelope, and writes `recordToolRun` only
when a configured bridge plus scoped topic/claim are present. It does not
auto-write every native tool call into AITP, and it reports skipped/failed
capture instead of inventing provenance.

Hakimi now also reads AITP's curated heuristic RAG surfaces through the same
session bridge. `ResearchAction.inspect_aitp_curated_rag_corpus` renders the
AITP-owned corpus catalog, allowed/forbidden uses, document/chunk ids, index
policy, and no-trust flags. `ResearchAction.search_aitp_curated_rag_corpus`
accepts `rag_query` and optional `rag_limit`, calls
`aitp_v5_search_curated_rag_corpus` first when MCP is available, and falls back
to `aitp-v5 --base <cwd> adapter curated-rag-search`. Both MCP and CLI paths pass
the current Agent cwd as AITP `base`, so AITP can prefer a real
`.aitp/curated_rag/corpus.json` manifest over the fixture and return
`lexical_file_backed` stale-index diagnostics. The rendered XML labels every
result as `heuristic_context` / orientation-only and includes the promotion boundary:
claim-relevant passages must become normal AITP `source_asset`,
`reference_location`, evidence, validation, and trust-preflight records before
they can support a trust-changing conclusion. The action is read-only and does
not record Hakimi evidence.

`ResearchAction.draft_aitp_curated_rag_promotion` is the explicit escalation
step for one retrieved `rag_chunk_id`. It calls AITP's
`draftCuratedRagPromotion` read target through MCP first and falls back to
`aitp-v5 --base <cwd> adapter curated-rag-promotion-draft <chunk-id>`. The
returned XML shows the chunk/document ids, hashes, missing topic/claim context,
forbidden uses, and draft-only operations for `registerSourceAsset`,
`recordReferenceLocation`, `recordEvidence`, `createValidationContract`, and
`preflightTrustUpdate`. Hakimi renders this as a construction sheet only:
`draft_creates_records="false"` and every operation has
`creates_record_now="false"`. The action can now be called by
`action_binding_id` from a loaded ContextPack, so the model does not have to
copy chunk/topic/claim fields out of XML by hand. Its output also includes a
`promotion_decision_tree` that maps each draft-only stage to the existing
`execute_aitp_write_bridge` operation that would be used next, while marking
`selected_write_executed="false"` and requiring a separate explicit write or
preflight choice.
`ResearchAction.draft_aitp_curated_rag_write_bridge_call` can then select one
stage or operation from that tree and return a prefilled
`execute_aitp_write_bridge` tool-call JSON draft with placeholder diagnostics.
It still executes no write, records no evidence, and marks
`executes_write_now="false"` / `selected_write_executed="false"` so real source
review, missing typed refs, and AITP `session_id` or record ids must be resolved
before the normal write/preflight action is called.
The same draft action can accept `promotion_reviewed_overrides` to compare
AITP's original `payload_draft` / `payload_template` against a proposed
reviewed payload. Hakimi renders `original_payload_json`,
`reviewed_overrides_json`, and `reviewed_payload_json` plus override
diagnostics, but the overrides only affect the returned draft and still require
a separate explicit `execute_aitp_write_bridge` call.
The returned XML also includes a host-side `confirmation_preflight` summary
that classifies remaining diagnostics as hard-blocking, confirmation-required,
or advisory. This is not an AITP trust preflight and it does not validate the
chunk; it only tells the model/user whether a reviewed call draft still has
blocking placeholders or can proceed to a separate explicit AITP write/preflight
call after confirmation.
The same result now includes an explicit
`execute_aitp_write_bridge_handoff` artifact with a deterministic
`handoff_id`, `confirmation_id`, short `sha256` diagnostic hash, the exact
`tool_call_json`, and `non_execution_provenance_json`. This makes the reviewed
call draft easy to hand to `ResearchAction.execute_aitp_write_bridge`, but the
artifact itself is still `handoff_executed="false"` and
`executes_write_now="false"`; it records no evidence, validation result, final
gate satisfaction, or claim-trust mutation.
When that separate execute action is invoked, the caller may pass the handoff
as `aitp_handoff` alongside the explicit top-level `aitp_operation` and
`aitp_payload`. Hakimi then re-checks that the handoff is not blocked, the
embedded tool call matches the explicit operation/payload, and the diagnostic
hash matches `hash_input_json` before it calls the normal AITP write bridge.
Tampered or blocked handoffs fail before bridge execution; direct explicit
write-bridge calls without a handoff still use the ordinary typed path.
When a handoff is supplied, `execute_aitp_write_bridge` now emits a compact
`handoff_execution_precheck` before the guard/result details. Passed prechecks
show `bridge_call_allowed="true"` and `bridge_called="true"` after the guard
has matched; failed prechecks show the guard `code`, `path`, `next_step`,
`bridge_called="false"`, and `handoff_mutated_now="false"` before the existing
failure XML.
The guard coverage now also pins fail-closed behavior for missing
`tool_call_json`, missing `hash_input_json`, payload tampering, diagnostic-hash
tampering, and hash-input/tool-call mismatch. The AITP write-bridge executor
operation list is kept explicit and still excludes `trustApply`, so the
handoff lane cannot silently widen the canonical write surface.
Guard failures now render a structured `handoff_guard_failure` XML element with
stable `code`, `field`, and `path` attributes plus `bridge_called="false"`, so
the model can repair the handoff without mistaking the failed check for a write
attempt.
Those failures also include a `remediation_summary` with a stable `next_step`
and `repair_target`, for example to copy a missing handoff field, align
explicit execute args with the handoff tool call, or redraft/restore hash
input. The summary is advisory only: it requires a fresh explicit execute call
and marks `mutates_handoff_now="false"`.
The remediation mapping is now centralized as a typed guard taxonomy in
ResearchAction rather than scattered string conditionals, so future
handoff-like guards can reuse the same failure-code to repair-step pattern
without expanding the AITP write surface.
The same taxonomy is now named in the model-facing ResearchAction tool
description, so retrying a failed guarded handoff can use the advertised repair
steps while still requiring a separate explicit execute call.
`ResearchAction.list_actions` now also includes a machine-readable
`handoff_guard_remediation_taxonomy` section generated from that same lookup
table. Each failure code maps to one `next_step` and carries
`retry_requires_explicit_execute_call="true"` plus read-only/no-evidence/no-trust
flags, so models can inspect the taxonomy without relying on prose and without
gaining a new write or mutation path.
For narrower retrieval, `ResearchAction.inspect_handoff_guard_remediation_taxonomy`
returns just that taxonomy section, with the same read-only/no-evidence/no-trust
flags and no action-list registry payload.

The WorkFrame orchestrator now also calls that provider automatically for
RAG-helpful turns. It detects prompts asking for conceptual scaffolding,
literature or lecture orientation, derivation background, method choice, or
source backtrace suggestions; runs a small bounded AITP search; and compiles
the result into `ResearchContextPack.curatedRag`, the injected reminder,
compaction state, and ContextPack XML. The injected chunks are deliberately
compact and carry chunk/document/hash ids plus `result_role=heuristic_context`
and `read_surface_effect=orientation_only`; they remain background context
until promoted through the normal AITP source/reference/evidence/validation
path.

When that same context says the retrieved chunk may become claim support,
Hakimi now derives `draft_aitp_curated_rag_promotion` action bindings from the
bounded RAG results. The binding params include `ragChunkId`, `ragDocumentId`,
`ragContentHash`, active AITP topic/claim scope when available, and an
`allowedNextToolCall` for `ResearchAction.draft_aitp_curated_rag_promotion`.
The injected reminder and ContextPack XML show these binding ids next to the
chunks. This is still a suggestion, not execution: it asks AITP for the
read-only promotion draft only after an explicit model/user choice, and any
later source/evidence/validation write remains a separate AITP bridge call.

Hakimi
sessions now create a narrow dynamic bridge by default: the process-graph
provider calls `aitp_v5_get_process_graph_slice` through the configured AITP
MCP server first, then falls back to `aitp-v5 graph slice` with `--base`
resolved from the current Agent cwd when MCP is not connected, does not expose
the target tool, or returns an unparseable result. Write/preflight execution
uses the same MCP-first/fallback policy. The write bridge covers exploratory records, source asset
registration, local source asset auto-capture, artifact attachment, human
checkpoint requests, proof-obligation creation, evidence records, tool-run
provenance, reference locations, auto-captured code state, validation
contract/result records, source reconstruction review result records, and trust
preflight. SDK callers can still provide explicit bridges or disable automatic
AITP bridge wiring for isolated tests and non-AITP deployments.
`run_benchmark_adapter` now has one automatic provenance capture path over that
same bridge: after the in-process adapter returns a `BenchmarkAdapterRunResult`,
Hakimi builds AITP's `benchmark_adapter_run_to_tool_run` payload and calls
`recordToolRun` when the active WorkFrame or action args provide a topic and
claim. The returned `aitp:tool_run:<id>` ref is merged into the benchmark action
trace. If the bridge, topic, or claim is absent, the benchmark action remains
recorded locally and the XML marks the AITP capture as skipped; Hakimi does not
create a validation result or mutate claim trust from the adapter outcome.
For primitive tools, the corresponding path is deliberately explicit rather
than automatic: `ResearchAction.capture_primitive_tool_run` records one recent
lifecycle completion by `primitive_tool_call_id`, stores the resulting
`aitp:tool_run:<id>` as WorkFrame evidence when AITP accepts it, and leaves
missing bridge/scope as a skipped capture.
Ordinary `record_evidence_or_validation` policy decisions prefer
`recordEvidence`, while strict validation remains available through
`recordValidationResult` once a validation contract and tool run exist. Either
typed evidence or a typed validation result can satisfy that AITP disjunctive
call obligation in Hakimi's final gate; neither lets Hakimi update claim trust
without AITP preflight and the required gates. The default scope resolver only reads AITP when the WorkFrame
explicitly carries refs such as `aitp:session:<id>` and `aitp:claim:<id>`, so
Hakimi does not guess which local graph belongs to a research turn.

For the current AITP CLI write surface, the model-facing `ResearchAction` tool
now has an `execute_aitp_write_bridge` action. It accepts only a configured
bridge plus structured payloads for `recordExploratoryRecord`,
`registerSourceAsset`, `captureSourceAssetAuto`, `recordEvidence`, `recordToolRun`,
`recordReferenceLocation`, `captureCodeStateAuto`, `attachArtifact`, `createProofObligation`, `createValidationContract`,
`recordValidationResult`, `recordSourceReconstructionReviewResult`,
`preflightTrustUpdate`, and
`requestHumanCheckpoint`, then records the result as a normal WorkFrame-scoped
research action. Source reconstruction review result writes preserve AITP's
review basis contract and still cannot update claim trust. Trust preflight
records the AITP preflight token and required-actions result without applying
the proposed trust change. If no AITP write bridge is configured, it fails
closed.

The dynamic session bridge is covered by fake-runner unit tests that prove
default Agent wiring, explicit override precedence, the disable switch, and
call-time cwd/base-path resolution. The compatibility smoke in
`packages/agent-core/test/aitp/native-bridge-smoke.test.ts` is intentionally
fake-runner based: it proves Hakimi keeps the AITP boundary executable from
slice consumption through action binding and typed write-back args, but it does
not claim that the local AITP Python CLI, filesystem records, or MCP server were
available in the test environment. `packages/agent-core/test/aitp/real-cli-smoke.e2e.test.ts`
is the opt-in real topic-store lane: set `HAKIMI_AITP_REAL_CLI_SMOKE=1`,
`AITP_V5_REPO=/path/to/AITP-Research-Protocol`, and
`AITP_V5_PYTHON=/path/to/python` to make Hakimi create a real AITP workspace,
read a `process_graph_slice`, write a proof obligation and human checkpoint,
and verify the resulting `.aitp` records. It is skipped in normal unit runs so
Hakimi does not require Python/AITP dependencies just to typecheck.

The remaining runtime work is execution depth, not schema ownership: the turn
loop can fetch a scoped slice, preserve cached AITP context when no fresh slice
is available, expose AITP policy obligations, execute typed
record-write/preflight calls through MCP-first transport with CLI fallback, and
run a soft final-gate check over whether required AITP calls passed, were
equivalently satisfied, or were explicitly blocked. Later slices still need
richer automatic payload drafting, and any
host-facing `trust apply` path remains AITP-owned future work.

## Relationship To Upstream

Hakimi remains close to upstream Kimi Code on purpose. The SDK/OAuth imports stay compatible where useful, while Hakimi uses its own `.hakimi` user/project config roots by default so model, MCP, session, and runtime state do not collide with a separate Kimi Code install. The user-facing product is `Hakimi`, the npm package is `@bhjia-phys/hakimi`, and the primary executable is `hakimi`. Hakimi releases use an independent semver line, currently `0.13.0`, instead of mirroring upstream Kimi Code tags. This is a native fork, not an external wrapper.

Codex and ForgeCode are references rather than dependencies: Codex informs tool exposure, structured tool outputs, and action traces; ForgeCode informs harness and repeatable eval workflows.

## Roadmap

### 0.0.1: Physics Memory Vertical Slice

Build the first runtime-native memory path inside `packages/agent-core`:

- add `physics-memory` types, parser, scanner, registry, compiler, and exports;
- add a model-invocable `PhysicsMemory` builtin tool;
- support `list_domains`, `list_capsules`, `load_capsule`, and `compile_context`;
- keep physics memory parallel to skills rather than embedding it inside skills;
- gate the feature behind an experimental flag;
- prove the shape with a narrow LibRPA fixture set.

The 0.0.1 schema should already reserve fields for graph references, expansion handles, required checks, and action affordances so the later research-action layer has a stable target.

### 0.0.2: Research Ledger And ActionAlgebra

- add a `research-ledger` subsystem that scans `.aitp/research-ledger` and stores source-backed research events separately from trusted physics memory;
- add compile proposals from ledger events into candidate capsules, graph refs, obligations, and harness candidates;
- extend `ResearchActionRegistry` into an ActionAlgebra with phases, preconditions, effects, generated obligations, validators, and primitive tool attribution;
- add `WorkFrame`, `ResearchObligation`, and `ValidationScheduler` foundations;
- expose `ResearchLedger` and `ResearchAction` model tools behind experimental flags;
- coordinate Kimi primitive tools, Codex-style lifecycle ideas, and ForgeCode-style harness boundaries without replacing Kimi's tool manager.

### 0.0.3: Thin Base Runtime Spine

Add the smallest Codex-inspired reliability layer needed for AITP capture:

- primitive tool lifecycle envelopes;
- action/workframe attribution for tool calls;
- result status and artifact refs;
- diff/output capture boundaries;
- interruption/background awareness where needed.

This slice should not port Codex or rewrite Kimi's tool manager.

### 0.0.4: LedgerWriter And Controlled Capture

- add schema-checked `ResearchLedger.write_event`;
- write deterministic `.aitp/research-ledger/<topic>/events/*.md` files;
- capture only high-value source, git diff, benchmark, and failure observations at first;
- keep long outputs as artifact refs instead of ledger noise.

### 0.0.5: WorkFrame And ResearchAction Call Trace

- make WorkFrame an active session context;
- support opening, switching, listing, and closing WorkFrames;
- connect ResearchAction calls to primitive tool calls and ledger events;
- generate obligations from action effects;
- preserve domain isolation across simultaneous research frames.

### 0.0.6: LibRPA Micro Vertical Slice

Prove the runtime spine on a narrow computational-physics workflow:

```text
formula capsule
-> code mapping
-> git diff / implementation trace
-> smoke benchmark
-> intermediate observable check
-> failure mode or validated memory update
-> harness regression case
```

### 0.0.7: Capsule Boundary Compiler

- compile locally self-consistent derivation/code blocks into candidate capsules;
- keep micro reasoning lightweight;
- use capsule boundaries only when local blocks connect to memory, graph, final answers, or other blocks.

### 0.0.8: PhysicsDirectionEngine And Lenses

- add applicability-gated physics lenses rather than keyword triggers;
- start with `topological-order/fqhe-cs` and `librpa/head-wing` domain packs;
- include a charge-flux quantization lens that distinguishes external electromagnetic flux, emergent Chern-Simons flux, and quasiparticle AB flux periods.

### 0.0.9: EscalationPolicy And Final Gate

- keep simple questions light;
- escalate code edits, benchmark work, promotion, and high-risk theory claims;
- prevent final answers from claiming validated status while blocking obligations remain open.

### 0.1: Harness And Eval Runner

- convert failed or inconclusive action traces into reviewable harness candidates;
- promote confirmed candidates into deterministic eval cases;
- add end-to-end evals for FQHE/CS reasoning and LibRPA head-wing workflows.

### 0.2: FQHE/CS Theory Vertical Slice

Close the first formal-theory loop with capsules, derivation blocks, physics lenses, convention checks, and final-answer status around Laughlin wavefunctions, flux insertion, charge-flux quantization, Chern-Simons effective theory, and K-matrix response.

## Current Status

- Upstream parity with `MoonshotAI/kimi-code:main` was refreshed on 2026-06-03 and merged through commit `6a22523` (`fix: simplify goal budget schema and fix output caps (#365)`), preserving the AITP runtime integrations.
- `hakimi --version` now follows Hakimi's own CLI/package release line. The current local package version is `0.13.0`; upstream Kimi Code release numbers are treated as sync points, not Hakimi release numbers.
- The AITP Agent 0.0.1 physics-memory vertical slice is implemented and now starts enabled in Hakimi unless `KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY=0` is set.
- `packages/agent-core` now includes physics-memory types, parser, scanner, registry, compiler, session scanning, append-only records, a model-invocable `PhysicsMemory` builtin tool, LibRPA fixture capsules, and a foundational `ResearchActionRegistry`.
- Windows baseline failures in the broader `agent-core` suite have been resolved; see [AITP Agent 0.0.1 Audit](docs/internal/aitp-agent-0.0.1-audit.md).
- The 0.0.2 foundation is implemented: `research-ledger` types/parser/scanner/registry/compiler, session scanning, append-only records, `ResearchLedger` tool, ActionAlgebra types, default research actions, scheduler, `ResearchAction` tool, raw-tool escape records, and harness candidate conversion. See [AITP Agent 0.0.2 Audit](docs/internal/aitp-agent-0.0.2-audit.md).
- 0.0.3 has started with the thin primitive tool lifecycle spine: real loop-level tool calls now emit `tool_lifecycle.started` and `tool_lifecycle.completed` records with status, bounded summaries, timing, cwd, and future WorkFrame/ResearchAction attribution slots. See [AITP Agent 0.0.3 Audit](docs/internal/aitp-agent-0.0.3-audit.md).
- 0.0.4 has started with schema-checked `ResearchLedger.write_event` and controlled `capture_event`: compact source-backed events can be written to deterministic `.aitp/research-ledger/<topic>/events/*.md` paths, registered immediately, audited through `research_ledger.event_written`, and filtered through source/git-diff/benchmark/failure capture policy. See [AITP Agent 0.0.4 Audit](docs/internal/aitp-agent-0.0.4-audit.md).
- 0.0.5 has started with active WorkFrame runtime state and ResearchAction call trace: `ResearchAction` can open/switch/list/close WorkFrames, start/finish action calls, replay both, attach ledger event ids to action results, and primitive tool lifecycle records now carry active `workFrameId` and `actionCallId`. See [AITP Agent 0.0.5 Audit](docs/internal/aitp-agent-0.0.5-audit.md).
- 0.0.6 has started with a LibRPA head-wing micro vertical slice: universal code/benchmark actions bound to LibRPA workflow intent, a CI-safe head-wing smoke benchmark stand-in, scheduler expectations, controlled failure capture, and harness candidate conversion. See [AITP Agent 0.0.6 Audit](docs/internal/aitp-agent-0.0.6-audit.md).
- 0.0.7 has started with a capsule boundary compiler: locally self-contained `ResearchBlock` objects can compile into unpromoted `PhysicsCapsule` candidates with assumptions, conventions, source refs, open questions, and required checks preserved. See [AITP Agent 0.0.7 Audit](docs/internal/aitp-agent-0.0.7-audit.md).
- 0.0.8 has started with PhysicsDirectionEngine and applicability-gated lenses: FQHE/CS charge-flux quantization and LibRPA head-wing formula-code mapping can now be recommended, rejected, and audited with caveats, guiding questions, required checks, and structured ResearchAction bindings. See [AITP Agent 0.0.8 Audit](docs/internal/aitp-agent-0.0.8-audit.md).
- 0.0.9 has started with EscalationPolicy and Final Gate: simple physics questions remain lightweight, code/benchmark/high-risk theory/promotion work escalates into required runtime controls, and validated final claims are downgraded or blocked while blocking obligations remain open. See [AITP Agent 0.0.9 Audit](docs/internal/aitp-agent-0.0.9-audit.md).
- 0.1 has started with Harness and Eval Runner: failed/inconclusive action traces can become deterministic eval cases, and eval runs can check action sequence, action outcomes, evidence refs, and required checks. See [AITP Agent 0.1 Audit](docs/internal/aitp-agent-0.1-audit.md).
- 0.2 has started with an executable FQHE/CS theory vertical slice: Laughlin wavefunction, flux insertion, Abelian CS action, and K-matrix response blocks compile into candidate capsules, pass through charge-flux lens/convention checks, produce an eval case, and reach the final gate. See [AITP Agent 0.2 Audit](docs/internal/aitp-agent-0.2-audit.md).
- 0.2.1 upstream sync guardrail has configured a local `upstream` remote for Kimi Code; fetch/merge is pending because GitHub HTTPS access failed in this environment. See [Upstream Sync 2026-06-02](docs/internal/upstream-sync-2026-06-02.md).
- 0.2.2 has refactored research actions toward universal ids plus structured `ResearchActionBinding`: FQHE/CS charge-flux checks now bind `validate.check_convention` with a charge-flux `checkId`, and LibRPA head-wing benchmark work now binds `benchmark.run_minimal_case` with a LibRPA adapter id. See [AITP Agent 0.2.2 Audit](docs/internal/aitp-agent-0.2.2-audit.md).
- 0.2.3 has added file-backed `DomainProfile` and `WorkflowRecipe` registries behind `KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE` and `KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE`, scanning `.aitp/domain-profiles` and `.aitp/workflow-recipes` into `agent.domainProfiles` and `agent.workflowRecipes`. See [AITP Agent 0.2.3 Audit](docs/internal/aitp-agent-0.2.3-audit.md).
- 0.2.5 has added the first WorkFrame ContextPack orchestrator: active WorkFrames can compile bounded `ResearchContextPack` summaries from DomainProfile, WorkflowRecipe, PhysicsMemory, ResearchLedger, and action bindings, then attach the pack id back to the WorkFrame for replay and audit. See [AITP Agent 0.2.5 Audit](docs/internal/aitp-agent-0.2.5-audit.md).
- 0.2.6 has started closing the turn loop: prompt-sensitive WorkFrame reuse/switching now runs inside the injection cycle, bounded `ResearchContextPack` summaries can be recompiled for the inferred active frame, and a compact AITP research-context reminder can enter the model-facing context before a research step. See [AITP Agent 0.2.6 Audit](docs/internal/aitp-agent-0.2.6-audit.md).
- 0.2.7 has started dynamic tool exposure: once a research turn has a bounded `ResearchContextPack`, the runtime can apply a temporary managed-tool overlay so theory-oriented turns keep semantic research tools visible while code-oriented turns can additionally expose `Bash` / `Write` / `Edit`. See [AITP Agent 0.2.7 Audit](docs/internal/aitp-agent-0.2.7-audit.md).
- 0.2.8 has started controlled auto-capture from real work: `tool_lifecycle.completed` can now classify real tool outcomes against the active `WorkFrame`, write compact git-diff / benchmark / failure / source-excerpt evidence into `.aitp/research-ledger`, and record explicit skip reasons for low-value tool noise. See [AITP Agent 0.2.8 Audit](docs/internal/aitp-agent-0.2.8-audit.md).
- 0.2.9 has started graph-aware memory compilation: ledger events can now compile into typed graph candidates with provenance checks, dependency diagnostics, assumption traces, and contradiction warnings for incompatible conventions. These outputs remain candidate-level rather than silently becoming canonical memory. See [AITP Agent 0.2.9 Audit](docs/internal/aitp-agent-0.2.9-audit.md).
- 0.3.0 has started the promotion pipeline and trust-ladder gate: graph candidates can now be promoted only through an explicit `PhysicsPromotionPacket` with source refs, scope, validation refs, and formalization checkpoint requirements enforced. Promoted capsules keep trust metadata instead of discarding the promotion path. See [AITP Agent 0.3.0 Audit](docs/internal/aitp-agent-0.3.0-audit.md).
- 0.3.1 has started final-gate lifecycle integration: when a research turn tries to end while the active `WorkFrame` still fails the final gate, the runtime now injects one concise final-gate continuation message and forces one more model step so the answer can downgrade itself instead of quietly overclaiming completion. See [AITP Agent 0.3.1 Audit](docs/internal/aitp-agent-0.3.1-audit.md).
- 0.4.0 has started Harness V2: file-backed research eval cases under `.aitp/evals` can now parse into `ResearchEvalCase`, load through `agent.researchHarness` by default in Hakimi, check action bindings/evidence/final status/forbidden claims, and write failed or inconclusive harness candidates back as deterministic eval files. This slice also scopes final-gate evidence to the active WorkFrame so unrelated prior evidence cannot satisfy validated status. See [AITP Agent 0.4.0 Audit](docs/internal/aitp-agent-0.4.0-audit.md).
- 0.5.0 has started the real LibRPA file-backed vertical: `adapter.librpa.head-wing-smoke` is now a first-class benchmark adapter contract, and the repo includes LibRPA `.aitp` domain profile, workflow recipe, physics-memory capsules, and eval fixtures that load through an isolated session and close the context/eval/final-gate loop. See [AITP Agent 0.5.0 Audit](docs/internal/aitp-agent-0.5.0-audit.md).
- 0.6.0 has started the FQHE/CS V2 file-backed theory vertical: Laughlin wavefunction, flux insertion, Abelian CS response, K-matrix response, known-limit checks, and flux-identity failure modes now live in `.aitp` fixtures and pass isolated-session context/eval tests without LibRPA leakage. See [AITP Agent 0.6.0 Audit](docs/internal/aitp-agent-0.6.0-audit.md).
- 0.7.0 has started bridge-gated multi-domain isolation: `Bridge` capsules can now explicitly authorize named cross-domain capsules, default FQHE/LibRPA context packs stay separate, and `bridgePolicy: deny` records cross-domain denial diagnostics. See [AITP Agent 0.7.0 Audit](docs/internal/aitp-agent-0.7.0-audit.md).
- 0.8.0 has started the graph kernel and query semantics lane: `physics-graph` can build a graph from physics memory, expand neighborhoods and dependency closure, run bridge-policy-aware path search, and query contradiction edges. See [AITP Agent 0.8.0 Audit](docs/internal/aitp-agent-0.8.0-audit.md).
- 0.9.0 has started the formalization bridge: `formalization` can identify definitions, assumptions, formulas, lemmas, and theorem-like graph nodes as conservative formalization contracts and export a blueprint-like dependency graph without claiming proof-assistant verification. See [AITP Agent 0.9.0 Audit](docs/internal/aitp-agent-0.9.0-audit.md).
- 0.10.0 has started closing the executor gap: `ResearchAction` can now run registered in-process benchmark adapters, physics-graph queries, and formalization-blueprint exports directly through the model-facing tool while preserving primitive shell/git/web attribution boundaries. Harness eval writeback can also namespace candidate eval files by session id so parallel sessions do not collide on the same failure trace. See [AITP Agent 0.10.0 Audit](docs/internal/aitp-agent-0.10.0-audit.md).
- 0.11.0 has started primitive tool plan templates and live native-tool orchestration: every default `ResearchAction` can now render an auditable native-tool plan, with first-class actions for literature search, scoped patch preparation, and external benchmark job submission. Runtime tool exposure now reads action bindings, activates the native Kimi tools required by those templates through a turn-scoped Kimi tool builder, and replays topic-scoped overlays/evidence attribution without cross-session leakage while `ResearchAction` still does not execute shell, git, web, MCP, or HPC work itself. The live turn coverage now exercises source search, code patching, and external job submission through native `WebSearch`/`FetchURL`, `Read`/`Edit`, `Bash`, and `ResearchLedger.capture_event` call attribution, writes durable source/code/job event files, emits `research_ledger.event_written`, and feeds `ledger:event...` ids back into `ResearchAction.finish_action_call.evidence_refs`. See [AITP Agent 0.11.0 Audit](docs/internal/aitp-agent-0.11.0-audit.md).
- 0.11.1 has added the first external job submission adapter contract: `adapter.external.job-submission` normalizes scheduler/MCP/HPC/manual job receipts into `BenchmarkAdapterRunResult` for `benchmark.submit_external_job` without executing the scheduler inside `ResearchAction`. Primitive plans now include an adapter-normalization step after native submission and before ledger/action recording. See [AITP Agent 0.11.1 Audit](docs/internal/aitp-agent-0.11.1-audit.md).
- 0.11.2 has added WorkFrame-scoped evidence inspection to `ResearchAction`: the model can list recent evidence refs for the active or explicit frame and load a `ledger:event...` body only when its ledger metadata matches the frame's domain/topic scope. Loading an event records `research_ledger.event_loaded`, and cross-topic/domain loads fail before rendering the body. See [AITP Agent 0.11.2 Audit](docs/internal/aitp-agent-0.11.2-audit.md).
- 0.11.3 has made the external-job receipt lane more native-tool friendly: `adapter.external.job-submission` can now infer job ids from common scheduler outputs such as SLURM, LSF, SGE, and PBS/qsub receipts while refusing arbitrary shell output. This lets native Bash/MCP/remote-runner submissions feed the adapter with `schedulerOutput` alone when the receipt format is clear. See [AITP Agent 0.11.3 Audit](docs/internal/aitp-agent-0.11.3-audit.md).
- 0.12.0 has added a file-backed `DomainPackManifest` runtime summary: `ResearchContextPack` now carries the profile/workflow/memory/eval/action/tool inventory for its domain, context reminders and `ResearchAction` rendering expose that manifest, and runtime tool exposure no longer opens code tools just because the domain is LibRPA. Code-capable tools now come from file-backed workflow `required_tools`, DomainPack action ids, or universal action primitive plans. FQHE/CS and LibRPA fixture tests assert that evals, capsules, and tool exposure remain isolated unless an explicit bridge capsule is present. See [AITP Agent 0.12.0 Audit](docs/internal/aitp-agent-0.12.0-audit.md).
- 0.12.1 has tightened the native research runtime: `ResearchAction.inspect_domain_pack` can inspect the active or explicit ContextPack's DomainPack manifest, raw primitive tools used inside an active WorkFrame without an active `ResearchAction` call now emit `research_action.raw_tool_escape` with `workFrameId` and a suggested follow-up action, and older hardcoded vertical exports are marked compatibility-only in favor of file-backed `.aitp` domain packs.
- The runtime roadmap through 0.12.1 is now implemented as a file-backed, graph-aware, bridge-gated, audited baseline with deterministic research executors for the graph, benchmark, formalization, and external-job receipt lanes plus native-tool orchestration for literature, code, and external benchmark workflows. Topic packs now have manifest-level profile/workflow/memory/eval/action/tool summaries, primitive tool call attribution, durable ledger evidence references, scoped evidence reread from the semantic action layer, conservative native scheduler receipt inference, and WorkFrame-scoped recovery records for raw primitive tool escapes.
- 0.12.2 makes the Hakimi research runtime default-on: `physics-memory`, `research-ledger`, `research-action`, `domain-profile`, `workflow-recipe`, `research-harness`, and `/goal` now start enabled unless explicitly set to `0`. Empty/new theoretical-physics topics get a built-in `theoretical-physics/general` process scaffold with literature search, source capture, derivation, validation, memory/eval, code-mapping, patch, benchmark, and external-job action bindings. Dedicated `.aitp` packs still take priority when present.
- 0.12.3 makes full context compaction research-aware: `FullCompaction` now renders a runtime `Hakimi Research State` snapshot from open WorkFrames, attached ContextPacks, scoped evidence refs, open obligations, recent ResearchAction traces, raw primitive-tool escapes, and recent primitive tool lifecycle records. The same snapshot is appended to the stored compaction summary, so automatic compaction preserves the research question and current progress even if the model's free-form summary omits it.
- Post-0.13.0 development has started the AITP-native bridge layer: `packages/agent-core/src/aitp/cli-bridge.ts` can read AITP process graph slices, write AITP exploratory records, and provide a WorkFrame-scoped slice provider. Compiled slices now flow into `ResearchContextPack`, research-context injection, and runtime action bindings, so WorkFrame reminders can carry AITP obligations, source gaps, relation-path brainstorms, and original-question drift checks in the same model turn.
- The AITP-native bridge now has a focused fake-runner smoke for the core contract: graph slice consumption, moment-policy/action-binding compilation, `writeBridge` hints, proof-obligation write-back, evidence write-back, and human-checkpoint write-back. `ResearchAction.execute_aitp_write_bridge` also gives configured sessions a model-facing execution path for evidence, tool-run, reference-location, exploratory-record, source-asset, local source-asset auto-capture, proof-obligation, validation-contract, validation-result, and human-checkpoint writes. An opt-in real AITP CLI smoke (`HAKIMI_AITP_REAL_CLI_SMOKE=1`) now exercises a real topic store when AITP Python dependencies are installed; richer automatic payload drafting remains the next integration lane.
- The AITP route-state projection now consumes the current v5 route contract (`routes` plus `*_route_ids`) instead of inventing a Hakimi-only `pivot` status. Route refs are normalized to `research_route:<id>`, pivot-required routes appear in ContextPack XML as `<pivot_required_routes>`, and ordinary route moments stay non-blocking unless the AITP moment policy declares an explicit final/trust prerequisite.
- The AITP provenance-gap projection now consumes `provenance_gaps[]` as source/code/tool/validation/artifact capture guidance, renders gap ids into WorkFrame reminders and ContextPack fields, recommends capture actions, and exposes AITP-owned gap `payload_hints[]` as `writeBridge.payloadDraft` values for `captureSourceAssetAuto`, `captureCodeStateAuto`, `recordToolRun`, `createValidationContract`, `recordValidationResult`, `attachArtifact`, source-asset registration, and reference-location repair. Provenance gaps stay non-blocking unless AITP marks them as required before trust can change.
- The AITP source reconstruction review loop now closes through the same write bridge: `source_reconstruction_review.next_actions` can recommend `aitp.record_source_reconstruction_review_result`, and `ResearchAction.execute_aitp_write_bridge` can call `recordSourceReconstructionReviewResult` against `aitp-v5 source reconstruction-review-result` with reviewed components plus typed basis refs. The result is evidence for the WorkFrame, not Hakimi-owned trust authority.
- The first strict AITP trust preflight bridge is now executable: `aitp_v5_preflight_trust_update` policy hints compile to `aitp.run_trust_preflight`, `preflightTrustUpdate`, and `aitp-v5 trust preflight`. Hakimi records `aitp:trust_preflight:<token>` as policy evidence only; `trust apply` and claim-trust mutation remain AITP-owned future boundaries for hosts.
- The AITP bridge target lane is now MCP-first at the contract/projection/execution layer for process-graph reads, writes, and trust preflight: Hakimi carries AITP `runtime_bridge_target_manifest` metadata into `writeBridge` params and `ResearchAction` XML results, including `mcpTool`, `cliFallback`, public surface, MCP invocation args, and `claimTrustMutation="none"`. The configured executor/provider calls the connected AITP MCP tool first and falls back to the CLI bridge when MCP is unavailable or fails.

## Development

Requirements are inherited from Kimi Code:

- Node.js `>=24.15.0`
- pnpm `10.33.0`

Build a local installable CLI package from this fork:

```powershell
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false build
New-Item -ItemType Directory -Force dist-pack
corepack pnpm --config.engine-strict=false -C apps/kimi-code pack --pack-destination ..\..\dist-pack
npm install -g .\dist-pack\bhjia-phys-hakimi-0.13.0.tgz
hakimi --version
hakimi
```

For an isolated install check without touching the global npm prefix:

```powershell
$prefix = "$PWD\.sisyphus\drafts\_scratch\hakimi-install-prefix"
npm install --prefix $prefix .\dist-pack\bhjia-phys-hakimi-0.13.0.tgz
& "$prefix\node_modules\.bin\hakimi.cmd" --version
```

## DeepSeek Quick Setup

If the managed Kimi-for-coding endpoint is unavailable for your account, configure DeepSeek as the native default model:

```powershell
hakimi provider deepseek
hakimi provider list
hakimi
```

`hakimi provider deepseek` prompts for your DeepSeek API key when no key is supplied, then writes a normal OpenAI-compatible provider into `~/.hakimi/config.toml`; it does not create a proxy wrapper. For automation you can still pass `--api-key sk-...` or set `DEEPSEEK_API_KEY`. The default model is `deepseek-v4-pro` at `https://api.deepseek.com`, with `deepseek-v4-flash` available via:

```powershell
hakimi provider deepseek --api-key sk-... --model-id deepseek-v4-flash
```

Pass `--no-thinking` if you want the imported DeepSeek alias to start in non-thinking mode, or `--no-default` if you only want to add the provider without switching the active default model.

When DeepSeek is the active chat model, `WebSearch` no longer depends on a
Kimi OAuth token. Hakimi still prefers the configured Moonshot/Kimi search
service when it is authenticated, but falls back to a no-auth local web search
provider when that service is unavailable.

Hakimi's research runtime starts enabled by default. You do not need to create
domain packs, memory capsules, workflow recipes, or evals before starting a new
topic: open a WorkFrame for the topic and `compile_context_pack`, and Hakimi
will use the built-in `theoretical-physics/general` scaffold until a dedicated
pack exists. New project packs and research-ledger writes use `.hakimi/`
directories such as `.hakimi/research-ledger`, `.hakimi/physics-memory`,
`.hakimi/domain-profiles`, `.hakimi/workflow-recipes`, and `.hakimi/evals`.
Legacy `.aitp/` packs are still scanned read-only for compatibility and can
override the generic fallback for their domain.

When an AITP v5 process graph slice is supplied, Hakimi treats it differently
from legacy pack compatibility: the slice is a canonical AITP-derived
orientation view, so Hakimi compiles it into the current WorkFrame/context and
recommended actions instead of saving it as Hakimi-owned truth. If the slice
contains `moment_policy.decisions`, Hakimi compiles them into
`callObligations`, `AITP required calls now`, and `AITP calls before trust
change` reminders. At the final gate, open required calls downgrade the answer
instead of letting a checked or validated claim silently cross the AITP policy
boundary. Source asset records remain AITP-owned: Hakimi may mention
`source_asset:<id>` in a ContextPack, but it should not recreate the raw asset
store inside `.hakimi`. If the slice carries theory-reasoning handles, Hakimi
now renders them directly into the WorkFrame reminder and ContextPack XML as
local prompt constraints for brainstorming or backtrace; the handles still
belong to AITP's process graph and do not become Hakimi truth.

Explicitly disable individual research features only for debugging or upstream
compatibility checks:

```powershell
$env:KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY = "0"
$env:KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER = "0"
$env:KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION = "0"
$env:KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE = "0"
$env:KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE = "0"
$env:KIMI_CODE_EXPERIMENTAL_RESEARCH_HARNESS = "0"
hakimi
```

```sh
pnpm install
pnpm dev:cli
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Focused verification for the planned 0.0.1 work will be:

```sh
pnpm vitest run packages/agent-core/test/physics-memory packages/agent-core/test/tools/physics-memory-tool.test.ts
pnpm --filter @moonshot-ai/agent-core test
pnpm --filter @moonshot-ai/agent-core typecheck
```

Focused verification for the planned 0.0.2 work will be:

```sh
pnpm vitest run packages/agent-core/test/research-ledger packages/agent-core/test/research-action packages/agent-core/test/tools/research-ledger-tool.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
pnpm --filter @moonshot-ai/agent-core test
pnpm --filter @moonshot-ai/agent-core typecheck
```

Focused verification for the 0.0.3 primitive tool lifecycle work is:

```sh
pnpm vitest run packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/agent/basic.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/agent/tool-lifecycle/index.ts packages/agent-core/src/agent/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/agent/harness/snapshots.ts
```

Focused verification for the 0.0.4 research ledger writer work is:

```sh
pnpm vitest run packages/agent-core/test/research-ledger/writer.test.ts packages/agent-core/test/research-ledger/capture-policy.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts packages/agent-core/test/research-ledger
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-ledger/writer.ts packages/agent-core/src/research-ledger/capture-policy.ts packages/agent-core/src/research-ledger/index.ts packages/agent-core/src/research-ledger/registry.ts packages/agent-core/src/agent/research-ledger/index.ts packages/agent-core/src/tools/builtin/collaboration/research-ledger-tool.ts packages/agent-core/test/research-ledger/writer.test.ts packages/agent-core/test/research-ledger/capture-policy.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts
```

Focused verification for the 0.0.5 WorkFrame runtime work is:

```sh
pnpm vitest run packages/agent-core/test/agent/workframe.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/research-action/harness.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-action/types.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/agent/workframe.test.ts packages/agent-core/test/research-action/harness.test.ts
```

Focused verification for the 0.0.6 LibRPA micro slice is:

```sh
pnpm vitest run packages/agent-core/test/integration/librpa-head-wing.test.ts packages/agent-core/test/research-action/scheduler.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-action/librpa-head-wing.ts packages/agent-core/src/research-action/default-actions.ts packages/agent-core/src/research-action/index.ts packages/agent-core/test/integration/librpa-head-wing.test.ts
```

Focused verification for the 0.0.7 capsule boundary compiler is:

```sh
pnpm vitest run packages/agent-core/test/research-block/compiler.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-block packages/agent-core/src/index.ts packages/agent-core/test/research-block/compiler.test.ts
```

Focused verification for the 0.2.8 controlled auto-capture slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-ledger/auto-capture.test.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/research-ledger/capture-policy.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/agent/research-ledger/auto-capture.ts packages/agent-core/src/agent/research-ledger/index.ts packages/agent-core/src/agent/tool-lifecycle/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/test/research-ledger/auto-capture.test.ts
```

Focused verification for the 0.2.9 graph-aware memory compiler slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-memory/compiler-v2.test.ts packages/agent-core/test/research-block/compiler.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/physics-memory/compiler.ts packages/agent-core/src/physics-memory/graph-types.ts packages/agent-core/src/physics-memory/dependency-checker.ts packages/agent-core/src/physics-memory/contradiction-checker.ts packages/agent-core/src/physics-memory/provenance-checker.ts packages/agent-core/src/physics-memory/index.ts packages/agent-core/test/physics-memory/compiler-v2.test.ts
```

Focused verification for the 0.3.0 promotion pipeline slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-memory/promotion.test.ts packages/agent-core/test/tools/physics-memory-tool.test.ts packages/agent-core/test/physics-memory/compiler-v2.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/physics-memory/types.ts packages/agent-core/src/physics-memory/promotion.ts packages/agent-core/src/tools/builtin/collaboration/physics-memory-tool.ts packages/agent-core/src/tools/builtin/collaboration/physics-memory-tool.md packages/agent-core/src/agent/physics-memory/index.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/test/physics-memory/promotion.test.ts packages/agent-core/test/tools/physics-memory-tool.test.ts
```

Focused verification for the 0.3.1 final-gate lifecycle slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/final-gate-integration.test.ts packages/agent-core/test/research-policy/final-gate.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/research-policy/final-gate.ts packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/test/agent/final-gate-integration.test.ts packages/agent-core/test/research-policy/final-gate.test.ts
```

Focused verification for the 0.4.0 file-backed harness eval slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/final-gate-integration.test.ts packages/agent-core/test/research-harness/runner.test.ts packages/agent-core/test/research-harness/registry.test.ts packages/agent-core/test/research-harness/writer.test.ts packages/agent-core/test/session/research-harness.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/research-harness packages/agent-core/src/research-action/types.ts packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/src/session/index.ts packages/agent-core/src/agent/index.ts packages/agent-core/src/flags/registry.ts packages/agent-core/test/agent/final-gate-integration.test.ts packages/agent-core/test/research-harness/registry.test.ts packages/agent-core/test/research-harness/writer.test.ts packages/agent-core/test/session/research-harness.test.ts
```

Focused verification for the 0.5.0 LibRPA file-backed vertical slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/integration/librpa-head-wing.test.ts packages/agent-core/test/physics-verticals/librpa.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/benchmark-adapter packages/agent-core/src/research-action/librpa-head-wing.ts packages/agent-core/src/index.ts packages/agent-core/test/physics-verticals/librpa.test.ts
```

Focused verification for the 0.6.0 FQHE/CS V2 file-backed vertical slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-verticals/fqhe-cs.test.ts packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-harness/runner.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts
```

Focused verification for the 0.7.0 bridge-gated domain isolation slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-memory/compiler.test.ts packages/agent-core/test/physics-memory/compiler-v2.test.ts packages/agent-core/test/physics-memory/domain-isolation.test.ts packages/agent-core/test/physics-verticals/librpa.test.ts packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts packages/agent-core/test/research-context/compiler.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/physics-memory/bridge.ts packages/agent-core/src/physics-memory/compiler.ts packages/agent-core/src/physics-memory/parser.ts packages/agent-core/src/physics-memory/types.ts packages/agent-core/test/physics-memory/domain-isolation.test.ts
```

Focused verification for the 0.8.0 graph kernel and query semantics slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/physics-graph/query.test.ts packages/agent-core/test/physics-memory/domain-isolation.test.ts packages/agent-core/test/physics-memory/compiler.test.ts packages/agent-core/test/physics-memory/compiler-v2.test.ts packages/agent-core/test/physics-verticals/librpa.test.ts packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/physics-graph packages/agent-core/src/physics-memory/bridge.ts packages/agent-core/src/physics-memory/compiler.ts packages/agent-core/src/physics-memory/parser.ts packages/agent-core/src/physics-memory/types.ts packages/agent-core/test/physics-graph/query.test.ts packages/agent-core/test/physics-memory/domain-isolation.test.ts
```

Focused verification for the 0.9.0 formalization bridge slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/formalization/contracts.test.ts packages/agent-core/test/physics-graph/query.test.ts packages/agent-core/test/physics-memory/domain-isolation.test.ts packages/agent-core/test/physics-memory/promotion.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/formalization packages/agent-core/src/physics-graph packages/agent-core/test/formalization/contracts.test.ts packages/agent-core/test/physics-graph/query.test.ts
```

Focused verification for the 0.10.0 action executor and session write-isolation slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/research-harness/writer.test.ts packages/agent-core/test/research-action/default-actions.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/agent/index.ts packages/agent-core/src/session/index.ts packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/src/research-action/default-actions.ts packages/agent-core/src/research-harness/writer.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/research-harness/writer.test.ts packages/agent-core/test/research-action/default-actions.test.ts
```

Focused verification for the 0.11.0 primitive tool plan template slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/research-action/default-actions.test.ts packages/agent-core/test/research-action/records.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/agent/research-action-orchestration.test.ts packages/agent-core/test/loop/hooks.e2e.test.ts
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/research-action-orchestration.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/research-action/default-actions.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts packages/agent-core/test/agent/tool-exposure.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/loop/types.ts packages/agent-core/src/loop/index.ts packages/agent-core/src/loop/run-turn.ts packages/agent-core/src/loop/turn-step.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/agent/tool/index.ts packages/agent-core/src/research-action/primitive-plan.ts packages/agent-core/src/research-action/default-actions.ts packages/agent-core/src/research-action/index.ts packages/agent-core/src/agent/tool-exposure/index.ts packages/agent-core/src/agent/workframe/context-pack.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.md packages/agent-core/test/loop/hooks.e2e.test.ts packages/agent-core/test/loop/api-shape.e2e.test.ts packages/agent-core/test/agent/harness/agent.ts packages/agent-core/test/agent/research-action-orchestration.test.ts packages/agent-core/test/agent/turn.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/research-action/default-actions.test.ts packages/agent-core/test/research-action/records.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/agent/research-context.test.ts
```

Focused verification for the 0.11.1 external job submission adapter-contract slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/benchmark-adapter/external-job-submission.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/benchmark-adapter/external-job-submission.ts packages/agent-core/src/benchmark-adapter/default-adapters.ts packages/agent-core/src/benchmark-adapter/index.ts packages/agent-core/src/research-action/primitive-plan.ts packages/agent-core/test/benchmark-adapter/external-job-submission.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
```

Focused verification for the 0.11.2 WorkFrame-scoped evidence inspection slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/tools/research-action-tool.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.md packages/agent-core/test/tools/research-action-tool.test.ts
```

Focused verification for the 0.11.3 external-job native receipt inference slice is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/benchmark-adapter/external-job-submission.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/benchmark-adapter/external-job-submission.ts packages/agent-core/test/benchmark-adapter/external-job-submission.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
```

Focused verification for the 0.0.8 physics direction engine is:

```sh
pnpm vitest run packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-action/default-actions.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/physics-direction packages/agent-core/src/research-action/default-actions.ts packages/agent-core/src/index.ts packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-action/default-actions.test.ts
```

Focused verification for the 0.0.9 escalation policy and final gate is:

```sh
pnpm vitest run packages/agent-core/test/research-policy packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-action/obligation.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-policy packages/agent-core/src/index.ts packages/agent-core/test/research-policy
```

Focused verification for the 0.1 harness and eval runner is:

```sh
pnpm vitest run packages/agent-core/test/research-harness/runner.test.ts packages/agent-core/test/research-action/harness.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-harness packages/agent-core/src/index.ts packages/agent-core/test/research-harness/runner.test.ts
```

Focused verification for the 0.2 FQHE/CS vertical slice is:

```sh
pnpm vitest run packages/agent-core/test/physics-verticals/fqhe-cs.test.ts packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-harness/runner.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/physics-verticals packages/agent-core/src/index.ts packages/agent-core/test/physics-verticals/fqhe-cs.test.ts
```

Focused verification for the 0.2.5 WorkFrame ContextPack orchestrator is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-context packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/workframe.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Focused verification for the 0.2.6 turn-loop context closure pass is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/agent/workframe.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Focused verification for the 0.2.7 dynamic tool exposure pass is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/agent/workframe.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Focused verification for the 0.12.0 file-backed DomainPack runtime is:

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/domain-pack/compiler.test.ts packages/agent-core/test/research-context/compiler.test.ts packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/physics-verticals/librpa.test.ts packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/domain-pack packages/agent-core/src/research-context/compiler.ts packages/agent-core/src/research-context/types.ts packages/agent-core/src/agent/research-context/index.ts packages/agent-core/src/agent/tool-exposure/index.ts packages/agent-core/src/agent/workframe/context-pack.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/test/domain-pack/compiler.test.ts packages/agent-core/test/research-context/compiler.test.ts packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/physics-verticals/librpa.test.ts packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts
```

Repository workflow note:

- completed runtime changes should be committed before moving on to the next coherent slice;
- update this README and `README.zh-CN.md` whenever project goals, feature status, setup, verification, or user-visible behavior changes.

## License

Released under the [MIT License](LICENSE).
