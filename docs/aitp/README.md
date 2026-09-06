# AITP integration handoff

Local installation receipt (2026-09-06): the working tree, including the
multi-session overview and earlier retained-conclusion/checkpoint-evidence/Run
observation follow-ups below, was rebuilt, packed and installed as 0.21.0 under
`/home/bhjia/.local`. Installed main/worker bytes and all 521 Web files matched
the build; CLI help/version and a native PTY smoke passed. npm initially blocked
node-pty scripts; a one-time global rebuild completed them (also rebuilding the
node-pty copy under devspace). No permission configuration, user session or AITP
ledger was changed. Existing processes were not restarted and retain old code.
No commit, push or npm release was performed; older source-only notes below are
historical, not the latest installation status.

Web multi-session discovery follow-up (source only, not installed): the existing
Session read surface adds optional live Research revision/mode/Line facts from
already-created main agents. No cold resume, AITP I/O, Goal control or transcript
subscription is performed by discovery. The Web navigator combines these facts
with newer observed snapshots; global session activity refreshes affected rows.
This is not a persisted cross-process Research catalog, nor parallel Actions
within one session. AITP contracts and dirty counterpart files are unchanged.

Checkpoint evidence / retained Run follow-up (2026-09-06; uncommitted, not installed):
`ReadResearchCheckpointEvidence` selects one exact workspace file for a fresh
unsaved checkpoint, validates scope/revision before and after I/O, and returns a
bounded excerpt and byte-exact pin. No generic-tool lease or canonical writes.
`observedRunActionId` is an optional additive Action/input field (model tool:
`observed_run_action_id`); REST, WS snapshot, protocol, SDK forwarding and klient
schemas preserve it. The new foreground Action retains the original Run owner,
campaign/job/source/binary. Current-Line projection recognizes this relationship.
Unknown/mismatched references still fail; waiting does not imply terminal success.
Normal permissions remain, and a shell grant is not OS-level read-only isolation.
No AITP CLI/schema/contract change; the dirty counterpart handoffs remain untouched.
Tests cover the production executor, cold restore/undo and real local REST/WS
transport with synthetic jobs. Real research sessions and remote jobs were not
resumed or modified. Neither this nor earlier uninstalled changes are live yet.
Follow-up validation: protocol 46, kap-server REST/WS 32, TUI Board 93 and
counterpart adapter-contract 6 tests passed; core evidence tests include exact
pin bytes, wrong checkpoint/revision, cross-Line context, save revocation,
mode exit/degradation, changing files/context, traversal, symlinks and size caps.
Core, kap-server, klient (including examples) and Node SDK typechecks passed;
core import checks passed. Web production source/assets were not changed by
this follow-up; no full build, installation or real research acceptance is claimed.

Retained-conclusion automatic proposal (2026-09-06; uncommitted, not installed):
Hakimi's existing reconciliation can propose a checkpoint for an agent-owned
conclusion with captured, unchanged Program/Line/Question/Plan context after the
Line's first explicit workstream confirmation. No second Manager adoption is
required. The shared wire reducer validates the same recovery shape; stable
checkpoint/key identity survives undo, and possible committed history prevents
automatic replay. No new public fields, operations, services or AITP writes are
introduced. Human decisions, unscoped adoption and semantic alignment stay explicit.
AITP working-tree metadata remains 0.9.0/contract-0.2 on counterpart HEAD
`eae1bce5`; its 20 dirty paths are untouched. Hakimi base is `ab2be6356`;
the preceding Web changes are preserved.
The executor integration verifies automatic proposal through the existing
prepare/save/commit tools with fixture adapter I/O. Its originally reproduced
live-Run replacement limitation is addressed by the source follow-up above;
`ObserveResearchRun` still cannot itself query a scheduler. No generic Bash bypass,
remote poller, resumed blocked Goal or real scientific acceptance is claimed.
Verification (single worker, no real scientific session or remote job opened):
core service/ops/presenter 756 passed; execution policy and wire manifest 40;
protocol 46; kap-server REST/WS 32; klient Research contract 3; TUI Board/Manager
116; Web Manager command 31; counterpart adapter contract 6. Core typecheck,
`lint:imports` and `git diff --check` pass. The contract tests use the existing
AITP `.venv/bin/python`; the standalone Python 3.12 has no pytest installed.
No SDK public types changed; SDK tests and full build/install were not rerun.
Reproduce core coverage from `packages/agent-core-v2` with
`pnpm exec vitest run test/features/aitpResearch/aitpResearchService.test.ts test/features/aitpResearch/aitpResearchOps.test.ts test/features/aitpResearch/researchInjectionPresenter.test.ts test/features/aitpResearch/researchExecutionPolicy.test.ts test/wire/wireManifest.test.ts --maxWorkers=1`.
Edits are limited to local-conclusion validation, the existing checkpoint reducer,
Research reconciliation, existing tool/context guidance, their service tests,
the paired README/guides, Hakimi handoffs and one CLI patch changeset. AITP owns
canonical validation/save; Hakimi owns local recovery; actual remote querying
still belongs to an execution tool. No AITP schema, Skill, ledger or approval
semantics were changed. The original job's query path remains unverified; adding
a new query capability requires a separate minimal design and user authorization.

