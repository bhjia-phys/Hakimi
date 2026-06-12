# Hakimi

AITP `/autoresearch` update: Hakimi now provides an AITP-backed
`/autoresearch` control surface. `/autoresearch start --topic <topic>
--question <question> [--operator kimi|hakimi|human]` first writes AITP
`startResearchRun`, then stores only a lightweight local runtime snapshot keyed
by the returned AITP run id. `/autoresearch status` / `pause` / `resume` /
`stop` / `replace` update the same canonical AITP research-run/process ledger
through `updateResearchRun` or `recordResearchRunEvent`. `operator` is
provenance metadata only; it does not create evidence, validation, final-gate
satisfaction, or claim-trust authority.

AITP bridge update: `ResearchAction.execute_aitp_write_bridge` can now call
`recordSourceReconstructionReviewResult` / `aitp-v5 source
reconstruction-review-result` when `source_reconstruction_review.next_actions`
asks for `aitp.record_source_reconstruction_review_result`. The result remains
canonical AITP review evidence, not Hakimi claim-trust authority.
Hakimi can also execute AITP `trust preflight` as `preflightTrustUpdate`,
record `aitp:trust_preflight:<token>`, and still does not apply trust updates.
AITP bridge targets are now MCP-first at the contract/projection/execution
layer for writes and trust preflight: Hakimi exposes `mcpTool`, `cliFallback`,
surface, MCP invocation args, and `claimTrustMutation="none"` from AITP's
runtime bridge target manifest in writeBridge params and ResearchAction
results, calls the connected AITP MCP tool first, and falls back to the CLI
bridge when MCP is unavailable or fails.
AITP curated RAG promotion drafts are now exposed as a read-only bridge target:
Hakimi can call `draftCuratedRagPromotion` /
`aitp_v5_draft_curated_rag_promotion` /
`aitp-v5 adapter curated-rag-promotion-draft <chunk-id>` through
`ResearchAction.draft_aitp_curated_rag_promotion`. The result is a controlled
construction sheet with chunk/document ids, hashes, anchors, missing
topic/claim context, forbidden uses, and draft-only `registerSourceAsset`,
`recordReferenceLocation`, `recordEvidence`, `createValidationContract`, and
`preflightTrustUpdate` operations. It is read-only:
`draft_creates_records=false`, every operation has
`creates_record_now=false`, and Hakimi still does not treat RAG as evidence,
validation, final-gate satisfaction, or claim-trust authority.
Hakimi now also exposes the preceding read-only chunk identity check:
`ResearchAction.inspect_aitp_curated_rag_chunk` calls `readCuratedRagChunk` /
`aitp_v5_get_curated_rag_chunk` first, falling back to
`aitp-v5 --base <cwd> adapter curated-rag-chunk <chunk-id>`. The XML shows the
runtime target, chunk/document ids, source URI, version anchor, content hashes,
promotion path, forbidden uses, and lookup boundary before a promotion draft is
requested. It remains `heuristic_context` / `orientation_only`:
`lookup_creates_records=false`, `records_validation_result=false`, and
`lookup_can_update_claim_trust=false`, so it cannot record evidence, satisfy a
final gate, or change claim trust.
Hakimi can now call this read-only action directly from a ContextPack
`action_binding_id`, so the model does not need to copy chunk/topic/claim
fields by hand. The returned XML also includes a `promotion_decision_tree`
that maps each draft-only stage to the separate
`ResearchAction.execute_aitp_write_bridge` operation that could be chosen next;
it marks `selected_write_executed=false` and still requires an explicit later
write or preflight choice.
Hakimi 现在也会渲染 AITP draft 内的 `promotion_write_sequence`：每个 step
给出顺序、未来 output ref pattern、必须已经存在的 prior refs，以及后续哪些
stage 会消费这些 refs。它仍标记 `requires_explicit_execute_call=true` 和
`executes_write_now=false`，所以只是 AITP-owned promotion policy，不是自动
runner，也不是 evidence、validation、final gate 或 trust authority。
Hakimi can now use `ResearchAction.draft_aitp_curated_rag_write_bridge_call`
to select one stage or operation from that tree and return a prefilled
`execute_aitp_write_bridge` tool-call JSON draft with placeholder diagnostics.
This still executes no write, records no evidence, and marks
`executes_write_now=false` / `selected_write_executed=false`; real source
review, missing typed refs, and any AITP `session_id` or record ids must be
resolved before the normal write/preflight action is called.
被选中的 write-call draft 会回显同一个 `promotion_write_sequence` 并标出
selected step，让后续显式 `execute_aitp_write_bridge` 可以按 AITP sequence
检查，而不是让 Hakimi 建第二套 source/reference/evidence store。
如果 selected step 按 sequence 需要 prior refs，Hakimi 现在会检查 reviewed
payload 里是否有对应 concrete refs；比如 evidence draft 只有
`source_asset:...` 而没有 `reference_location:...` 时，会产生 hard-blocking
`missing_sequence_prior_ref` diagnostic。这只是 readiness enforcement，不会
确认 source support，也不会绕过显式 AITP bridge write。
在 guarded curated RAG write 被显式执行之后，如果 AITP 返回的 typed result
可以喂给后续 `promotion_write_sequence` step，Hakimi 会渲染
`aitp_curated_rag_carried_ref_handoff`。这里会同时显示给后续 reviewed payload
使用的 `canonical_ref`，例如 `source_asset:<id>`，以及 ledger/evidence 用的
`evidence_ref`，例如 `aitp:source_asset:<id>`，避免模型把 ref dialect 复制错。
这只是执行成功后的 handoff guidance：不会修改下一步 payload，不会自动运行下一步
draft/write，不会验证 source support、满足 final gate 或改变 claim trust。
新的 write-call draft 可以接收 `promotion_carried_refs` 或
`promotion_carried_ref_handoffs`，并在 payload JSON 旁边渲染
`promotion_carried_ref_suggestions`。它只给出可复制的
`suggested_reviewed_overrides_json`，同时保持 `applied_to_payload=false`；
selected draft payload 只有在调用方显式提供 `promotion_reviewed_overrides`
时才会变化，之后仍然要走 readiness inspection 和单独的
`execute_aitp_write_bridge`。
同一个 suggestion 现在还会包含紧凑的 `carried_ref_next_call_pointer`，
其中的 `draft_call_json` 只指向一次新的
`draft_aitp_curated_rag_write_bridge_call`，并携带这些 reviewed overrides。
这个 pointer 标记 `bridge_called=false`，只帮助模型复制下一次 draft call；
它不会调用 `execute_aitp_write_bridge`，也不会授权 validation/trust 变化。
结构化的 `promotion_carried_ref_handoffs` 现在会 fail closed：如果缺少
required fields，或 `canonical_ref`、`evidence_ref`、`ref_kind`、`record_id`
彼此不一致，就不会静默生成 suggestion/pointer。直接的
`promotion_carried_refs` 仍可作为显式 model/user canonical-ref input 使用。
这些失败现在会渲染 compact `carried_ref_handoff_failure` diagnostic，包含稳定的
`code`、`field`、`path` 和 `remediation_summary`。它只指出需要修哪个 handoff
field，并保持 `suggestion_rendered=false`、`next_call_pointer_rendered=false`
和 `bridge_called=false`；它不是 validation、source support、final gate 或
claim-trust authority。
`ResearchAction.list_actions` 现在也会暴露 read-only
`carried_ref_handoff_diagnostic_taxonomy` section，来自同一套 failure-code
mapping。模型可以先查看 repair steps，而不用故意提交 malformed handoff；这份
metadata 不会生成 suggestion、不会 draft next call、不会调用 bridge，也不会授权
validation/trust 变化。
When a turn is actively repairing curated RAG carried-ref handoffs, the
ResearchContextPack now carries a `curated_rag_carried_ref_repair_sequence`
reminder through runtime injection, XML rendering, and compaction snapshots.
It points to taxonomy metadata, a fresh draft action, explicit reviewed
overrides, readiness inspection, and a separate explicit execute call; it does
not render suggestions, mutate payloads, call bridges, validate, satisfy final
gates, or update claim trust.
When the same turn includes a concrete `carried_ref_handoff_failure` `code`
and `path`, Hakimi also compiles a small
`draft_aitp_curated_rag_write_bridge_call` action binding. The binding carries
the failure metadata and no-write/no-validation/no-source-support/no-trust
flags, but still requires explicit chunk selection, promotion stage or
operation selection, reviewed overrides, readiness inspection, and a separate
`execute_aitp_write_bridge` call; it does not infer payload values from the
failure metadata.
The same draft action can accept `promotion_reviewed_overrides` to compare
AITP's original `payload_draft` / `payload_template` with a proposed reviewed
payload. Hakimi renders `original_payload_json`, `reviewed_overrides_json`,
and `reviewed_payload_json` plus override diagnostics, but the overrides only
affect the returned draft and still require a separate explicit
`execute_aitp_write_bridge` call.
For carried-ref repair drafts, Hakimi now also renders
`carried_ref_repair_readiness_echo` at draft, readiness-inspection, and
explicit-execute-precheck boundaries. The echo distinguishes
`needs_reviewed_overrides`, `ready_for_readiness_inspection`,
`readiness_inspection_passed`, and `explicit_execute_precheck_passed` while
keeping `checklist_authorizes_execution=false` and the usual no-write,
no-validation, no-source-support, no-trust flags.
After that explicit execute call succeeds for an AITP source asset, reference
location, or evidence result prepared by a carried-ref repair path, Hakimi also
renders `carried_ref_repair_result_summary`. The summary connects the returned
AITP record id/canonical ref/evidence ref back to the handoff id, repair hint
operations, readiness checklist, and selected operation that prepared it. This
is only runtime audit context over an AITP-owned returned result: it does not
mutate the next payload, execute another write, record validation/source
support, satisfy a final gate, or update claim trust.
On the following turn, Hakimi can compile that result summary into
ResearchContextPack as `curated_rag_carried_ref_repair_result` and expose a
bounded `draft_aitp_curated_rag_write_bridge_call` continuation binding. The
binding carries the returned canonical ref/evidence ref only as candidate
reviewed override input for a fresh draft; it still requires explicit chunk
selection, explicit promotion stage or operation selection, reviewed overrides,
readiness inspection, and a separate explicit execute call. It does not infer
payload values, mutate the next payload, validate source support, satisfy final
gates, or update claim trust.
Promotion and write-bridge call drafts now also render
`canonical_identity_alignment`. This section maps each draft stage, or the
selected stage, to the future AITP record kind and canonical ref prefix that
would only be produced by a later explicit bridge result, while carrying source
chunk/document/hash identity and existing-record requirements. It remains
`draft_creates_records=false` / `creates_record_now=false`.
Within each alignment, `payload_ref_readiness` separates placeholder refs such
as `<source_asset_id>` from concrete refs such as `source_asset:...` and
`reference_location:...`, so a reviewed payload can show whether source/ref
slots are ready before the explicit write call.
Concrete refs in this section are still `confirmation_source=syntax_only` with
`aitp_record_confirmed=false` and `aitp_lookup_performed=false`; canonical
existence/source-support checks still belong to later AITP-owned lookup, write,
validation, or trust-preflight surfaces.
When the AITP record-ref lookup provider is configured, Hakimi can call
`lookupRecordRefs` / `aitp_v5_lookup_record_refs` /
`aitp-v5 adapter record-ref-lookup <refs...>` before rendering a reviewed
curated RAG write-bridge call draft. The XML then reports
`confirmation_source=aitp_record_ref_lookup`, per-ref `lookup_status`, and
`aitp_record_confirmed=true` only for refs found in the AITP typed store.
That confirmation is existence-only: it is not source support, evidence,
validation, final-gate satisfaction, or claim-trust authority.
If AITP reports a missing `source_asset` or `reference_location` ref, Hakimi
also renders the AITP-owned `suggested_next_operation`,
`suggested_next_entrypoint`, `suggested_next_surface`, and
`suggested_next_reason`. These fields only point to the normal AITP write path;
they do not execute that write and do not replace source review, validation, or
trust preflight.
Hakimi also groups these hints into a compact
`missing_ref_repair_checklist` under `payload_ref_readiness`; the checklist is
read-only, marks `executes_write_now=false`, and now names the exact
`next_research_action=execute_aitp_write_bridge` / `next_aitp_operation` for
each repair item while marking `selected_write_call_unchanged=true`. It still
requires a separate explicit bridge call and does not alter the currently
selected curated RAG write draft.
The draft root also summarizes those repair paths with
`repair_hint_operation_count`, `repair_hint_operations`, and
`repair_hint_summary_source=missing_ref_repair_checklist`, so the model can see
the repair route without scanning every item while the checklist remains the
detailed source.
`ResearchAction.draft_aitp_record_ref_repair_write_bridge_call` can now turn a
reviewed `registerSourceAsset` or `recordReferenceLocation` repair payload into
a model-facing `execute_aitp_write_bridge` call draft. This is still only a draft:
`reviewed_payload_executed=false` / `executes_write_now=false`, and the normal
explicit bridge call is required before AITP records anything.
The returned XML also includes a host-side `confirmation_preflight` summary
that classifies remaining diagnostics as hard-blocking, confirmation-required,
or advisory. It now mirrors the repair checklist at summary level with
`missing_ref_repair_hint_count` and
`missing_ref_repair_checklist_present`, so the high-level preflight and the
detailed checklist stay aligned. This is not an AITP trust preflight and it
does not validate the chunk; it only tells the model/user whether a reviewed
call draft still has blocking placeholders or can proceed to a separate
explicit AITP write/preflight call after confirmation.
The same result now includes an explicit
`execute_aitp_write_bridge_handoff` artifact with deterministic `handoff_id`,
`confirmation_id`, a short `sha256` diagnostic hash, the exact
`tool_call_json`, and `non_execution_provenance_json`. This handoff can be
copied into the separate `ResearchAction.execute_aitp_write_bridge` step, but
it is still `handoff_executed=false` / `executes_write_now=false`; it does not
record evidence, validation, final-gate satisfaction, or claim-trust mutation.
Repair-call handoff 会以独立的
`record_ref_repair_write_bridge_handoff` guard kind 检查，和 curated RAG
promotion handoff 分开；显式执行时它只能证明 reviewed repair payload、tool
call 和 hash 匹配，真正写入仍走普通 AITP `registerSourceAsset` or
`recordReferenceLocation` bridge path。
When that separate execute action is invoked, the caller may pass the handoff
as `aitp_handoff` alongside the explicit top-level `aitp_operation` and
`aitp_payload`. Hakimi re-checks that the handoff is not blocked, the embedded
tool call matches the explicit operation/payload, and the diagnostic hash
matches `hash_input_json` before it calls the normal AITP write bridge.
Tampered or blocked handoffs fail before bridge execution; direct explicit
write-bridge calls without a handoff still use the ordinary typed path.
`ResearchAction.inspect_aitp_write_bridge_handoff_readiness` runs the same
guard as a read-only pre-execute check and returns
`aitp_write_bridge_handoff_readiness` with `bridge_called=false` and
`executes_write_now=false`. It can confirm whether the handoff, explicit
operation, and explicit payload match before the separate write action, but it
records no evidence, source support, validation, final-gate state, or
claim-trust mutation.
Guarded handoff artifacts now also include `readiness_call_json`, a prefilled
`ResearchAction.inspect_aitp_write_bridge_handoff_readiness` call for the same
operation, payload, and handoff. This is only a copyable read-only check; the
separate `execute_aitp_write_bridge` call is still required for any AITP write
or preflight.
Curated RAG write-call drafts and record-ref repair drafts also expose a
root-level `readiness_call_pointer` with the readiness action, handoff id,
confirmation id, and diagnostic hash, so the model can see the available
pre-execute check without scanning the nested handoff artifact. The pointer is
read-only and keeps `bridge_called=false`.
Both draft families now also render a compact `readiness_inspection_summary`
that names the root pointer and nested `readiness_call_json` as inspection-only
material. It repeats the no-write, no-validation, no-source-support, and
no-trust flags so the model does not confuse the inspection affordance with
bridge execution.
The pointer and summary are emitted through shared guarded-draft rendering
helpers, keeping curated RAG and repair draft XML aligned without changing the
handoff hash, readiness-call JSON, or AITP write contract.
Both draft families also include a two-item `readiness_inspection_checklist`:
first copy/run the read-only `inspect_aitp_write_bridge_handoff_readiness` call
from the nested readiness JSON, then make a separate explicit
`execute_aitp_write_bridge` call only after readiness passes. The checklist
sets `execute_call_authorized=false` and never calls the bridge itself.
Each checklist has a stable `checklist_id` derived from the draft family and
handoff id, so follow-up tool output can refer to the host navigation item
without inventing an AITP record id.
`inspect_aitp_write_bridge_handoff_readiness` echoes a
`readiness_checklist_result`: passed inspections satisfy checklist item 1 and
point to the explicit execute item next, while failed inspections mark item 1
failed without mutating the draft, checklist, handoff, or AITP state.
When a handoff is supplied, `execute_aitp_write_bridge` now emits a compact
`handoff_execution_precheck` before the guard/result details. Passed prechecks
show `bridge_call_allowed=true` and `bridge_called=true` after the guard has
matched, and echo the guard-verified `missing_ref_repair_hint_count` /
`missing_ref_repair_checklist_present`, `repair_hint_operations`, and
`selected_write_differs_from_repair_hints` from the handoff hash input. The
passed precheck also nests a `readiness_checklist_result` for item 2,
`execute_aitp_write_bridge`, with the stable checklist id and
`explicit_execute_call_observed=true` while keeping
`checklist_authorizes_execution=false` and `executes_write_now=false` on the
echo itself. Failed prechecks show the guard `code`, `path`, `next_step`,
`bridge_called=false`, and `handoff_mutated_now=false` before the existing
failure XML, and report item 2 as not followed without inventing a checklist
id. These echoes are host consistency metadata only; they help distinguish
"repair this missing ref first" from the selected write call, but they do not
repair missing refs, validate source support, or create trust-preflight
evidence.
The final passed `handoff_guard` now repeats that same host checklist trail with
`readiness_checklist_id`, item 2/action/status, and
`readiness_checklist_reference_source="handoff_execution_precheck"`. This is a
cross-reference between the readiness result, execution precheck, and final
guard result; it does not authorize execution, mutate a checklist, or add a new
AITP identity.
The guard coverage now also pins fail-closed behavior for missing
`tool_call_json`, missing `hash_input_json`, payload tampering, diagnostic-hash
tampering, and hash-input/tool-call mismatch. The AITP write-bridge executor
operation list is kept explicit and still excludes `trustApply`, so this
handoff lane cannot silently widen the canonical write surface.
Guard failures now render a structured `handoff_guard_failure` XML element with
stable `code`, `field`, and `path` attributes plus `bridge_called=false`, so
the model can repair the handoff without treating the failed check as a write
attempt.
Those failures also include a `remediation_summary` with a stable `next_step`
and `repair_target`, for example to copy a missing handoff field, align
explicit execute args with the handoff tool call, or redraft/restore hash
input. The summary is advisory only: it requires a fresh explicit execute call
and marks `mutates_handoff_now=false`.
The remediation mapping is now centralized as a typed guard taxonomy in
ResearchAction rather than scattered string conditionals, so future
handoff-like guards can reuse the same failure-code to repair-step pattern
without expanding the AITP write surface.
The same taxonomy is now named in the model-facing ResearchAction tool
description, so retrying a failed guarded handoff can use the advertised repair
steps while still requiring a separate explicit execute call.
`ResearchAction.list_actions` now also renders a machine-readable
`handoff_guard_remediation_taxonomy` section from the same lookup table. Each
failure code maps to one `next_step` and carries
`retry_requires_explicit_execute_call=true` plus read-only/no-evidence/no-trust
flags, so the model can inspect the taxonomy without relying only on prose and
without gaining a new write or mutation path.
For narrower retrieval, `ResearchAction.inspect_handoff_guard_remediation_taxonomy`
returns just that taxonomy section with the same read-only/no-evidence/no-trust
flags and no action-list registry payload.
When a turn asks whether a retrieved curated RAG chunk should become source or
claim support, Hakimi now derives read-only
`ResearchAction.draft_aitp_curated_rag_promotion` bindings directly from
`ResearchContextPack.curatedRag.results`. The binding carries the
chunk/document/hash ids and active AITP topic/claim scope into the WorkFrame
reminder and ContextPack XML, but it still requires an explicit model/user
choice before the draft action is called. Any later AITP source, evidence,
validation, or trust-preflight write remains a separate explicit bridge
operation.
AITP process-graph reads are now MCP-first too: Hakimi calls
`aitp_v5_get_process_graph_slice` with `base`, `session_id`, optional
`claim_id`, and optional `limit`, then falls back to `aitp-v5 graph slice`
when the AITP MCP server is unavailable or does not expose the tool.
Hakimi now also projects AITP local source-asset auto-capture:
`aitp_v5_capture_source_asset_auto` becomes `captureSourceAssetAuto`, so a
local paper, lecture note, code snapshot, dataset, or generated file path can
be sent to AITP for hash/version metadata capture without creating a Hakimi
source store or claim-trust authority.
Hakimi now also projects AITP local tool-run transcript/result auto-capture:
`aitp_v5_capture_tool_run_auto` becomes `captureToolRunAuto`, so a local tool
transcript, benchmark log, or result file path can be sent to AITP for
hash/size/mtime and bounded-preview capture without turning the run into
evidence, validation, or Hakimi-owned trust authority.
Hakimi now also projects AITP local artifact auto-attach:
`aitp_v5_attach_artifact_auto` becomes `attachArtifactAuto`, so a local
benchmark log, validation output, patch, plot, JSON result, or generated file
path can be sent to AITP for hash/size/mtime/MIME-ish artifact metadata capture
without turning the artifact into evidence, validation, or Hakimi-owned trust
authority.
Hakimi now also captures in-process benchmark adapter outcomes through AITP's
`benchmark_adapter_run_to_tool_run` payload profile: when an AITP write bridge
and scoped topic/claim are present, `run_benchmark_adapter` writes
`recordToolRun` provenance and merges `aitp:tool_run:<id>` into the benchmark
action trace. It never writes a validation result or mutates claim trust, and
missing bridge/scope is rendered as a skipped capture.
Hakimi 现在也镜像只读 AITP `readRuntimePayloadProfiles` bridge target，对应
`runtime_payload_profiles` / `aitp_v5_get_runtime_payload_profiles` /
`aitp-v5 adapter payload-profiles`。这只是 host payload-profile metadata：
不是 evidence，不是 validation，也不是 claim-trust authority。Hakimi 会把
这份 catalog 解析成 typed AITP-owned read surface，并通过
`aitp_v5_get_runtime_payload_profiles` 读取，MCP 不可用时回退到
`aitp-v5 adapter payload-profiles`；`catalog_version`、`profile_index`、
`capture_policy`、`host_usage_policy` 和 no-trust result semantics 都会在使用前检查。
`ResearchAction.inspect_aitp_runtime_payload_profiles` 会把 catalog version、
profile index、allowed/forbidden host uses、capture modes 和 no-trust flags
暴露给模型做 payload construction / bridge diagnostics；它不会写 AITP 记录，
不会记录 Hakimi evidence，也不会创建 validation result 或改变 claim trust。
Hakimi 现在也可以在 promotion draft 之前检查单个 curated RAG chunk 的
AITP canonical identity：`ResearchAction.inspect_aitp_curated_rag_chunk` 通过
`readCuratedRagChunk` / `aitp_v5_get_curated_rag_chunk` 读取，MCP 不可用时回退到
`aitp-v5 --base <cwd> adapter curated-rag-chunk <chunk-id>`。这个动作只展示
chunk/document id、source URI、version anchor、content hash、promotion path 和
forbidden uses；`lookup_creates_records=false`、`records_validation_result=false`
和 `lookup_can_update_claim_trust=false` 保证它不是 evidence、validation、
final-gate satisfaction 或 claim-trust authority。

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi terminal welcome screen with a pixel cat-ear exploration spacecraft" />
</p>