Web Research entry/navigation follow-up (2026-09-06; locally reinstalled, uncommitted):
the top toolbar exposes the existing Research toggle even while inactive; the
Composer Mode-menu Research entry is removed. Other loaded/unread sessions are
visible without a second disclosure; the current session is marked and disabled.
No new session discovery, daemon, Research lifecycle or AITP behavior is added.
`research-panel/app.mjs` mounts the production App and client with fixture daemon
I/O, covering session URL/conversation/state switching and authoritative toggle
success/failure. This corrects the former pane-only navigation coverage gap; it
does not claim a live backend reproduction of the user's ambiguous click failure.
Release mapping: CLI patch only; installed from the current uncommitted Web fix
on base `ab2be6356`, with no commit, push, changeset consumption or registry release.
Package `/tmp/hakimi-research-header-install.supSPN/bhjia-phys-hakimi-0.21.0.tgz`
was installed under `/home/bhjia/.local/lib/node_modules/@bhjia-phys/hakimi`.
All 521 installed Web files/provenance and main/search-worker bundles match the
source build. An isolated-home Web process served matching HTML/JS/CSS without
opening a user session or issuing a model request. npm blocked node-pty scripts;
its inspected install/postinstall path was run only in Hakimi's installed dependency
with two build workers, then a real PTY spawn passed. No global script policy was
changed or existing research process restarted. Restart Web when idle and refresh
the browser to load the fix; the older observatory delivery below is historical.
Verification: 222 targeted single-worker tests and Web typecheck pass. All three
isolated browser scripts (`app.mjs`, `workspace.mjs`, `check.mjs`) pass: real App
URL/conversation/Research switching in both directions, desktop/mobile controls,
unsent draft preservation, rejected toggle retaining its mode, light/dark and
focus/hover coverage, no speculative per-session Research reads. The style scan
has the same 28 baseline findings. Canonical Web assets are regenerated and
`pnpm run build:web-assets -- --check` reproduces all 521 files (source
`7d07a74ad6b36a41eb68361761ff6559e6d3a7d52fa29e6885cdb93285e28be8`).
This is fixture-backed UI acceptance, not a live-model or original-session replay.

Web Research observatory (2026-09-06; delivered and locally installed): a temporary
deep-space palette, static wireframe planet/orbit marks and instrument-style frames,
an authoritative Dreaming violet variant, non-persistent automatic sidebar collapse,
compact floating Board and cross-session navigation over already-observed snapshots.
Unread sessions are explicitly unknown; the ordinary browser remains available.
The navigator performs no background per-session Research GET because that existing
route resumes the session/main Agent. It is not a global active-project index or
parallel-loop scheduler. Session identity/workspace boundaries are preserved; selection
uses the existing navigation path and sends no scientific lifecycle command.
The planning-policy picker uses the existing `set_planning_policy` command with its
captured session/revision, only when idle/ready/connected, with authoritative error
recovery. The palette follows the confirmed policy and resets on session/mode changes;
it does not imply live telemetry or introduce ongoing decorative animation. Goal,
auto permission, record ownership and human decisions are unchanged.
Dialog Escape now stays out of the background interrupt handler. No AITP runtime,
CLI, schema, Skills, ledger, user session or counterpart dirty file is modified.
The Web-only release entry affects the CLI bundle, not the public SDK. Browser fixture
checks are UI acceptance, not live-model scientific acceptance.
Verification: 222 single-worker Web tests pass (workspace projection, planning
commands, existing request ordering/reducers and Board); Web typecheck and diff
checks pass. The style scan retains its 28 existing findings, with no new rules
violated. Both isolated browser scripts (`research-panel/check.mjs` and
`research-panel/workspace.mjs`) pass, including light/dark preference restoration,
hover/focus, narrow layouts, session isolation, failed policy rollback, no GET
fan-out, formula/code readability, policy-palette isolation and Escape-without-interrupt.
Canonical assets were regenerated and
`pnpm run build:web-assets -- --check` reproduces all 521 files. The new changeset
is CLI minor only; pre-existing SDK changesets were not edited or consumed.
Delivery: source commit `d23654b61` was pushed to
`merge/pr-9-auto-subagent-preset` and packed/installed locally at version `0.21.0`;
no registry release was performed. All 521 installed Web files and the main/search
worker bundles match the committed-source build. An isolated-home installed Web
server served matching HTML/JS/CSS with no user session or model request. npm blocked
the optional `node-pty` install script; its inspected local install script was run
only in the installed Hakimi dependency, then an actual PTY spawn passed. No global
script policy was changed. Restart existing Web processes when idle and refresh the
browser to load the new UI; no running research process was interrupted.

Goal usage / Research revision repair (2026-09-06; delivered and clean-installed):
ordinary token, turn and elapsed-time accounting publishes the full Research
snapshot without advancing its optimistic-concurrency revision. Goal identity,
objective/criterion, lifecycle, budget limits/exhaustion, waiting and continuation
controls still invalidate old requests, as do existing Research/Topic/Line,
binding, maintenance and undo boundaries. This fixes the observed
status-read → Goal token accounting → stale workstream-confirmation loop without
guessing revisions, bypassing CAS or inventing human confirmation. Real Goal,
usage and Research services cover the regression, with lifecycle and budget
negative cases; existing clients accept equal-revision snapshot refreshes.
No public schema, AITP contract/runtime/Skill, canonical ledger, session or Goal
is changed. The counterpart checkout's dirty files remain untouched.
Validation: single-worker Goal/Research tests 849 passed (9 new regressions),
REST 32, TUI controller 22 and Web projection/reducer/manager 134; core typecheck,
import-boundary lint and diff checks passed. AITP's existing Python 3.12 venv
passes all 6 adapter-contract tests; the standalone Python launcher lacks pytest.
The new changeset is CLI patch only. Existing CLI minor / SDK major entries in
the aggregate changeset status are unchanged. Commit `172875fa2` is pushed to
`merge/pr-9-auto-subagent-preset` and installed as CLI 0.21.0 from its clean
worktree; changesets were not consumed. Entry, worker, all 521 Web files,
provenance and native PTY match. The canonical Web rebuild check also passes.
The usage regression is covered by real-service tests; installed-process tests
cover the settled-Line fix below, not real-model scientific continuation.
The one-off npm install allowed node-pty scripts without changing user config;
no global name-based dependency rebuild was used. No real session or Goal was
resumed. Running Hakimi processes must restart to load the new code. Receipt:
`/tmp/hakimi-research-revision-install.xCnZ59/installation-verification.json`.