<p align="center">
  <strong>Physics agent for exploring the truth of the world.</strong><br />
  <span>Hakimi 是一个原生融入 Kimi Code runtime 的理论物理科研 agent。</span>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">Repository</a> |
  <a href="https://moonshotai.github.io/kimi-code/zh/">上游 Kimi Code 文档</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Status](https://img.shields.io/badge/status-runtime--roadmap-blue)](docs/superpowers/plans/2026-06-02-aitp-agent-runtime-slices-v2.md)

## 理念

Hakimi 这个名字故意保留一点童真。它不是冷冰冰的“真理机器”，也不是把提示词堆得很高的外壳，而是一艘带着猫耳舷翼的小型探索飞船：轻快、好奇、愿意进入未知，但每一步都要带着证据返回。

严肃的部分是它要服务理论物理科研。真实科研对话经常同时触碰论文、推导、代码、benchmark、失败记录、约定选择和长期记忆。Hakimi 的目标不是临时答一句，而是让一个课题在多轮会话中保持自洽：知道自己引用了什么、假设了什么、验证了什么、还有什么不能声称已经完成。

## 为什么存在

Hakimi 不是在 coding agent 外面套一个研究记录本。它是 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的 runtime-native fork：终端循环、工具系统、sessions、skills、MCP、subagents、records/replay、permissions、OAuth 路径和包结构在需要兼容的地方继续继承 Kimi Code；理论物理科研系统则通过 `.aitp` 文件、`packages/agent-core`、turn-loop context injection、tool exposure、records、replay 和 model-facing research tools 进入原生 runtime。

这意味着一个科研动作可以搜索文献、读取代码、准备 patch、提交或归一化外部任务回执、捕获证据，并回到正确的 WorkFrame，而不是把不同课题混在一个长 prompt 里。Hakimi 想做的是：让每条研究线索都记得自己知道什么、证据在哪里、哪些约定成立、哪些结论还不能升级为可信记忆。

## 原生融合结构

<p align="center">
  <img src="docs/assets/hakimi-native-runtime-fusion.svg" width="860" alt="Hakimi native runtime fusion diagram" />
</p>

## 科研循环

<p align="center">
  <img src="docs/assets/hakimi-research-loop.svg" width="860" alt="Hakimi research loop diagram" />
</p>

## 现在已经能做什么

- `hakimi` 是这个包唯一安装的 CLI 命令，因此不会覆盖单独安装的 Kimi Code `kimi` 命令。
- TUI welcome screen 已经使用 Hakimi 像素探索飞船和 physics research 文案。
- WorkFrame 能按 domain、topic、assumptions、conventions、context pack 和 trust state 隔离当前科研问题。
- Domain packs、workflow recipes、physics memory、evals、action bindings 和 tool inventory 可以从 file-backed `.aitp` fixtures 加载。
- 新课题不需要先手写 `.aitp`：Hakimi 默认注册通用 `theoretical-physics/general` profile、workflow、process-memory capsules 和 smoke eval；当 WorkFrame 没有专用 pack 时会自动使用这套理论物理科研底座。
- ResearchAction 可以执行 in-process graph query、benchmark adapter、formalization blueprint export 和 external job receipt normalization。
- 文献搜索、局部代码 patch 准备、外部 benchmark workflow 通过 Kimi 原生工具编排，而不是塞进 `ResearchAction` 内部直接执行。
- 证据可以写入 research ledger，只在匹配 WorkFrame scope 时重新读取，并被编译成 graph candidates，再经过 harness/final-gate 检查。
- AITP v5 `process_graph_slice` 可以作为 canonical `.aitp` 派生视图进入当前 WorkFrame：Hakimi 只把它编译成 reminder、ContextPack、ResearchAction 绑定和 final-gate 前置条件，不会把 AITP graph 复制成 `.hakimi` 真相。
- AITP `provenance_gaps[]` 现在会投影成 source/code/tool/artifact provenance 摘要、ContextPack 字段和捕获类动作，例如 `aitp.register_source_asset`、`aitp.capture_code_state_auto`、`aitp.record_tool_run`、`aitp.create_validation_contract`、`aitp.record_validation_result`、`aitp.attach_artifact` 和 `code.capture_git_diff_observation`。gap-level AITP `payload_hints[]` 会进入 `writeBridge.payloadDraft` 和 `writeBridge.payloadDraftSchema`，给 code-state、tool-run、validation、source-asset、reference-location、artifact 写回提供 AITP-owned draft，并告诉模型/host 哪些 placeholder 字段必须先替换成真实本地 provenance；普通 provenance gap 只是“复用为证据/验证/benchmark/memory/checked conclusion 前要补”的科研提示，只有 AITP 明确给出 trust/final 前置条件时，Hakimi final gate 才把它当阻塞条件。
- AITP `source_asset_index[]` 现在会投影成 Hakimi 原生 `sourceAssets` 摘要、WorkFrame reminder 和 ContextPack XML 字段，包含当前索引到的 source asset ids、缺失 hash 的 asset ids、重复 hash 的 asset ids。论文、讲义、代码快照、数据集和生成 artifact 的身份、hash、version anchor、reference location 和 duplicate diagnostics 仍然属于 `.aitp`；Hakimi 只读取这份索引来提醒补 provenance，不创建 `.hakimi` source store，也不更新 claim trust。
- AITP `source_stack_coverage` 现在会投影成 Hakimi 原生 `sourceStackCoverage` 摘要、WorkFrame reminder 和 ContextPack XML 字段，包含当前 claim ids、required-output gaps、source reconstruction gaps、review gaps 和 AITP next actions。它只是 source-stack readiness 提示；除非 AITP 另行明确标记 `final_gate_required` 或 `required_before_trust_change`，否则不会成为 Hakimi final gate 阻塞条件。
- AITP `source_reconstruction_review` 现在会投影成 Hakimi 原生 source reconstruction review 摘要、WorkFrame reminder 和 ContextPack XML 字段，包含 review claim ids、open review claim ids、needs-revision/inconclusive claim ids、review-packet claim ids 和 AITP next actions。它只是 review worklist 提示，不会成为 claim-trust authority。
- `ResearchAction.inspect_aitp_runtime_payload_profiles` 现在会读取 AITP-owned `runtime_payload_profiles` catalog，并把 `host_usage_policy`、allowed/forbidden uses、profile index、capture modes 和 no-trust flags 作为模型可见的只读诊断输出。这个动作只能辅助 payload construction、capture-policy diagnostics 和 bridge-readiness diagnostics；它不会写 AITP、不会记录 Hakimi evidence、不会创建 validation result、也不会改变 claim trust。
- `ResearchAction.inspect_aitp_curated_rag_corpus` 和 `ResearchAction.search_aitp_curated_rag_corpus` 现在会读取 AITP-owned curated heuristic RAG surface：前者展示 corpus、document/chunk ids、index policy、allowed/forbidden uses 和 no-trust flags，后者用 `rag_query` / `rag_limit` 调用 `aitp_v5_search_curated_rag_corpus`，MCP 不可用时回退到 `aitp-v5 --base <cwd> adapter curated-rag-search`。Hakimi 会把当前 Agent cwd 作为 AITP `base` 传给 MCP/CLI provider，所以如果 workspace 存在 `.aitp/curated_rag/corpus.json`，AITP 会读取真实 file-backed corpus 并返回 `lexical_file_backed` index/stale diagnostics；否则继续使用默认 fixture。检索结果只作为 `heuristic_context` / orientation-only 背景启发，可用于概念脚手架、文献方向、推导方法选择和 source backtrace 建议；它不是 evidence、validation、final-gate satisfaction 或 claim-trust authority。若某段内容变成 claim-relevant，必须先走 AITP `source_asset`、`reference_location`、evidence、validation 和 trust preflight 的正常提升路径。
- Hakimi 现在也会通过 AITP-owned `record_ref_lookup` 检查 reviewed curated RAG payload 里的 `source_asset:<id>`、`reference_location:<id>` 等 ref 是否存在于 AITP typed store：优先调用 `aitp_v5_lookup_record_refs`，MCP 不可用时回退到 `aitp-v5 --base <cwd> adapter record-ref-lookup <refs...>`。`payload_ref_readiness` 中的 found 只表示 typed-store existence；它不是 source support、evidence、validation、final-gate satisfaction，也不会改变 claim trust。
- 如果 AITP 对 missing `source_asset` / `reference_location` ref 返回 `suggested_next_operation`、`suggested_next_entrypoint`、`suggested_next_surface` 和 `suggested_next_reason`，Hakimi 只把这些字段渲染成下一步修复提示：它们指向普通 AITP 写入路径，但不会自动写记录，也不会替代 source review、validation 或 trust preflight。
- Hakimi 还会把这些修复提示汇总成 `payload_ref_readiness` 里的 `missing_ref_repair_checklist`，方便模型直接看到下一步；这个 checklist 是只读的，`executes_write_now=false`，仍然要求之后显式调用 `execute_aitp_write_bridge`。
- Hakimi 现在也会自动识别适合 curated RAG 的回合：概念解释、文献/讲义背景、推导脚手架、方法选择和 source backtrace 提示会在 WorkFrame context 准备阶段触发一次小上限的 AITP `searchCuratedRagCorpus`。命中的 chunk 会进入 `ResearchContextPack.curatedRag`、WorkFrame reminder、compaction snapshot 和 ContextPack XML，并明确标注 `heuristic_context` / `orientation_only`、chunk/document/hash ids 与 promotion boundary。普通实现或操作提示不会触发 RAG；自动 RAG 也不会记录 Hakimi evidence、不会满足 final gate、不会改变 claim trust。
- `ResearchAction.run_benchmark_adapter` 现在会按 AITP `benchmark_adapter_run_to_tool_run` profile 做一条自动 provenance capture：如果当前 session 有 AITP write bridge 且 WorkFrame/action 参数能给出 topic 与 claim，benchmark adapter 结果会通过 `recordToolRun` 写成 `aitp:tool_run:<id>`，并并入同一个 benchmark action 的 evidence refs。`ResearchAction.capture_primitive_tool_run` 现在按 AITP `primitive_tool_lifecycle_to_tool_run` profile 提供显式 primitive tool capture：模型或 host 必须点名一个最近的 `primitive_tool_call_id`，Hakimi 才会从 lifecycle envelope 构造 `recordToolRun` payload 并写入 AITP。这不是全量自动写入；这个路径不会调用 `recordValidationResult`，不会更新 claim trust；缺 bridge、缺 AITP scope 或找不到 tool call 时只保留 skipped/failed 状态。

## 架构层

Hakimi 围绕五个科研 runtime 层组织。

| 层 | 作用 |
| --- | --- |
| Skills | 程序性记忆：agent 应该怎么工作，例如推导检查、公式到代码 debug、LibRPA 运行准备。 |
| Physics memory capsules | 语义记忆：带 scope、assumptions、provenance、dependency edges、reliability state 和 expansion handles 的物理 claim。 |
| Research ledger | 真实会话中发生过的 source-backed events，在被信任为可复用 memory 之前先进入 ledger。 |
| Compiler and graph | 不是摘要器，而是保留依赖、矛盾标记、验证状态和失败条件的知识编译器。 |
| Research actions | 可审计科研动作，例如约定检查、graph expansion、公式到代码映射、benchmark 验证和 harness 生成。 |

`WorkFrame` 是把这些层连接起来的现场科研状态：它跟踪 active domain、topic、goal、assumptions、conventions、context pack、evidence、obligations 和 final-gate status。Blocking obligations 未关闭时，结论不能被当成 validated memory。

## 与上游的关系

Hakimi 刻意保持贴近上游 Kimi Code。SDK/OAuth imports 和 `.kimi-code` 数据目录目前继续兼容；用户看到的产品名是 `Hakimi`，npm 包名是 `@bhjia-phys/hakimi`，主命令是 `hakimi`。这是一个原生 fork，不是外部 wrapper。

Codex 和 ForgeCode 是参考而不是依赖：Codex 提供 tool exposure、结构化 tool output、action trace 等工程启发；ForgeCode 提供 harness 和可复现 eval workflow 的设计参考。

## 路线图

### 0.0.1: Physics Memory Vertical Slice

第一步是在 `packages/agent-core` 内实现 runtime-native memory 路径：

- 新增 `physics-memory` types、parser、scanner、registry、compiler 和 exports；
- 新增模型可调用的 `PhysicsMemory` builtin tool；
- 支持 `list_domains`、`list_capsules`、`load_capsule`、`compile_context`；
- 让 physics memory 平行于 skills，而不是塞进 skills；
- 作为 Hakimi 默认开启的科研 runtime 能力保留，也可通过对应 experimental flag 显式关闭；
- 用一个窄的 LibRPA fixture set 证明形状。

0.0.1 的 schema 已经预留 `graphRefs`、`expansionHandles`、`requiredChecks` 和 `actionAffordances`，这样后续 research-action 层有稳定接口。

### 0.0.2: Research Ledger And ActionAlgebra

- 新增 `research-ledger` 子系统，扫描 `.aitp/research-ledger`，把 source-backed research events 和可信 physics memory 分开；
- 从 ledger events 编译出 candidate capsules、graph refs、obligations 和 harness candidates；
- 把 `ResearchActionRegistry` 扩展为 ActionAlgebra，加入 phase、precondition、effect、generated obligation、validator 和 primitive tool attribution；
- 新增 `WorkFrame`、`ResearchObligation` 和 `ValidationScheduler` 基础；
- 在 experimental flags 后暴露 `ResearchLedger` 和 `ResearchAction` model tools；
- 协调 Kimi primitive tools、Codex-style lifecycle ideas 和 ForgeCode-style harness boundaries，但不替换 Kimi 的 tool manager。

### 0.0.3: Thin Base Runtime Spine

先补一条最小的 Codex-style runtime reliability 脊梁：

- primitive tool lifecycle envelope；
- tool call 到 action/workframe 的归因；
- result status 和 artifact refs；
- diff/output capture 边界；
- 必要的 interruption/background 状态。

这个 slice 不搬 Codex，也不重写 Kimi 的 tool manager。

### 0.0.4: LedgerWriter And Controlled Capture

- 增加 schema-checked `ResearchLedger.write_event`；
- 写入确定性的 `.aitp/research-ledger/<topic>/events/*.md`；
- 第一阶段只捕获高价值的 source、git diff、benchmark 和 failure observations；
- 长输出保存为 artifact refs，避免 ledger 变成噪音堆。

### 0.0.5: WorkFrame And ResearchAction Call Trace

- 让 WorkFrame 成为 active session context；
- 支持打开、切换、列出、关闭 WorkFrame；
- 把 ResearchAction call 和 primitive tool call、ledger event 连接起来；
- 从 action effects 生成 obligations；
- 在多个 research frame 之间保持 domain isolation。

### 0.0.6: LibRPA Micro Vertical Slice

先用一个窄的计算物理工作流证明 runtime spine 真的有用：

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

- 把局部自洽的推导/代码块编译成 candidate capsule；
- 推导内部保持轻量；
- 只有当局部块要连接 memory、graph、final answer 或其他块时，才进入 capsule boundary。

### 0.0.8: PhysicsDirectionEngine And Lenses

- 增加带 applicability check 的 physics lenses，而不是关键词触发；
- 先做 `topological-order/fqhe-cs` 和 `librpa/head-wing` domain packs；
- 增加 charge-flux quantization lens，并明确区分 external electromagnetic flux、emergent Chern-Simons flux 和 quasiparticle AB flux period。

### 0.0.9: EscalationPolicy And Final Gate

- 简单问题保持轻量；
- 代码修改、benchmark、promotion 和高风险理论 claim 自动升级；
- blocking obligations 未关闭时，final answer 不能声称 validated。

### 0.1: Harness And Eval Runner

- 把 failed 或 inconclusive action traces 转成可审查的 harness candidates；
- 把确认后的 candidates 提升为确定性的 eval cases；
- 增加 FQHE/CS reasoning 和 LibRPA head-wing workflows 的端到端 eval。

### 0.2: FQHE/CS Theory Vertical Slice

闭环第一个形式理论切片：围绕 Laughlin wavefunction、flux insertion、charge-flux quantization、Chern-Simons effective theory 和 K-matrix response，实现 capsules、derivation blocks、physics lenses、convention checks 和 final-answer status。

## 当前状态

- 2026-06-03 已刷新并合并 `MoonshotAI/kimi-code:main` 到 commit `6a22523`（`fix: simplify goal budget schema and fix output caps (#365)`），同时保留 AITP runtime 集成。
- AITP Agent 0.0.1 的 physics-memory vertical slice 已经实现；在 Hakimi 中默认启用，也可通过 `KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY=0` 显式关闭。
- `packages/agent-core` 现在包含 physics-memory types、parser、scanner、registry、compiler、session scanning、append-only records、模型可调用的 `PhysicsMemory` builtin tool、LibRPA fixture capsules，以及基础版 `ResearchActionRegistry`。
- Windows 环境中 broader `agent-core` suite 的基线失败已经修复；详见 [AITP Agent 0.0.1 Audit](docs/internal/aitp-agent-0.0.1-audit.md)。
- 0.0.2 foundation 已经实现：`research-ledger` types/parser/scanner/registry/compiler、session scanning、append-only records、`ResearchLedger` tool、ActionAlgebra types、默认 research actions、scheduler、`ResearchAction` tool、raw-tool escape records，以及 harness candidate conversion。详见 [AITP Agent 0.0.2 Audit](docs/internal/aitp-agent-0.0.2-audit.md)。
- 0.0.3 已经开始实现 thin primitive tool lifecycle spine：真实 loop 层工具调用现在会写入 `tool_lifecycle.started` 和 `tool_lifecycle.completed` records，包含 status、bounded summaries、timing、cwd，以及后续 WorkFrame/ResearchAction 归因预留槽。详见 [AITP Agent 0.0.3 Audit](docs/internal/aitp-agent-0.0.3-audit.md)。
- 0.0.4 已经开始实现 schema-checked `ResearchLedger.write_event` 和 controlled `capture_event`：紧凑的 source-backed events 可以写入确定性的 `.aitp/research-ledger/<topic>/events/*.md` 路径，立即注册到当前 registry，通过 `research_ledger.event_written` 审计，并经过 source/git-diff/benchmark/failure capture policy 过滤。详见 [AITP Agent 0.0.4 Audit](docs/internal/aitp-agent-0.0.4-audit.md)。
- 0.0.5 已经开始实现 active WorkFrame runtime state 和 ResearchAction call trace：`ResearchAction` 可以打开、切换、列出、关闭 WorkFrames，也可以 start/finish action calls；二者都可以 replay；action result 可以携带 ledger event ids；primitive tool lifecycle records 现在会携带 active `workFrameId` 和 `actionCallId`。详见 [AITP Agent 0.0.5 Audit](docs/internal/aitp-agent-0.0.5-audit.md)。
- 0.0.6 已经开始实现 LibRPA head-wing micro vertical slice：绑定到 LibRPA workflow intent 的通用 code/benchmark actions、CI-safe head-wing smoke benchmark stand-in、scheduler expectations、controlled failure capture 和 harness candidate conversion。详见 [AITP Agent 0.0.6 Audit](docs/internal/aitp-agent-0.0.6-audit.md)。
- 0.0.7 已经开始实现 capsule boundary compiler：局部自洽的 `ResearchBlock` 可以编译成未提升的 `PhysicsCapsule` candidate，并保留 assumptions、conventions、source refs、open questions 和 required checks。详见 [AITP Agent 0.0.7 Audit](docs/internal/aitp-agent-0.0.7-audit.md)。
- 0.0.8 已经开始实现 PhysicsDirectionEngine 和带 applicability check 的 physics lenses：FQHE/CS 的 charge-flux quantization、LibRPA head-wing 的 formula-code mapping 现在可以被推荐、拒绝并审计，输出 caveats、guiding questions、required checks 和结构化 ResearchAction bindings。详见 [AITP Agent 0.0.8 Audit](docs/internal/aitp-agent-0.0.8-audit.md)。
- 0.0.9 已经开始实现 EscalationPolicy 和 Final Gate：简单物理问题保持轻量，代码、benchmark、高风险理论 claim 和 promotion 会升级到必要的 runtime controls；当 blocking obligations 仍然打开时，validated final claim 会被降级或阻断。详见 [AITP Agent 0.0.9 Audit](docs/internal/aitp-agent-0.0.9-audit.md)。
- 0.1 已经开始实现 Harness 和 Eval Runner：failed/inconclusive action traces 可以转成确定性的 eval cases；eval run 可以检查 action sequence、action outcomes、evidence refs 和 required checks。详见 [AITP Agent 0.1 Audit](docs/internal/aitp-agent-0.1-audit.md)。
- 0.2 已经开始实现可执行的 FQHE/CS theory vertical slice：Laughlin wavefunction、flux insertion、Abelian CS action 和 K-matrix response blocks 可以编译成 candidate capsules，经过 charge-flux lens/convention checks，生成 eval case，并进入 final gate。详见 [AITP Agent 0.2 Audit](docs/internal/aitp-agent-0.2-audit.md)。
- 0.2.1 upstream sync guardrail 已经配置本地 Kimi Code `upstream` remote；由于当前环境 GitHub HTTPS 访问失败，fetch/merge 暂未执行。详见 [Upstream Sync 2026-06-02](docs/internal/upstream-sync-2026-06-02.md)。
- 0.2.2 已经把 research actions 重构为 universal ids 加结构化 `ResearchActionBinding`：FQHE/CS charge-flux check 现在绑定到 `validate.check_convention` 和 charge-flux `checkId`；LibRPA head-wing benchmark 现在绑定到 `benchmark.run_minimal_case` 和 LibRPA adapter id。详见 [AITP Agent 0.2.2 Audit](docs/internal/aitp-agent-0.2.2-audit.md)。
- 0.2.3 已经加入 file-backed `DomainProfile` 和 `WorkflowRecipe` registries，通过 `KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE` 和 `KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE` 开启，扫描 `.aitp/domain-profiles` 和 `.aitp/workflow-recipes` 并暴露为 `agent.domainProfiles` 和 `agent.workflowRecipes`。详见 [AITP Agent 0.2.3 Audit](docs/internal/aitp-agent-0.2.3-audit.md)。
- 0.2.5 已经加入第一版 WorkFrame ContextPack orchestrator：active WorkFrame 可以从 DomainProfile、WorkflowRecipe、PhysicsMemory、ResearchLedger 和 action bindings 编译 bounded `ResearchContextPack` summary，并把 pack id 绑定回 WorkFrame 用于 replay 和审计。详见 [AITP Agent 0.2.5 Audit](docs/internal/aitp-agent-0.2.5-audit.md)。
- 0.2.6 已经开始闭合 turn loop：prompt-sensitive 的 WorkFrame 复用/切换现在会在 injection cycle 里发生，系统会为推断出的 active WorkFrame 重新编译 bounded `ResearchContextPack`，并在 research step 之前把一个紧凑的 AITP research-context reminder 注入到 model-facing context。详见 [AITP Agent 0.2.6 Audit](docs/internal/aitp-agent-0.2.6-audit.md)。
- 0.2.7 已经开始动态工具暴露：当 research turn 已经拿到 bounded `ResearchContextPack` 之后，runtime 可以施加一个临时 managed-tool overlay，使 theory-oriented turn 保留语义研究工具，而 code-oriented turn 额外暴露 `Bash` / `Write` / `Edit`。详见 [AITP Agent 0.2.7 Audit](docs/internal/aitp-agent-0.2.7-audit.md)。
- 0.2.8 已经开始受控自动捕获：`tool_lifecycle.completed` 现在可以结合 active `WorkFrame` 自动识别真实工具结果，把 git diff / benchmark / failure / source excerpt 压缩写入 `.aitp/research-ledger`，同时为低价值工具噪音留下明确的 skip reason 审计记录。详见 [AITP Agent 0.2.8 Audit](docs/internal/aitp-agent-0.2.8-audit.md)。
- 0.2.9 已经开始 graph-aware memory compilation：research-ledger events 现在可以编译成 typed graph candidates，并附带 provenance check、dependency diagnostics、assumption trace 和 incompatible convention warning；这些输出仍然保持 candidate-level，不会静默变成 canonical memory。详见 [AITP Agent 0.2.9 Audit](docs/internal/aitp-agent-0.2.9-audit.md)。
- 0.3.0 已经开始 promotion pipeline 和 trust-ladder gate：graph candidates 现在只能通过显式 `PhysicsPromotionPacket` 才能晋升，source refs、scope、validation refs 以及 formalized 所需的人类 checkpoint 都会被严格检查；晋升后的 capsule 会保留 trust metadata，而不是抹掉 promotion path。详见 [AITP Agent 0.3.0 Audit](docs/internal/aitp-agent-0.3.0-audit.md)。
- 0.3.1 已经开始 final-gate lifecycle integration：当一个 research turn 试图结束，但 active `WorkFrame` 仍然没有通过 final gate 时，runtime 现在会注入一条非常短的 final-gate continuation 提示，并强制模型再走一步，把答案降级成更保守的表述，而不是静默过度宣称完成。详见 [AITP Agent 0.3.1 Audit](docs/internal/aitp-agent-0.3.1-audit.md)。
- 0.4.0 到 0.10.0 已经补齐 Harness V2、LibRPA/FQHE file-backed verticals、bridge-gated domain isolation、physics graph kernel、formalization bridge，以及图查询、benchmark adapter 和 formalization blueprint 的 in-process `ResearchAction` executor lane。
- 0.11.0 已经开始 primitive tool plan templates 和 live native-tool orchestration：每个默认 `ResearchAction` 都可以渲染可审计的原生工具计划；文献搜索、局部代码 patch 准备、外部 benchmark job 提交都有一等语义 action。Runtime tool exposure 会读取 action bindings，通过 turn-scoped Kimi tool builder 激活模板所需的 Kimi 原生工具，并且 replay 后保持 topic-scoped overlay 和 evidence attribution 不串会话；`ResearchAction` 本身仍然不直接执行 shell、git、web、MCP 或 HPC。整轮测试现在已经覆盖 source search、code patch、external job submission，并通过原生 `WebSearch`/`FetchURL`、`Read`/`Edit`、`Bash` 和 `ResearchLedger.capture_event` 的 call attribution 回填到 `ResearchAction.finish_action_call`，同时写入 durable source/code/job ledger event、发出 `research_ledger.event_written`，并把 `ledger:event...` id 放进 `evidence_refs`。详见 [AITP Agent 0.11.0 Audit](docs/internal/aitp-agent-0.11.0-audit.md)。
- 0.11.1 已经加入第一版 external job submission adapter contract：`adapter.external.job-submission` 可以把 scheduler/MCP/HPC/manual job receipt 归一化成 `benchmark.submit_external_job` 的 `BenchmarkAdapterRunResult`，但不在 `ResearchAction` 内执行调度器。Primitive plan 现在会在原生提交之后、ledger/action 记录之前加入 adapter normalization 步骤。详见 [AITP Agent 0.11.1 Audit](docs/internal/aitp-agent-0.11.1-audit.md)。
- 0.11.2 已经把 WorkFrame-scoped evidence inspection 加入 `ResearchAction`：模型可以列出 active 或显式 WorkFrame 最近动作产生的 evidence refs，并且只能在 ledger metadata 匹配当前 frame 的 domain/topic 时加载 `ledger:event...` 正文。加载会写入 `research_ledger.event_loaded`；跨课题/跨 domain 加载会在渲染正文前失败。详见 [AITP Agent 0.11.2 Audit](docs/internal/aitp-agent-0.11.2-audit.md)。
- 0.11.3 已经让 external-job receipt lane 更适合原生工具输出：`adapter.external.job-submission` 现在可以从 SLURM、LSF、SGE、PBS/qsub 等常见 scheduler output 中保守解析 job id，同时拒绝任意 shell 输出。这样 Bash/MCP/remote-runner 只要返回清晰调度器回执，就能用 `schedulerOutput` 喂给 adapter。详见 [AITP Agent 0.11.3 Audit](docs/internal/aitp-agent-0.11.3-audit.md)。
- 0.12.0 已经加入 file-backed `DomainPackManifest` runtime summary：`ResearchContextPack` 现在会携带当前 domain 的 profile/workflow/memory/eval/action/tool inventory，context reminder 和 `ResearchAction` 渲染都会暴露这个 manifest；runtime tool exposure 不再因为 domain 是 LibRPA 就自动打开代码工具。代码工具现在只来自 file-backed workflow `required_tools`、DomainPack action ids 或 universal action primitive plan。FQHE/CS 与 LibRPA fixture 测试会断言 eval、capsule 和 tool exposure 互相隔离，除非存在显式 bridge capsule。详见 [AITP Agent 0.12.0 Audit](docs/internal/aitp-agent-0.12.0-audit.md)。
- 0.12.1 已经收紧原生科研 runtime：`ResearchAction.inspect_domain_pack` 可以检查 active 或显式 ContextPack 的 DomainPack manifest；active WorkFrame 中未挂接 active `ResearchAction` call 的原生工具使用现在会写入带 `workFrameId` 和建议 follow-up action 的 `research_action.raw_tool_escape`；旧的硬编码 vertical exports 也被标记为 compatibility-only，推荐使用 file-backed `.aitp` domain packs。
- 截至 0.12.1，当前 baseline 已经是 file-backed、graph-aware、bridge-gated、带审计和恢复测试的科研 runtime；graph、benchmark、formalization、external-job receipt lane 都有确定性 research executor，literature、code、external benchmark workflow 能通过 Kimi 原生工具执行并留下 durable ledger evidence refs。topic pack 现在有 manifest 级别的 profile/workflow/memory/eval/action/tool summary、primitive tool call attribution、WorkFrame-scoped evidence reread、保守的原生 scheduler 回执归一化，以及 raw primitive tool escape 的恢复记录。
- 0.12.2 把 Hakimi 科研 runtime 改成默认开启：`physics-memory`、`research-ledger`、`research-action`、`domain-profile`、`workflow-recipe`、`research-harness` 和 `/goal` 在未显式设为 `0` 时都会启用。空白理论物理课题会自动获得通用流程底座，包含文献搜索、source capture、推导、验证、memory/eval、代码映射、patch、benchmark 和外部任务提交 action bindings；如果项目存在专用 `.aitp` pack，专用 pack 优先。
- post-0.13.0 的 AITP 原生桥接已经扩展到更完整的科研过程记录：Hakimi 可以从 AITP `process_graph_slice` 编译 `moment_policy.decisions`，把 required-now / trust-boundary 决策转成 `ResearchAction` 绑定，并通过 `execute_aitp_write_bridge` 写回 AITP 的 evidence、tool run、reference location、exploratory record、source asset、proof obligation、validation contract/result 和 human checkpoint。普通 `record_evidence_or_validation` 决策默认优先写 `recordEvidence`；如果已经存在严格 validation result，final gate 也会把它视为同一条 AITP 义务的等价满足。
- Hakimi can execute AITP `trust preflight` through `preflightTrustUpdate`, record `aitp:trust_preflight:<token>` as policy evidence, and still cannot call `trust apply` or mutate claim trust.
- 当 AITP policy 提供 orientation-only 的 `payload_hints` 时，Hakimi 会把它们投影成 `writeBridge.payloadDraft` 和 `writeBridge.payloadDraftSchema`，让模型知道下一次 typed write 的局部字段，以及哪些 placeholder 字段必须由 host 填成真实本地 provenance；这些 draft/schema 只是执行提示，不会变成 `.hakimi` 的 canonical truth。
- AITP policy 里的 lifecycle trigger 字段（例如 `lifecycle_phases`、`trigger_conditions`、`recording_threshold`、`trust_boundary_inputs` 和 `recommended_host_behavior`）也会被投影到 action params / `callObligations`。它们只说明某个 ResearchAction 为什么应出现在 pre-turn、pre-action 或 pre-final 流程里，让模型和 final gate 看见策略原因；Hakimi 不会因此自动写记录，也不会把这些提示提升成 canonical truth。
- AITP exploratory record 和 `payload_hints[].draft` 中的理论物理 reasoning 字段（例如 relation-path questions、backtrace targets、definition/derivation/source dependency questions、original-question guard）会被编译成 `params.theoryReasoning`，并显式渲染到 WorkFrame reminder 与 ContextPack XML 的 `<theory_reasoning>` 绑定里。这用于约束当前 WorkFrame 里的物理头脑风暴/回溯 prompt，不会成为 `.hakimi` 的 canonical memory。
- AITP `route_state` 现在也作为一等投影进入 Hakimi：Hakimi 读取当前 v5 的 `routes`、`active_route_id`、`live_route_ids`、`blocked_route_ids`、`abandoned_route_ids` 和 `pivot_required_route_ids`，统一把 route ref 规范成 `research_route:<id>`，并在 WorkFrame reminder / ContextPack XML 里渲染 `<live_routes>`、`<blocked_routes>`、`<abandoned_routes>` 和 `<pivot_required_routes>`。普通 route choice、failed route lesson、route switch checkpoint 只是科研过程连续性提示；只有 AITP 明确给出 `final_gate_required` 或 `required_before_trust_change` 时，Hakimi final gate 才会把它们当成阻塞前置条件。
- AITP `provenance_gaps[]` 现在也作为一等投影进入 Hakimi：Hakimi 按 source/code/tool/validation/artifact 分类汇总 gap ids，渲染到 WorkFrame reminder 和 ContextPack provenance 字段，并推荐 `aitp.register_source_asset`、`aitp.capture_code_state_auto`、`aitp.record_tool_run`、`aitp.attach_artifact`、`code.capture_git_diff_observation` 等动作。`captureCodeStateAuto` write bridge 会调用 AITP `aitp-v5 code state auto` 捕获 git HEAD、dirty diff hash 和可选 patch artifact；`attachArtifact` write bridge 会调用 `aitp-v5 research-state attach-artifact` 把 benchmark log、validation output、patch、plot、JSON result 或 generated file 作为 AITP artifact record 按引用挂回 canonical store。`source_asset_index[]` 也沿着同一边界投影：Hakimi 渲染 indexed asset、missing hash 和 duplicate hash 提醒，但 source identity、hash/version、reference location、duplicate diagnostics 和 raw provenance 仍由 AITP 拥有。`source_stack_coverage` 现在也沿着同一边界投影：Hakimi 渲染 covered claim ids、evidence-output gaps、reconstruction gaps、review gaps 和 AITP next actions，但 coverage gaps 默认不阻塞 final gate，除非 AITP 明确标记为 trust/final 前置条件。`source_reconstruction_review` 则作为相邻 review worklist 投影：Hakimi 渲染 pending / needs-revision / inconclusive claim ids、review packet claim ids 和 AITP next actions，但 review 提醒不会更新 claim trust。这些 gap、index、coverage 和 review 提醒都不会创建 `.hakimi` canonical source/trust store。
- AITP runtime payload profile 现在也进入 Hakimi 的执行与诊断边界：AITP `host_usage_policy` 规定这个 catalog 只能用于 payload construction、capture-policy diagnostics 和 bridge-readiness diagnostics，并明确禁止 evidence support、validation result、claim-trust update、`trust_apply` 和 bulk auto-capture。`ResearchAction.inspect_aitp_runtime_payload_profiles` 会把这份只读 policy/profile catalog 渲染给模型；`capture_policy` 仍把 benchmark adapter 标成 controlled-auto，把 primitive tool lifecycle 标成 explicit-request。`run_benchmark_adapter` 在已有 AITP bridge 与 topic/claim scope 时会把 adapter outcome 写成 AITP `tool_run_record` provenance；没有 bridge 或 scope 时保留原本 benchmark action trace，并把 AITP capture 标为 skipped。`ResearchAction.capture_primitive_tool_run` 则只按显式 `primitive_tool_call_id` 捕获一条最近的 primitive tool lifecycle completion。所有这些路径都不会把 pass 解释成 validation result，也不会改变 claim trust。
- AITP curated heuristic RAG 现在也进入 Hakimi 的只读启发边界：Session 默认 bridge 会提供 `curated_rag_corpus` 和 `curated_rag_search_result` provider，优先调用 `aitp_v5_get_curated_rag_corpus` / `aitp_v5_search_curated_rag_corpus`，MCP 不可用时回退到 `aitp-v5 --base <cwd> adapter curated-rag-corpus` / `aitp-v5 --base <cwd> adapter curated-rag-search`。这个 provider 会让 AITP 读取 `.aitp/curated_rag/corpus.json` 及其 derived lexical index diagnostics，而不是让 Hakimi 建私有向量库。`ResearchAction.inspect_aitp_curated_rag_corpus` 与 `ResearchAction.search_aitp_curated_rag_corpus` 会把 corpus、chunk、index policy、retrieval result 和 promotion boundary 渲染给模型，但不会写 AITP、不会记录 Hakimi evidence、不会满足 final gate，也不会改变 claim trust。RAG 命中的文献/讲义/笔记内容若要支持 claim，必须先提升为普通 AITP source/evidence/validation 记录。WorkFrame orchestrator 现在还会在概念解释、文献方向、推导背景、方法选择和 source backtrace 这类提示上自动调用小上限 RAG search，并把结果作为 `ResearchContextPack.curatedRag` 注入 reminder / compaction / ContextPack XML；这仍然只是背景启发，不是 claim support。
- AITP curated RAG ingestion 现在也接入 Hakimi write bridge：`execute_aitp_write_bridge` 支持 `ingestCuratedRagCorpus`，会调用 `aitp_v5_ingest_curated_rag_corpus`，MCP 不可用时回退到 `aitp-v5 --base <cwd> curated-rag ingest --path ...`。这个动作只要求 AITP 创建或刷新 `.aitp/curated_rag/corpus.json` 和 `.aitp/curated_rag/indexes/lexical_index.json`，不会创建 Hakimi 私有向量库，也不会把文献/讲义/笔记内容变成 evidence、validation、final-gate satisfaction 或 claim-trust authority。

- 0.12.4 增加第一版面向理论物理新课题的 lecture-guided object discovery：内置通用理论物理底座会包含 `lecture_guided_object_discovery` lens，自动 curated RAG query 会加入 massive matter、cutoff wall、survival、hitting time、energy flux 以及“normal modes 仅作辅助诊断”的物理对象提示；AITP 里的开放讲义 shelf 仍然只是 `heuristic_context`，不能当 evidence、validation、final-gate satisfaction 或 claim-trust authority。详见 [AITP Agent 0.12.4 Curated Theory RAG Audit](docs/internal/aitp-agent-0.12.4-curated-theory-rag.md)。

## 本地开发

环境要求继承自上游 Kimi Code runtime：

- Node.js `>=24.15.0`
- pnpm `10.33.0`

从本 fork 构建一个本地可安装的 CLI 包：

```powershell
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false build
New-Item -ItemType Directory -Force dist-pack
corepack pnpm --config.engine-strict=false -C apps/kimi-code pack --pack-destination ..\..\dist-pack
npm install -g .\dist-pack\bhjia-phys-hakimi-0.8.0.tgz
hakimi --version
hakimi
```

如果不想影响全局 npm prefix，可以做隔离安装检查：

```powershell
$prefix = "$PWD\.sisyphus\drafts\_scratch\hakimi-install-prefix"
npm install --prefix $prefix .\dist-pack\bhjia-phys-hakimi-0.8.0.tgz
& "$prefix\node_modules\.bin\hakimi.cmd" --version
```

Hakimi 的 AITP 科研 runtime 默认开启。新课题不需要先手填 domain pack、memory capsules、workflow recipes 或 evals；先打开 WorkFrame 并编译 ContextPack，系统会在没有专用 `.aitp` pack 时自动使用 `theoretical-physics/general` 通用底座。只有调试或做上游兼容性检查时，才需要显式关闭某项能力：

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

0.0.1 工作的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/physics-memory packages/agent-core/test/tools/physics-memory-tool.test.ts
pnpm --filter @moonshot-ai/agent-core test
pnpm --filter @moonshot-ai/agent-core typecheck
```

0.0.2 工作的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/research-ledger packages/agent-core/test/research-action packages/agent-core/test/tools/research-ledger-tool.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
pnpm --filter @moonshot-ai/agent-core test
pnpm --filter @moonshot-ai/agent-core typecheck
```

0.0.3 primitive tool lifecycle 工作的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/agent/basic.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/agent/tool-lifecycle/index.ts packages/agent-core/src/agent/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/agent/harness/snapshots.ts
```

0.0.4 research ledger writer 工作的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/research-ledger/writer.test.ts packages/agent-core/test/research-ledger/capture-policy.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts packages/agent-core/test/research-ledger
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-ledger/writer.ts packages/agent-core/src/research-ledger/capture-policy.ts packages/agent-core/src/research-ledger/index.ts packages/agent-core/src/research-ledger/registry.ts packages/agent-core/src/agent/research-ledger/index.ts packages/agent-core/src/tools/builtin/collaboration/research-ledger-tool.ts packages/agent-core/test/research-ledger/writer.test.ts packages/agent-core/test/research-ledger/capture-policy.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts
```

0.0.5 WorkFrame runtime 工作的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/agent/workframe.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/research-action/harness.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-action/types.ts packages/agent-core/src/agent/records/types.ts packages/agent-core/src/agent/records/index.ts packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-lifecycle.test.ts packages/agent-core/test/agent/workframe.test.ts packages/agent-core/test/research-action/harness.test.ts
```

0.0.6 LibRPA micro slice 的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/integration/librpa-head-wing.test.ts packages/agent-core/test/research-action/scheduler.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-action/librpa-head-wing.ts packages/agent-core/src/research-action/default-actions.ts packages/agent-core/src/research-action/index.ts packages/agent-core/test/integration/librpa-head-wing.test.ts
```

0.0.7 capsule boundary compiler 的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/research-block/compiler.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-block packages/agent-core/src/index.ts packages/agent-core/test/research-block/compiler.test.ts
```

0.0.8 physics direction engine 的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-action/default-actions.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/physics-direction packages/agent-core/src/research-action/default-actions.ts packages/agent-core/src/index.ts packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-action/default-actions.test.ts
```

0.0.9 escalation policy 和 final gate 的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/research-policy packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-action/obligation.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-policy packages/agent-core/src/index.ts packages/agent-core/test/research-policy
```

0.1 harness 和 eval runner 的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/research-harness/runner.test.ts packages/agent-core/test/research-action/harness.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/research-harness packages/agent-core/src/index.ts packages/agent-core/test/research-harness/runner.test.ts
```

0.2 FQHE/CS vertical slice 的聚焦验证命令：

```sh
pnpm vitest run packages/agent-core/test/physics-verticals/fqhe-cs.test.ts packages/agent-core/test/physics-direction/lens.test.ts packages/agent-core/test/research-harness/runner.test.ts
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm exec oxlint packages/agent-core/src/physics-verticals packages/agent-core/src/index.ts packages/agent-core/test/physics-verticals/fqhe-cs.test.ts
```

0.2.5 WorkFrame ContextPack orchestrator 的聚焦验证命令：

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-context packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/workframe.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

0.2.6 turn-loop context closure 第一阶段的聚焦验证命令：

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/agent/workframe.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

0.2.7 dynamic tool exposure 第一阶段的聚焦验证命令：

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/agent/workframe.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

0.11.0 primitive tool plan template slice 的聚焦验证命令：

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/research-action/default-actions.test.ts packages/agent-core/test/research-action/records.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/agent/research-context.test.ts packages/agent-core/test/agent/research-action-orchestration.test.ts packages/agent-core/test/loop/hooks.e2e.test.ts
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/agent/research-action-orchestration.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/research-action/default-actions.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/tools/research-ledger-tool.test.ts packages/agent-core/test/agent/tool-exposure.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/loop/types.ts packages/agent-core/src/loop/index.ts packages/agent-core/src/loop/run-turn.ts packages/agent-core/src/loop/turn-step.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/agent/tool/index.ts packages/agent-core/src/research-action/primitive-plan.ts packages/agent-core/src/research-action/default-actions.ts packages/agent-core/src/research-action/index.ts packages/agent-core/src/agent/tool-exposure/index.ts packages/agent-core/src/agent/workframe/context-pack.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.md packages/agent-core/test/loop/hooks.e2e.test.ts packages/agent-core/test/loop/api-shape.e2e.test.ts packages/agent-core/test/agent/harness/agent.ts packages/agent-core/test/agent/research-action-orchestration.test.ts packages/agent-core/test/agent/turn.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/research-action/default-actions.test.ts packages/agent-core/test/research-action/records.test.ts packages/agent-core/test/tools/research-action-tool.test.ts packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/agent/research-context.test.ts
```

0.11.1 external job submission adapter-contract slice 的聚焦验证命令：

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/benchmark-adapter/external-job-submission.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/benchmark-adapter/external-job-submission.ts packages/agent-core/src/benchmark-adapter/default-adapters.ts packages/agent-core/src/benchmark-adapter/index.ts packages/agent-core/src/research-action/primitive-plan.ts packages/agent-core/test/benchmark-adapter/external-job-submission.test.ts packages/agent-core/test/research-action/primitive-plan.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
```

0.11.2 WorkFrame-scoped evidence inspection slice 的聚焦验证命令：

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/tools/research-action-tool.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/agent/research-action/index.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.md packages/agent-core/test/tools/research-action-tool.test.ts
```

0.11.3 external-job native receipt inference slice 的聚焦验证命令：

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/benchmark-adapter/external-job-submission.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/benchmark-adapter/external-job-submission.ts packages/agent-core/test/benchmark-adapter/external-job-submission.test.ts packages/agent-core/test/tools/research-action-tool.test.ts
```

0.12.0 file-backed DomainPack runtime 的聚焦验证命令：

```sh
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/domain-pack/compiler.test.ts packages/agent-core/test/research-context/compiler.test.ts packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/physics-verticals/librpa.test.ts packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/domain-pack packages/agent-core/src/research-context/compiler.ts packages/agent-core/src/research-context/types.ts packages/agent-core/src/agent/research-context/index.ts packages/agent-core/src/agent/tool-exposure/index.ts packages/agent-core/src/agent/workframe/context-pack.ts packages/agent-core/src/tools/builtin/collaboration/research-action-tool.ts packages/agent-core/test/domain-pack/compiler.test.ts packages/agent-core/test/research-context/compiler.test.ts packages/agent-core/test/agent/tool-exposure.test.ts packages/agent-core/test/physics-verticals/librpa.test.ts packages/agent-core/test/physics-verticals/fqhe-cs-v2.test.ts
```

仓库工作规则：

- 每完成一个 coherent runtime change，都应该先提交 commit，再进入下一块；
- 当项目目标、feature 状态、安装验证方式或用户可见行为变化时，同步更新 `README.md` 和 `README.zh-CN.md`。

## 许可证

基于 [MIT](LICENSE) 协议发布。