Settled-cycle Line switching (2026-09-06; delivered and clean-installed): the
shared `switchLine` / cross-Line `setFocus` path accepts `state_updated` after
all existing live-work, pending-persistence and human-gate checks pass. The
existing switch operation archives the old period and clears foreground state
to `idle`; invalid targets and stale revisions remain zero-mutation failures.
This corrects the O2 non-idle rule below for settled `state_updated` only, including
cold restore. No Action is completed or abandoned automatically. No public fields,
AITP CLI/schema/contract/Skills, ledger or human-decision semantics change;
counterpart dirty files and the user's live session remain untouched.
CLI 0.21.0 is built from clean commit `172875fa2` together with the usage repair
above. Installed entry, worker, 521 Web files and native PTY pass verification.
An isolated installed Web process retains the
completed cycle through shutdown/cold restore, rejects live work and stale
nonzero revisions, then switches the settled cycle to the other Line. The
existing zero-revision sentinel is unchanged. Both isolated processes stopped
normally; the original user session was not modified. The receipt above
supersedes the earlier uncommitted-build rehearsal at
`/tmp/hakimi-settled-line-install.050tcF/installation-verification.json`.
Historical install caveat: that earlier rehearsal's global name-based node-pty
rebuild also rebuilt devspace's same-version dependency. This delivery did not
repeat that operation; any future rebuild must use the exact dependency directory.

Goal budget recovery (2026-09-05, delivered and clean-installed): an exhausted
paused/blocked Goal is rejected before activation or deadline scheduling. The
model receives a truthful not-resumed result and can explain it under the existing
budget-stop guard. Usage, limits, earlier blockers and crash-time accounting are
preserved. The installed r3 recovery failed after 26.9 seconds; no scientific
closure is claimed. Commit `fd6e0e731` is pushed to the existing development
branch and installed as CLI 0.21.0 (patch changeset not consumed). Installed
entry, 521 Web files, provenance and native PTY match the clean build. A local
fixed-provider process regression returns a truthful explanation in 5.130 seconds
with no added Goal records or budget changes; this is not real-model scientific
acceptance. The overall host Goal is paused. Evidence: collaborator program
[§19.39](theory-physics-collaborator-program.md#goal-budget-resume-preflight).
No Research/AITP contract or human-decision changes; counterpart dirty files stay
protected.

TUI SIGTERM repair (2026-09-05): retain the handler until Session cleanup has
finished, so signal helpers cannot terminate the process before cancellation and
Goal persistence. Repeated SIGTERM does not bypass cleanup. Source-build process
tests cover direct TERM and the original timeout shape; installation and remaining
SIGHUP/dead-terminal limits are tracked in collaborator program
[§19.37](theory-physics-collaborator-program.md#tui-sigterm-shutdown).
No Research conclusion, AITP record, contract, Skill or human decision is changed;
the counterpart checkout and its dirty handoffs remain protected.

Question-context repair (2026-09-05, delivered and clean-installed):
without explicit Focus, the shared snapshot can project the foreground Action's
explicit same-Line Question. Existing Focus is never created or overridden.
After operational work settles, the Question's explicit next step wins over
historical progress. This also restores the existing revision-aware post-commit
synthesis guidance; it does not write a scientific assessment. See collaborator
program [§19.35](theory-physics-collaborator-program.md#question-context-projection).
No public fields, AITP CLI/contract/Skills or counterpart dirty files change.

Commit `152dbf131` is pushed on the existing development branch. Installed CLI
entry, all 521 Web files, provenance and native PTY pass. An independent process
using the matching clean-build SDK restores the real r2 session's Question and
explicit next step; original progress, committed cursor and 74 known research
files remain unchanged. Scoped AITP check stays at zero errors/warnings, with one
outside-scope historical warning retained. This is recovery evidence with no
model request or new computation, not real cross-turn or Heisenberg acceptance.

Simple Actions now accept an explicit current Research Plan/milestone binding
without requiring a reviewed local Action Plan. The existing parent triple must
be complete and fresh; omission does not infer ownership. This is a Hakimi-only
fix using existing public fields, not a new planner or AITP contract. Verification
and delivery status are in collaborator program [§19.33](theory-physics-collaborator-program.md#simple-action-milestone).

Commit `f6487d990` is pushed to the development branch and clean-installed.
Installed entry, Web provenance and PTY match; a ready-AITP temporary fixture
passes stale-parent rejection, REST/WS association, independent-process restore
and no-delta closeout without completing its parent or Goal. No model request
or human scientific confirmation was made. Real cross-turn acceptance is next.

The Goal/Plan acceptance in collaborator program §19.31 saved two valid
conditional derivations but timed out before final Goal closure. Native print
shutdown now uses the existing Goal pause, prompt cancellation, loop settlement
and wire flush APIs before disposal (§19.32). This changes no Research Action
conclusion, AITP record, CLI/files contract, Skill or human decision. The AITP
checkout and its dirty handoffs remain protected; this is a Hakimi host-lifecycle
fix, not H6b or complete G2/G7 acceptance.

Delivered and installed from clean commit `49f51fbdc` (2026-09-05).
Installed entry/Web provenance and native PTY checks pass. Three independent
CLI processes persisted paused Goal and cancelled turn before SIGINT/TERM/HUP
exit, without cold restore or a real model. See §19.32 for receipts and the
one-time `node-pty` install-script repair; scientific continuation remains open.

Theory Physics 0.2.3 exposes whole-task budget, parent-review time and single
packet delivery guidance in the existing parent-facing agent description.
The 0.2.2 natural test did not read the delegation reference and still timed
out; see collaborator program §19.29–19.30. No new injection, deadline executor,
public interface, AITP contract/Skill or packet format is introduced. The
protected AITP checkout and its dirty handoffs remain untouched. Description
delivery tests prove visibility, not model compliance or scientific acceptance.

The installed follow-up recovered the original operator failure checkpoint
through review and official prepare/save/show/check/commit, but then exposed
a settled-action deadlock: `BeginResearchAction` rejected `state_updated`
even after commit. Explicit plan/begin now accepts that boundary while both
live validation and replay retain pending-checkpoint, live-action/run and
human-gate guards. Installed replay on `810f3ced0` now passes next Begin,
one bounded foreground operator read, parent adapter readiness, formal
review/canonical show and no-delta conclusion with zero new canonical writes.
No AITP schema or decision semantics change; real installed
replay evidence and outstanding scientific acceptance are in §19.15 of the
collaborator program. The protected AITP checkout remains untouched.

The installed G5 operator audit exposed two Hakimi lifecycle defects: the
Research tool-overlay repair omitted evidence review, run observation and
historical-checkpoint discard, while a child agent's inactive restore reset
the Session-shared AITP adapter. The mode now restores those existing tools
and installs lifecycle subscriptions only on the main agent. The real audit
correctly refused an identity-mismatched executable but could not commit its
failure checkpoint on the previous build. Regression and installed replay
status is tracked in the collaborator program §19.14; no AITP CLI, contract,
schema, ledger or human-decision rule changes with this repair.

2026-09-05 development addition: Theory Physics 0.2.0 supplies one optional
`calculation-operator` agent profile through the existing plugin loader. It
returns the existing typed child packet; the main agent retains scientific
review, Research state and official AITP persistence. No AITP contract, CLI,
schema, formal distillation Skill or protected AITP checkout file is changed.
Plugin installation/discovery tests are distinct from pending real scientific
acceptance. Shell/file task boundaries are not OS-level isolation.

The same G4 audit found and fixed a candidate-identity gap: canonical `show`
must match the candidate's Entry kind, authority and expected creator as well
as its captured scope before checkpoint acceptance. A mismatch keeps the
actual saved Entry/receipt pending and does not trigger post-commit review.
This adds no canonical write or pre-save authority guarantee; AITP's existing
atomic save flags still cover only exact Topic/workstream.

Cross-repository handoff 的单一入口：Hakimi（agent 编排、工具调用、交互体验）
与 AITP（协议、持久化、证据权威）。本目录是 Hakimi 侧基线；AITP 侧的对应
交接文档位于 AITP 仓库的 `docs/hakimi/`。任何 Hakimi 开发会话在构建或修改
AITP adapter 前应阅读两侧的交接文档；AITP stage/CLI/schema 状态变化时，
本目录必须同步更新。

- Baseline audit: **2026-08-08**，AITP HEAD
  `8658f6827288f4bb61e5c193a346f0f73ebbe3b2`。AITP 侧结论：**不需要 AITP
  plan change**——冻结的 M1a/M1b spec 已覆盖 Hakimi 全部集成需求；
  `record/note prepare|save` 按 version-0 契约处理（详见
  `compatibility-matrix.md` §3）。
- Current amendment: **2026-08-23**，重新核验 AITP HEAD
  `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290`（committed HEAD 是
  0.8.0——Skill-only amendment 已 commit）。M0.6 以缩小
  声明关闭；M1a、M1b-R1、M1c、M1d、M1e 均 **done；deterministic gate
  passed**（154 tests）。Hakimi 可 feature-detect 读契约
  `enter-0.2`/`list-0.1`/`show-0.1`/`check-report-0.1`、M1c 作用域契约
  `enter-0.3`/`list-0.2`、M1d 作用域 check 契约 `check-report-0.2`（均仅
  单次 `--workstream`）；M1e 增加 `backfill` 命令与
  `sha256-once:` 可变观测 pin。AITP 0.8 是 **Skill-only amendment**（已
  commit），定义了 `method-observation` marker 候选、保守
  card/trial review、两步 human decision（approval + publication）和
  platform tool/card/Skill 三层边界——不改 CLI/schema/transport。**Hakimi adapter 的 H0–H4 已实现，H5 仅部分集成**；这反映 adapter 的实现边界，不是 Research Mode 入口的开关，也不是 H6b 可用性信号：strict contract discovery、Python probe、`enter`/`list`/`show`/`check` 读侧消费、
  `record`/`note prepare|save` 写入门控持久化、scoped `--workstream`
  读取/check、M1e check finding code 的 opaque projection（不实现 backfill/sha256-once/check-policy 语义）、Research state（Question/Line/Focus、
  三轴问题模型、revision-based human steering、pending checkpoint 与
  save+show+check barrier、Goal complete guard）、mode/loop/Question/Focus/
  checkpoint 的单一完整 snapshot push、active step 的语义状态维护 guidance、
  protocol/node-sdk/kap-server/klient 公开表面、TUI `/research` Board/manager
  与 stale-hydrate 防护均已实现。`/research` 与 `EnterAITPMode` 默认可发现；新 session 初始为 inactive，hydration 保留已持久化的 mode。inactive hydration/REST GET/SDK snapshot 读取只使用本地快照，不探测 AITP、不发生 AITP I/O，Board 和其他 Research/AITP 工具、plugin skill 保持隐藏；持久化为 active 的 session 在 cold restore 后仍保持 active，并重新 probe adapter、执行只读 `enter` → `check` maintenance。inactive session 只有显式 `/research` toggle、模型入口或 `enter_mode` 才会启动 probe；active undo/cold restore 也会重新 probe，ready probe 后只读执行 `enter` → `check`，不调度模型 turn；Goal 仍是跨 turn continuation 的唯一 owner。旧 `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE`、`[experimental].aitp_research_mode` 与 master flag 对该能力均 inert no-op；backfill 不作为模型工具暴露。
  当前状态维护也已接通：进入模式、active undo/cold restore（均在 ready probe 后），以及 active、ready、loop-running 的 admitted Research turn 在 Research state 发生变化后的 turn end，都会只读执行 `enter` → `check`，不是 session-end automatic closeout。main-agent user prompt 由 prompt ingress 获得 transient `interactive_research` lease；只有 Goal engine 在现有 Research continuation guards 放行后生成的 typed continuation 才获得 `autonomous_research` lease。两者都进入 Research Loop 并接收 Research context；interactive lease 从不 enqueue continuation，Goal 仍是唯一 continuation owner。用户 typed turn 在 degraded 下也可获得 interactive lease，保留本地 reconciliation、provisional Action 与 Board 更新；自动 Goal 准入及中途降级后的后续 Action 工作仍被 hold。system/cron/subagent/unclassified、inactive、probing、paused turn abstain。maintenance receipt 和 context injection 只暴露安全摘要；完整 Research snapshot/API 或 expanded Board 仍可能包含 checkpoint、revision 和 adapter health 字段。合法的 check findings（包括 error finding）保持 ready；只有周期不可用或无效时显示 degraded。error finding 仍可按具体 checkpoint 的保存屏障阻止提交；不会自动 init/adopt/backfill，也不会自动写 semantic handoff、Entry 或 Note。该 coordinator 不是 H6b native method-distillation orchestration。Checkpoint 还会保留 prepare/save/check receipt、具体 Entry ID 和 pre-save finding baseline；commit 前用 `show` + scoped `check` 验证，旧 error 只作为可审计 warning，新 error 才阻止提交。Research alerts 使用稳定 fingerprint，并区分 active blocker、historical unresolved、superseded retry 和 warning；清除记录保留在 snapshot 中但不再注入模型。Research Loop 还实现 typed child evidence packet 的 main-agent-only review（review 本身 zero-write）和绑定当前 action 的显式 run observation；正常有界行动路径是 `BeginResearchAction` → 科研工作 → `ConcludeResearchAction`。Conclude 在一个 Research transition 中记录物理工作、结果、测试或推导、限制、主线影响、下一步和一次 main-agent durability assessment；`no_durable_delta` 不安排 S6 写入，`durable_delta` 只生成一个带现有 Entry kind、authority、provenance 与 rationale 的 pending commit candidate。它不提交/轮询 HPC、不创建 campaign 实体，也不把 RUNNING 当作科学结论。S7 已增加首次成功 checkpoint commit 后的一次无状态 same-turn handoff：只把 touched Entry 和 checkpoint 交给精确的外部 `distilling-methods` Skill；duplicate/unavailable 均为非阻塞 no-op。
  S5 还移除了 Research Line slug 自动成为 AITP workstream 的假设。Hakimi 只在无作用域 `enter` 观测当前 Topic 后，接受用户或 main agent 显式确认的本地、带 revision 的 Line→workstream binding；绝不从 slug、文本、路径或 ID 推断。每次确认带 server-owned `confirmationId`，clear 同时校验不回退的 public revision 与 exact identity。`unbound`/`unavailable`/`stale`/`conflict` Line 可继续低风险本地探索，但不能做 scoped durable checkpoint。maintenance 与 checkpoint prepare/save 都先重新观测 Topic 再校验精确 confirmed binding；canonical `show` 只接受 captured Topic 与唯一 captured workstream。S5.1 现以 AITP 0.9.0 `aitp/adapter-contract-0.2` 关闭原强写入隔离缺口：checkpoint save 自动传入 captured Topic 与 exact singleton workstream，由 AITP 在写锁内 compare-and-save；mismatch 零 canonical write，post-save `show`/scoped `check` 保持 defense in depth。save 与本地 binding 竞态仍保留 receipt 并 degraded，reset/exit mutation race仍需 canonical recovery。绑定状态已同步 snapshot、REST、WebSocket、SDK、klient、TUI 和 Web；S5 strong gate 已通过。
  S6 将上述 barrier 接到正常 Conclude 边界：`no_durable_delta` 保持零 S6 persistence/distillation I/O；`durable_delta` 以 additive `commitCandidate` 固定 source action、progress boundary、Entry kind、authority、provenance 和 rationale，并立即复用 prepare/fill/save/show/scoped-check/commit 路径。相同 retry 返回同一 pending candidate，不同 retry、provenance mismatch、重复 progress 与 pending 时的 Question/Line/Plan/Goal formal closure 均 fail closed。candidate 通过 REST、WebSocket、Node SDK、klient、TUI 与 Web 同步；AITP runtime/CLI/schema/adapter contract 不变。S7 conditional distillation handoff 已实现，但 H6b native coordinator 仍未实现。
  H6b/C6 native method-distillation orchestration 是 **planned，
  unavailable**。`lineage`/`lite-entry-0.2`/
  `run-pointer-0.1` 仍 deferred，M2–M4 blocked。
  2026-09-02 的 Hakimi-only O1 进一步给 generic Goal snapshot 增加可选、
  派生且不持久化的 continuation 投影：`idle`、`deciding`、`enqueued`、
  `running`、`held`、`waiting`。Research snapshot 只透传同一投影；`held`
  保留现有 continuation participant 的 owner/reason，Goal 条与 Research Board
  明确显示 `active · continuation held`。这没有新增第二套 lifecycle、
  scheduler、AITP 写入、CLI/schema/adapter contract 或 human-decision 语义。
  2026-09-03 的 Hakimi-only O2 把 TUI/Web 紧凑 Research Board 收敛为
  `Project / Current cycle / Attention / Next` 四个位置，并把 legacy
  `period.loopCount` 只解释为 Research turn 数。现有 scientific phase 仅在
  UI 映射为 `Frame/Hypothesis → Test/Action → Evaluate → Record → Next/Ready`，
  没有新增 wire/schema 状态。健康的 AITP、alignment、workstream 与 provenance
  折叠到展开审计面；compact/expanded 当前 attention 都按 current Line 隔离。
  Line switch 在 live Action/Run、pending checkpoint、unresolved human gate 或
  non-idle phase 下 fail closed，并在安全切换前把旧 period 的 focus/progress
  摘要归档。统一 reconciliation 只修复 deterministic Hakimi-local period、
  committed-checkpoint acknowledgement 和 stale alert；不推断 workstream、
  不写 AITP，也不改变 Goal continuation owner。AITP checkout 本次只读，
  CLI/schema/adapter-contract 0.2/fixtures/Skill/human-decision 均不变。
  同日 Hakimi-only O3 增加真实 0.21 形状的匿名 replay fixtures：旧单 Line
  archive 缺少可选 continuation 时明确投影为 unavailable；双 Line archive
  中 compact Board、模型注入、gate、alert、Next 与 continuation attention
  只消费当前 Line。旧 live Action 若脱离唯一确定的所属 phase，reconcile 会
  幂等恢复该结构但保留 Action 与 human resolution；Goal completion 被阻止，
  autonomous continuation 被 hold，下一次 interactive Research turn 只被引导
  根据已有证据完成或放弃同一 Action。Hakimi 不从 UI 推断科学结果、不自动
  complete/abandon，也不为纯记账问题询问用户；这没有新增 AITP 或 public
  transport contract。
  2026-09-05 的 Hakimi-only O4 针对真实 debug export 收敛恢复与执行归属：
  无 receipt、无 committed Entry/history 痕迹且 captured Question revision 或
  Program/binding 已 stale 的 historical pending checkpoint 可以安全自动或
  显式 discard；任何可能跨过 canonical save 边界的 checkpoint 继续 fail
  closed。unresolved human gate 与 phase 漂移只机械恢复到 `awaiting_human`，
  不自动替人作决定；已 cleared alert 不再重复写入 clear op。Research Mode
  active 时，统一 Tool Executor 的 before-execute veto 层直接把
  Web/workspace/shell/task/subagent/scheduler/unknown plugin work 绑定到
  fresh active Action 与其 runtime capability；Begin 与 work 必须分两个 batch，
  post-action checkpoint draft 使用独立的窄 persistence lease。该策略不是
  OS-level sandbox，`shell` 仍受通用 permission/host sandbox 约束。
  后续 G3 修复了已有 Note 的读取死路：AITP `show` 只读 Entry，因此 mode
  ready 时，精确 workspace-relative `.aitp/topic/notes/note-<id>.md` 的
  `Read` 和只返回文件名的通用 Method-card/observation marker `Grep` 属于
  recorded-knowledge inspection，无需 live Action；新科研工作和 canonical
  write 仍按原策略。此例外不解析 AITP、不判定 trigger、不主动扫描，也不
  授予绝对跨工作区路径或任意读写。`theory-physics` 0.1.3 同步无 Goal 探索、
  科学 loop/Action/turn 分工及按需检索指导；整体模型行为仍待真实课题验收。
  G3 后续修复把 post-commit Note 的临时写归属固定到成功 commit 的精确
  Line/Topic/workstream confirmation，在工具实际执行和 fresh Topic observation
  后复核；切线、rebind、失去 ready、undo/restore 或 newer cursor 撤销旧权限，
  迟到 prepare 不能重新授权。Note I/O 未完成时阻止本地切线/rebind；迟到 save
  返回的真实路径保留在错误中，不声称 rollback。没有复制 AITP parser 或增加
  transport 字段。G3/G6 后续支持 fresh Question-bound Note Action：所选
  evidenceRefs/falsifierRefs 经官方 show 核验为当前 Topic/workstream 的 active
  Entries，Action 同时授权两个 Note tools，才能 prepare/save；冷恢复不能复用
  旧 draft 权限，必须 fresh prepare。该路径支持已有成果整理，无需制造新科学
  delta，不恢复旧 cursor/attention 权限，也不新增 review scheduler。
  `theory-physics` 0.1.4 提供按需使用指导，真实课题端到端行为仍待验收。
  AITP Note 原子 Topic/exact-workstream save 仍 unavailable，不借用 Entry 的保证。
  `collaborative | dreaming` 是 Research planning policy，`auto` 是正交的工具
  风险 permission；Goal 仍是唯一跨 turn continuation owner。AITP checkout
  只读，0.9.0 CLI/schema/adapter-contract 0.2/Skill/human-decision 均不变。
  alerts 和 generic human gate 已实现，但 candidate confirmation 不是 `SetResearchFocus` 的 runtime 强制 guard，`ResolveResearchDecision` 不会自动写入 AITP decision Entry。degraded active Research Mode 会阻止 AITP writes 和 Goal completion；未解决 human gate 也会阻止 Goal completion，但本地 Question/Line mutation 仍可能发生，当前没有 automatic session-closeout。
  Hakimi 的本地 parser/contract 测试使用已 commit 的官方 AITP 0.8.0 golden fixtures：`enter.json`、`enter-after-save.json`、`list.json`、`show.json`、`check.json`、`check-workstream.json`；这些 read fixtures 在 S5.1 中保持逐字节不变，并已重新验证可由 AITP 0.9.0 消费。此外，2026-08-29 已在一次性 scratch store 中用 managed AITP 0.8.0 CLI 完成真实子进程 smoke test，覆盖作用域 `enter`/`check`、`record` 与 `note` prepare/save、`show`/`list`、重复 prepare 复用和最终 clean check；0.9.0 atomic-save 异常矩阵由当前 AITP/Hakimi deterministic suites 覆盖，完整跨平台 conformance 仍待补齐。
- 完整兼容矩阵、假设核对与决策：
  [`compatibility-matrix.md`](compatibility-matrix.md)。
- AITP 状态跟踪与开发前核对清单：
  [`TRACKING.md`](TRACKING.md)（Hakimi 侧补充，AITP 侧无对应文件）。
- Native method-distillation orchestration 设计：
  [`method-distillation-orchestration.md`](method-distillation-orchestration.md)
  （描述仍未实现的 native H6b；S7 的无状态同轮 Skill handoff 不属于该 coordinator）。
- G1 入口修复：typed 用户回合从 inactive/probing 进入 ready/degraded 后，直接衔接 interactive admission 和一次本地 boundary，不需要第二条用户提示。pause/exit 撤销准入；mode 恢复从不创建或恢复 autonomous Goal lease。沿用现有 mode event 与 step-head injection，没有新 wire schema、额外 AITP 检查或 continuation owner。
- G7 首次安装版真实运行发现原生 v2 默认使用旧 `.kimi-code` home，而 SDK/安装检查使用 `.hakimi`，造成 AITP contract discovery 失败。已统一为显式 home → `HAKIMI_HOME` → `KIMI_CODE_HOME` → `.hakimi`；没有修改 adapter、AITP CLI/contract 或用户目录内容，也没有把源码显式 home 的成功 probe 当作安装版复测。原运行仅有 provisional read-only Action，不计为科学 milestone；完整证据与复测状态见总体规划 §19.11。
- 随后的实际模型调用已验证首次进入 ready、加载 Theory Physics、读取官方 Entry；但同一会话 cold restore 复现 catalog 尚未加载即 probe 的独立时序缺陷。adapter 现在等待 `ISessionSkillCatalog.ready` 并保留 reset/exit 的取消和 generation 检查；不增加重试、maintenance 周期或公共 schema。缺失插件/未知 contract 仍 fail closed，具体复测状态见总体规划 §19.12。
- 2026-09-05 的 G1 显示修复只改变 Hakimi 投影：紧凑 Board 优先显示科学目标或
  milestone 和当前工作，turn 计数留在 expanded；已分类的历史失败不再占据当前
  Attention，但原始记录和未分类的真实 blocker 保留。无 pending checkpoint 的
  `state_updated` 显示 Next/Ready，显式 Goal wait 显示 Waiting。模型提示过滤相同
  历史噪声，不再因 remaining-budget/researchRevision 变化重复 brief；目标、范围、
  completion criterion、continuation 和预算上限变化仍披露。无新增 AITP I/O、
  public phase/schema、状态 mutation 或科学判断；真实课题行为验收仍待完成。
- 面向研究者的最终形态、完整 Research Loop、职责边界、当前缺口和完整交付
  Goal：[`theory-physics-collaborator-program.md`](theory-physics-collaborator-program.md)。
  这是前向总体规划，不改变已经关闭的 S0–S10 状态，也不把 planned 能力写成
  已实现事实。
- Unified Research Mode 实施计划：
  [`unified-research-mode-program.md`](unified-research-mode-program.md)。S1 已将
  interactive/autonomous Research turn lease 分离；S2 新增可选的
  `hakimi/research-goal-0.1` snapshot 投影。该投影与当前 generic Goal
  一对一，公开 objective、completion criterion、Research scope、non-goals、
  budget、stop conditions、Program relation、human gates 和 persistence
  guards；generic Goal 仍是唯一 continuation/budget engine，AITP Topic Goal
  仍只读观测。旧 `goalSummary` 在兼容期继续保留。S3 新增 checkpointed
  `hakimi/research-plan-0.2` 多轮计划，并把旧 bounded-action `ResearchPlan`
  作为 additive `actionPlan` alias 显式保留。G2 的后续修正允许 reviewed local
  Action Plan 独立执行，不强制创建 Goal 或完整 Research Plan；已有 draft/active
  Research Plan 时仍须绑定 active milestone，且 parent ID/revision/milestone
  必须全部提供。simple 小型可逆 action 使用 immutable minimal-plan binding，
  可显式关联当前 active milestone，不要求 reviewed local Action Plan；任一 binding stale 时
  start/conclude fail closed。Plan lifecycle 不会关闭 Question、写 AITP 或完成
  Goal；REST、WebSocket、SDK、klient、TUI 与 Web 使用同一版本化投影。
  S4 又增加 checkpointed、Hakimi-local 的 `collaborative | dreaming`
  planning policy。collaborative 只把完成或修订 Research Plan 所需的关键
  未知量交给既有 `AskUserQuestion` broker；dismiss、空答或含糊答复不改 Plan。
  dreaming 只选择 reversible、low-cost、in-scope 的默认项，并逐项记录进
  `ResearchPlanV2.assumptions`。两种策略都不能越过昂贵/不可逆动作、tool
  permission、科学约定歧义、Goal/scope 变化或 AITP/human gate。策略切换本身
  不写 AITP；snapshot、模型注入、REST、WebSocket、SDK、klient、TUI 与 Web
  使用同一 revisioned 状态。S5 再新增 Hakimi-local、revisioned 的
  Research Line→AITP workstream 显式 binding。它需要已观测 Topic 与
  user/main-agent confirmation，不从 slug/text/path/ID 推断；maintenance 和
  checkpoint 只使用当前精确 confirmed binding。unbound 或 stale Line 可做
  低风险本地探索，但不能 scoped durable commit；换绑必须先 clear。
  REST、WebSocket、SDK、klient、TUI 与 Web 使用同一 snapshot；未增加
  AITP CLI/schema/backfill/registry。该程序当前 S0–S10 已验收并关闭。S8 将
  same-turn handoff 的最新精确 checkpoint/Entry 结果作为可选
  `hakimi/research-distillation-attention-0.1` 投影同步到 REST、WebSocket、
  SDK、klient、TUI 与 Web；它只区分 `review_requested` 与
  `handoff_unavailable`，不表示 trigger、card、trial、review completion、
  approval 或 publication。该 receipt 无 public mutation、retry、scheduler
  或 H6b recovery 语义。S9 又用真实 ABACUS job-1097 packet 完成 bounded
  revalidation、exact-workstream atomic AITP commit、失败/恢复/no-delta retry、
  单 observation 的条件性 no-card review，以及 REST/WS/SDK/klient/TUI/Web
  同一投影核验。scoped check clean 仍不等于全库健康；当前 Board 不单独公开
  `outside_scope` counts，该 additive schema 选项保持 `planned / unavailable`。
  S10 的完整测试、typecheck、build、CLI/contract/fixture、资产和跨仓门禁已
  重跑；只复现既有非 Research 基线失败。真实使用没有提供足以冻结 native
  crash/recovery contract 的证据，因此 H6b 保持 `planned / unavailable`，不在
  本程序中扩展。

## 职责边界（双方已确认；使用前重新核对）

- AITP = 协议、持久化、证据权威。接口是 **CLI + files**；无 SDK、API server、
  MCP server、daemon、vector service。
- Hakimi = agent 编排、工具调用、web 检索、PDF 阅读、推理、私有缓存。理论物理领域规程通过可选的 `theory-physics` plugin 提供；它只约束通用 Research Loop 的行动路由、推导/数值证据检查和人类交互，不创建第二套 runtime、账本、文献库或 HPC observer。
  私有缓存**永不写回** AITP。
- Hakimi 不复制 AITP runtime/parser/validator，不写 `.aitp` canonical 文件
  （`entries/`、`notes/`、`TOPIC.md`、`STORE.toml`），不绕过
  `record/note prepare|save`。AITP 0.8 的 `method-observation` marker 和
  method-card distillation 规则属于 AITP Skill 语义，Hakimi native
  coordinator（H6b/C6）若实现也不复制这些语义，只做编排和交互。

## 分阶段计划（Hakimi 侧；AITP 侧对应 roadmap gates）

| Phase | AITP 前置 | Hakimi 工作 |
|---|---|---|
| H0 | 现在（无 gate） | launcher adapter（argv-only、Python ≥ 3.11 探测）、未版本化 envelope 的严格 shape 校验、`--help` capability 探测、`enter` lifecycle、prepare→fill→save 流程、`not_initialized` 优雅降级、tree-hash 零写入测试 — **implemented-in-code** |
| H1 | M1a gate（已通过） | feature-detect `aitp/enter-0.2`、`aitp/list-0.1`、`aitp/show-0.1` 并做 schema dispatch；Note-age 信号；当前状态维护不等于 session-end closeout；官方 0.8.0 fixtures 的本地 parser/contract 兼容测试，以及 2026-08-29 managed CLI scratch-store smoke test — **implemented-in-code；完整跨平台及异常矩阵 conformance-pending** |
| H2 | M1b-R1 gate（已通过） | 只整合 R1 实际发布的 `aitp check`（解析 `check-report-0.1`，exit 0/1 报告、exit 2 错误包）；`aitp/lite-entry-0.2`（`based_on`、typed closures）、派生 `used_by`、pointer bundle 均未发布（deferred），不得安排 — **implemented-in-code** |
| H3 | M1c gate（已通过） | 整合 M1c scoped contracts：仅传入单次 `--workstream <slug>` 时 feature-detect `aitp/enter-0.3`/`aitp/list-0.2`（严格 exact membership、relation 先全局计算）；无 flag 时保持旧 schema — **implemented-in-code** |
| H4 | M1d gate（已通过） | 整合 M1d scoped `check`：仅传入单次 `--workstream <slug>` 时 feature-detect `aitp/check-report-0.2`（0.1 payload + additive `workstream`/`counts.by_code`/`counts.outside_scope`；admitted in-scope 计数，不与 0.1 直接比较；scoped `clean` ≠ 全库健康；四行文本仅人阅）；无 flag 时 `check-report-0.1` 字节不变 — **implemented-in-code** |
| H5 | M1e gate（已通过） | AITP upstream 已 shipped `backfill` 与 `aitp/backfill-0.1`、`sha256-once:`/policy 语义；Hakimi adapter 仅把 check finding code 作为 opaque string 投影，不暴露、不调用、不解析 backfill 成功 envelope，也不实现这些语义 — **部分集成；conformance-pending** |
| H6b | reviewed adapter-contract extension（planned，尚未冻结） | native method-distillation orchestration：Session-scope coordinator、candidate/proposal lifecycle、human question + decision write、crash/resume；当前 **planned，unavailable**。详见 [`method-distillation-orchestration.md`](method-distillation-orchestration.md)。前置：H0–H5 全部落地 + reviewed adapter-contract extension 冻结 marker discovery/exact-card trial/decision receipt |
| 正式 Hakimi contract | M4 后 | versioned `--json` + extended golden fixtures 作为任何 agent 集成的 pass gate |

Hakimi 的 research-loop 能力（web/PDF/推理/session UX/私有缓存）独立于所有
AITP gates，可随时并行推进。

## 维护契约（binding）

以下任一变化必须在**同一 change** 更新本目录：

- stage 状态翻转（M0.6 gate、M1a gate、M1b gate、M1c/M1d/M1e slice gates、M2–M4）；
- CLI 面变化（新增/移除命令或 flag；`--help` 输出）；
- schema 状态变化（新冻结 payload/文件 schema、版本 bump）；
- Hakimi 侧集成发现改变矩阵行或红线。

同时同步根 `README.md` / `README.zh-CN.md` 的兼容状态段落（简版）。AITP
side 的对应维护契约在 AITP 仓库 `docs/hakimi/README.md`。

## 阅读顺序

1. AITP 仓库 `AGENTS.md`、`README.md`、`docs/roadmap.md`（stage 表、M1a、
   M1b、Hakimi contract）；
2. AITP 仓库 `docs/hakimi/compatibility-matrix.md`（对方侧决策与假设核对）；
3. 本目录 `compatibility-matrix.md` 与 `TRACKING.md`；
4. 本目录 `theory-physics-collaborator-program.md`（面向最终用户体验的前向总纲与
   一次一个 Goal 的实施顺序）；
5. 本目录 `theory-research-agent-design.md`（设计备忘录；H0–H4 已实现，H5 部分集成，H6b 未实现）；
6. AITP `docs/archive/m1a-spec.md`、`docs/m1b-spec.md`、
   `docs/archive/m1c-workstreams-spec.md`、
   `docs/archive/m1d-workstream-health-spec.md`、
   `docs/archive/m1e-evidence-lifecycle-backfill-spec.md`、
   `docs/archive/collaborator-design.md`；
7. 已安装插件的 `skills/using-aitp/SKILL.md`（Python 探测顺序、命令表）；
8. AITP runtime：`plugins/aitp-research-protocol/scripts/aitp.py` +
   `scripts/vendor/aitp/`；
9. 本仓库 `AGENTS.md` / `README.md` / 架构代码（`packages/agent-core-v2/src/features/aitpResearch/`）。
