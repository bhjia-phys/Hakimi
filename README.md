# Hakimi

Current delivery status (2026-09-10): the verified CLI 0.21.0 core and Web package
are installed locally with AITP 0.10.0 / adapter contract 0.3. A new synthetic
daily session reports ready with Python 3.12 and no Goal; installed main, search
worker and Web assets match the isolated package. The finite G1–G7 delivery is
complete: task-dependency source has passed finite Agent/nested/Swarm model
checks, and compaction recovery passed after two preserved upstream failures.
The updated package was installed and restarted after 225 sessions were confirmed
idle; a new synthetic session loads AITP 0.10.0/contract 0.3 ready with no Goal.
Legacy plan reminders now
compare their displayed meaning rather than revision counters (42 targeted tests
pass); that reminder change is also installed. Context and cross-end coverage
and explicit old/new Note history recall are recorded in the
[acceptance report](docs/aitp/lean-harness-live-acceptance.zh-CN.md).
This does not establish production scientific correctness, universal recall or
OS isolation. Older dated pending notes below are historical.

Web source now recognizes adapter contract 0.3 for checkpoint-write capability;
unknown versions remain unavailable. Canonical assets and isolated browser checks
now pass. Board and Manager explain explicit versus unknown Goal dependencies;
resolved decisions remain history. These changes are locally installed.

Research guidance now condenses repeated planning/recording instructions while
retaining scope, no-delta/no-write, recovery and explicit human-answer boundaries.
This prompt update is part of the daily installed build.
Decision-tool receipts no longer prescribe a new Action to resume independent work.
CreateGoal/GetGoal now expose the existing Goal ID so explicit decision dependencies
can be declared without guessing; isolated live dependency/independent-Goal acceptance passed.

Research collaborator completion/failure can now be recovered from the existing
durable event journal after a server restart. The projection reuses the journal
open pass; unfinished historical agents are not revived as running. A real
isolated nested A/B session passed cold REST and Web recovery; it is now installed,
while the remaining acceptance cases are still pending.
Started/completed/failed events now carry the existing mirror runId, allowing
server projections to reject an earlier execution's late result after agent reuse.
Legacy reused agents without execution identity remain uncertain. Web live events
now match runId, seeded from optional snapshot run_id on reconnect. Actual isolated
agent reuse and subsequent cold REST/Web recovery passed; the same implementation is installed.

Foreground Line summaries now exclude progress and recent-change text owned by
a retained Action on another Line, including next-step derivation. Switching
back restores that projection; raw historical records are unchanged.

Long-term planning uses scoped AITP Notes without a Goal, Plan activation, or
Action ceremony. A direct Note draft is not invalidated by Question edits and
does not reread the Question's entire evidence list. AITP still validates the
draft's actual references and atomic Topic/workstream preconditions. Legacy
Plan v2 APIs retain their original contract; they are not the normal planning path.

Memory refresh now reuses an aligned, ready scoped receipt for less than 30 seconds,
independently of local UI revisions. Adapter save attempts invalidate this cache;
explicit refresh remains available for known external changes. This is bounded
read reuse, not a filesystem watcher or a replacement for atomic save checks.
Final installed-session acceptance is still pending.

Unrecorded local conclusions no longer lock Line browsing. Their original
evidence/context are retained across switching and restore, without automatic
adoption into the newly selected workstream. This implementation is installed.

Line switching now retains live actions and recorded runs instead of requiring
completion or cancellation. Foreground action/run projections stay Line-scoped;
late run results retain their original identity. This is installed code, not proof
of all multi-direction acceptance cases.

A pending checkpoint no longer locks foreground Line selection. Browsing retains
its captured ownership (or legacy unknown ownership), never retargets its save,
and late old-scope observations do not prepare a record for the new Line.
Live-action/run and in-flight Note switching remain under review.

Pending human decisions no longer prevent switching Research Lines, and switching
retains the decision rather than clearing it. Goal dependencies remain effective;
unknown legacy dependencies are not inferred or resolved. Existing in-flight
write/live-action switching restrictions are still being disentangled.

Human decisions can name dependent Goal IDs. Only those Goals are held; missing
legacy dependencies remain unknown and conservative, never auto-resolved. This
Goal dependency judgment also drives the Board's stop conditions; decisions for
other Goals remain visible attention, not a stop condition for this Goal.
This does not grant execution permissions. Task-level dependency and Board refinements
are still in progress; Goal-level changes are installed, task-level support is not complete.

AITP adapter source supports contract-0.3 atomic Note saves using captured
Topic/workstream scope. Legacy reads remain supported; scoped Note writes do not
silently downgrade to older contracts. Paired installation passed; full acceptance remains pending.

Research organization no longer grants permission to run ordinary tools: reads,
shell commands and delegation do not require an Action/phase lease. Existing tool
permissions and workspace protections still apply; Research Mode grants no extra
Git, filesystem or remote-execution authority.

Context efficiency fix: builtin coder/explore agents no longer start an
extra model turn merely because a handoff is shorter than 200 characters. Explicit
custom-profile summary policies remain supported. Isolated installed-session tests
have exercised nested Research delegation; full acceptance remains incomplete.

Resuming an existing Agent no longer requires a new Research Action. The Agent tool
retains ownership, idle-state and immutable task-scope checks, and restores a known
owned cold agent through the existing lifecycle replay. Unknown/foreign identities
are rejected before materialization; ordinary permissions still apply.

Task records now retain optional parent-agent identity through REST, WebSocket
roster snapshots and Web task data. This is display provenance, not permission;
missing legacy parentage remains unknown. Session snapshots expose persisted
`agent_relationships` independently of live task status, including after a server
restart. The Board now combines these relationships with current session tasks in
a collapsed collaborator tree; browsing a Line filters the tree without changing
execution ownership. Missing task status stays unknown. Component-level light/dark
checks and an isolated installed Web two-Line/nested-agent browse test passed.
This does not certify all recovery/write scenarios or replace the daily installation.

Klient task parsing and SDK public agent-task types also retain optional
`taskScope` / `parentAgentId`; old tasks need neither field. This is provenance,
not an AITP binding or execution permission.

Source-only collaboration work (2026-09-09): the Agent tool accepts an optional
`task_scope` ownership label, inherits a caller's saved label for new agents,
and rejects changing it on resume. Task records, REST/WS and Web data preserve it.
This grants no permissions or AITP binding. Agent result headers identify runtime
ownership/status; child summaries report findings, not authoritative task metadata.
Task completion does not certify scientific correctness.
Main-agent Research delegation can use `research-line:<existing slug>` without a
new Action; unknown Lines are rejected and normal tool permissions still apply.
Nested cross-direction validation, task-tree projection and end-to-end acceptance remain
in progress; see [the implementation plan](docs/aitp/research-mode-lean-harness-plan.zh-CN.md).

Source-only: the four native AITP read tools now use existing low-risk default approval. Explicit deny/ask rules and Research/adapter guards remain; writes are excluded. Real GW routing and isolated source-server no-approval reads passed; release installation and overall acceptance remain incomplete. See the [acceptance log](docs/aitp/lean-harness-live-acceptance.zh-CN.md).

Single-line follow-up: `GetResearchStatus` and `ReadResearchCheckpointEvidence` use low-risk default approval, preserving explicit deny/ask rules, checkpoint freshness and path restrictions. This change is locally installed; status reads and a three-file evidence batch passed without approval after reloading the isolated test service. User sessions were not restarted. Research mutations retain normal permissions. Follow-ups clarify that simple actions must not reuse another action's generated minimal plan as a Research Plan binding, and accept equivalent workspace-absolute paths for the exact prepared draft without granting writes to other drafts. These follow-ups are installed and loaded in the isolated service: a new simple action started successfully, while absolute draft access still awaits live retesting. See [single-line acceptance](docs/aitp/crpa-single-line-live-acceptance.zh-CN.md).

Source-only Todo reminder refinement: the shared main-agent list is no longer automatically injected into delegated agents; empty/completed or already-reminded unchanged lists produce no repeated reminder. Explicit Todo access and permissions are unchanged.

Native AITP read guidance now recommends fresh-report reuse and explicit workstream scope rather than mandatory start/end calls. Findings constrain affected evidence, not independent research; post-save verification and exit-2 uncertainty remain. This description-only follow-up is not yet installed; raw report sizes and live relay retries remain under investigation.

Source follow-up: native enter/check JSON now places existing summary fields before large arrays. Oversized results retain the complete original fields in the existing persisted output file; this changes field order, not schemas or findings. Real-report replay shows counts and the latest Working Note pointer in the 2,000-character preview. Total report size is unchanged; live efficiency acceptance is pending.

Plan reminders in source now follow mode/path changes and context loss, rather than periodically repeating full instructions. Request tests cover unchanged turns and compaction recovery; Plan execution/review guards are unchanged. Not yet installed.

Source-only maintenance refinement: automatic orientation alone no longer triggers an AITP refresh. Post-commit distillation normally sends a compact relevance reminder, loading the full external Skill only on demand; a shadowed Skill name retains exact plugin loading. This is not automatic card approval or publication, and live acceptance is pending.

Source-only cross-Line browsing: `GetResearchStatus({line_slug: "existing-line"})` returns a read-only scoped overview without switching execution focus or moving task/checkpoint ownership. Web Board now has a local browse selector and foreign-progress filtering; isolated browser interaction/light-dark checks and reproducibility of 521 release assets pass. Other client integration and real-task acceptance remain unfinished. Not installed.

Research Mode simplification and request-context deduplication: [bounded implementation plan](docs/aitp/research-mode-lean-harness-plan.zh-CN.md). Authorized work in progress, not a completed capability.

Latest source-only redesign supersedes the observation-only scope below: Research actions and capability labels no longer authorize ordinary tools; normal permission checks remain. Entry/Note draft preparation no longer requires an Action. Research guidance now treats planning as proportional, recording as durable-change-driven, and memory outages as local persistence concerns rather than Goal stops. The authorized AITP 0.10.0/contract-0.3 atomic Note Topic/workstream save is implemented; targeted draft-ownership, retry and indeterminate-receipt tests pass. The isolated source service supports it, but daily installation and full end-to-end acceptance remain pending; do not treat the current source as a delivered release.

The current source deduplicates unchanged Research reminders across turns and separates full Goal instructions from compact usage updates. Research context retains scope and continuation information without repeating the Goal objective. Request-chain and recovery tests cover this slice; it has not yet been reinstalled or fully accepted.

Pending-evidence notices now refresh when their candidate appears, changes identity or disappears, without reinjecting for revision-only changes. This latest source fix has targeted tests; installed acceptance is still pending. Reminder updates do not create execution gates or resolve human decisions.

Visible human-decision text and resolution changes also refresh without requiring a Goal or phase transition; decisions belonging to an unrelated action stay outside the current context. This is reminder synchronization, not a change to Goal dependency or approval semantics.

Adapter-degraded alerts now describe affected persistence without claiming that independent work or generic Goal continuation/completion is disabled. Unsaved findings and explicit workstream ownership still require proper recovery; real human decisions are unchanged.

Selecting a Research Line no longer requires an idle phase when no live work or unresolved ownership is present. Existing pending-save, live-action/run and unresolved-human-decision protections remain; phase labels alone are not a reason to manufacture or conclude an action. This latest source fix awaits installed replay.

Source-only TUI follow-up: compact scientific Next no longer forces local-conclusion adoption or historical Action/phase recovery. Record maintenance remains visible separately and expanded details preserve recorded provenance. This does not resolve a human decision or change a running Goal.

Source-only observation simplification: ordinary file/literature reads and existing task status/output queries no longer require a Research action or phase. Single literal scheduler queries and log reads, optionally over SSH, also bypass Research action checks. Normal execution permissions still apply; general Bash scripts, writes, unknown MCP tools and canonical persistence gain no observation privileges. This is not OS isolation; live acceptance remains unfinished.

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi terminal welcome screen with a pixel cat-ear exploration spacecraft" />
</p>

<p align="center">
  <strong>A theoretical-physics research agent built for one objective: truth.</strong><br />
  <span>Truth is the objective. Evidence is the boundary. Reproducibility is the test.</span>
</p>

<p align="center">
  <a href="README.zh-CN.md">中文</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">Repository</a> |
  <a href="docs/en/guides/getting-started.md">User manual</a> |
  <a href="LICENSE">License</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Why Hakimi

Hakimi is not a machine for producing one-shot answers. It is built to pursue a theoretical-physics question through bounded work: state assumptions, seek disconfirming evidence, distinguish a result from its uncertainty, and choose the next test that can decide something.

Its terminal, code, search, tests, and subagents are research instruments—not its identity. Hakimi does not optimize for busywork or engineering complexity. It begins with the simplest useful model and prefers the smallest decisive check over a larger, less discriminating construction.

## The research loop

```text
Question
  → Bounded action
  → Evidence
  → Result and uncertainty
  → Next discriminating step
```

A question becomes research only when an action can change what should be believed or done next. Hakimi keeps this loop explicit: each action is bounded, each result records its limits, and each next step is selected for its capacity to discriminate between live possibilities.

## What is implemented

- **Research surfaces:** TUI and Web provide a Research Board and Research Manager for following and steering active work.
- **Research structure:** Research Lines, Questions, and Focus make the current unknown, assumptions, and priorities visible.
- **Bounded actions:** `BeginResearchAction` and `ConcludeResearchAction` frame scientific work with an outcome, limitations, a next step, and one explicit durability assessment. No durable delta performs no ledger persistence; a bound durable delta emits one typed pending candidate for the existing AITP commit barrier. An unbound result closes the Action and remains a local conclusion, not an AITP record, until the researcher explicitly confirms its ownership. Explicit recovery through `ProposeResearchCheckpoint` requires that retained conclusion ID, `confirmed_by=user`, and a freshly read current Research revision together; ordinary checkpoint proposals remain unchanged.
- **Science-first progress:** progress is organized around evidence and uncertainty rather than tool activity or transcript volume.
- **Review and human control:** human gates and alerts support explicit judgment, while typed child-evidence review keeps delegated work inspectable.
- **External-compute observations:** Hakimi can record structured observations about externally run HPC work while keeping scheduler state separate from scientific evidence. It does not schedule jobs, poll them to completion, or certify success. Goal is the sole owner of cross-turn continuation.

## Theory-physics discipline

The optional `theory-physics` domain pack is the upper-layer handbook for sustained theoretical-physics research. It supports discussing uncertainty, retrieving relevant recorded evidence, and carrying out owned literature or derivation work before a candidate is clear. A scientific loop may span several bounded Actions and turns; a Goal is optional, a local reviewed plan serves a complex Action, and Research Plan guides milestone strategy. Existing AITP knowledge can be read on demand without a new durable delta. Durable records and conditional method review remain governed by the external `using-aitp` and `distilling-methods` skills, not a second Hakimi protocol.

Theory Physics 0.2.5 is locally installed: existing-job queries stay separate from new calculations or build audits, and receipts do not become structured Runs. Failure diagnosis follows recorded evidence locations before wider searches, preserves causal logs and measurements, and names missing observables when inconclusive. Touched-Entry review checks applicability before optional harvesting. Plugin installation/discovery and managed-file verification pass. A real unchanged-job query completed without ledger writes or extra scans; a supervised Si evidence correction reached scoped save/commit and Question update without a new calculation or Method card. The correction still needed draft repair and lengthy model responses; faster or autonomous behavior and five-subject acceptance remain unproven. No new gate, tool, scheduler or AITP rule.

An ordinary one-off physics answer does not need Research Mode. The pack is a discipline, not an oracle: it is not a literature database, physics-correctness service, scheduler, second runtime, ledger, or background autonomous loop. The researcher remains responsible for conventions, significance, and final scientific judgment; AITP remains the protocol authority.

## Evidence before confidence

Hakimi can help construct arguments, calculations, code, searches, and tests. None of these alone authenticates a physical claim. Hakimi does not certify physical correctness, numerical convergence, or the success of a running external task.

Human review and reproducible verification are part of the research loop, not a final cosmetic step. When the evidence is insufficient or conflicts, the honest result is uncertainty, a blocked question, or a smaller discriminating check.

## Research Mode and AITP

AITP research-memory guidance (2026-09-08; locally installed/reloaded):
the external `using-aitp` Skill adds an on-demand guide for scoped synthesis plus
uncovered evidence, low-noise Entry/Note writes, and preserved history. Note
template prompts and existing contract descriptions change; runtime, CLI and
schemas do not. The original Si session read the new guide, recovered same-line
evidence and saved one Working Note, leaving old records and other scopes intact.
Acceptance is partial: instruction-read admission, revision ambiguity and more
precise Entry citations remain open; relay failures prevented the queued citation
correction. No harness change or autonomous-efficiency claim is implied. See
[handoff](docs/aitp/README.md#research-memory-guidance) for delivery boundaries.

Scoped Note retrieval follow-up (2026-09-07; locally installed, cold reads verified):
when needed Note content has no scoped locator, existing Research guidance points
to a single `aitp_enter` using the confirmed workstream, then the exact returned
Working Note path. File-list order is not research ownership. This adds no health
cycle, write trigger or public schema. Five-session cold reads preserve research
state and scope; real context delivery is verified, not autonomous selection.
An explicitly requested Si stage synthesis also saved a scoped Working Note from
existing evidence without changing other subjects or declaring the failure solved.
Subsequent supervised rebuttal saved one scope-correct diagnostic result; synthetic
checks do not reproduce the Si failure. A success-only checkpoint response now
identifies completed native verification to avoid repeating it, while preserving
needed evidence reads and separate Note/candidate checks. Targeted regressions
pass; local CLI/Web/PTY delivery and five-session cold reads are verified.
Whether real model behavior stops repeating checks remains unproven.
See the [handoff](docs/aitp/README.md#scoped-note-retrieval).

Focus disclosure follow-up (2026-09-07; locally installed, read-only model replay passed): the
default `GetResearchStatus` summary keeps the selected Question and Focus revision
but omits captured `boundedAction` text that may describe an old task. Current
guidance remains `effectiveNextStep`; full diagnostics and public snapshots retain
the original Focus. This does not rewrite intent, compare unrelated revisions,
change scientific state, or resume a Goal. Five-session cold reads and one real
status-only answer preserve scope and records; broader model behavior is not
guaranteed. See the [handoff](docs/aitp/README.md#focus-intent-disclosure).

Line-return focus (2026-09-07; locally installed and replayed): a settled
Line switch restores its last open/active/blocked Question only when the archived
period captured the same Topic observation. It uses the Question's current next
step, not old action state. Unknown/changed scope, closed/deferred/cancelled
Questions and a latest unfocused period stay unfocused. No AITP writes, binding
confirmation or Goal resumption; public snapshot shapes are unchanged.

Research status disclosure (2026-09-07; locally installed and replayed): `GetResearchStatus`
summarizes repeated check receipts by default; `detail="full"` preserves the
complete diagnostic output. Scientific fields, blockers, recovery identity and
public Research snapshots are unchanged. On one real snapshot, output shrank
from 234,426 to 45,577 characters; this is a size measurement, not a speed or
scientific-quality claim. The real tool returned the complete summary; a supervised
Question-synthesis follow-up added the original evidence and remaining gaps without
resaving or resuming the Goal. Automatic synthesis is not guaranteed.

Non-agent checkpoint recovery follow-up (2026-09-07; locally installed and replayed):
Hakimi now compares the saved creator to AITP's actual `agent:unknown` default
when prepare omitted it, instead of expecting the required field to be absent.
15 provenance/prepare tests pass; this does not change record authority or relax
other identity checks. The original NiO observation was accepted on retry without
another save, a new Action, or resuming the paused Goal. This repairs persistence,
not scientific validity or completion of the NiO calculation.

Paused Goal guidance (2026-09-07; locally installed): a bounded question, status check or recovery request can proceed without resuming autonomous Goal continuation. Only an explicit request to resume autonomous pursuit should activate the Goal. One real theory audit now completed its Action, evidence record and Question update with the Goal still paused; this is model guidance, not a runtime intent classifier or general behavioral guarantee.

Post-record review follow-up (locally installed): the existing external-Skill handoff now asks the model to assess the touched evidence before candidate harvesting. An ineligible result should end without extra scans or checks; genuine harvesting still follows all AITP Skill rules. Three handoff tests and CLI/Web/PTY delivery checks pass. One supervised NiO recovery ended with no harvesting or extra checks; this is not general conformance evidence. Oversized status output and stale Question synthesis remain follow-ups in the [handoff](docs/aitp/README.md).

Pending-record prompt follow-up (locally installed, 2026-09-07): evidence-read guidance supplies the exact current checkpoint/revision rather than asking the model to recover numbers from old conversation history. State changes still require refresh; ordinary research receives no additional revision-only context updates. The installed follow-up also explains how to query old submissions without inventing a structured Run; permissions and identity checks are unchanged. Real scientific acceptance remains open; see the [handoff](docs/aitp/README.md).

Recovery follow-up (2026-09-07; locally installed): a concluded result with unchanged, explicitly confirmed original ownership can continue into the existing checkpoint flow after a human decision returns to planning, evaluation or idle. No second acceptance or duplicate conclusion is needed; human decisions, scientific evidence and the chosen return phase remain unchanged. A real session cold-restored into its original pending checkpoint; canonical save and scientific acceptance are separate. See the [current handoff](docs/aitp/README.md).

Locally reinstalled follow-up (2026-09-06, uncommitted source): a standalone **Research On/Off** button is
always available in the top toolbar, replacing the Composer Mode-menu entry.
The session picker directly lists other loaded sessions (including unread ones),
marks the current session, and keeps command errors visible without changing the
authoritative mode. Full-App browser coverage exercises real client navigation,
not just a mocked pane selection. Existing busy/connection and Plan guards remain.
Package version remains `0.21.0`; installed Web assets and isolated Web/PTY startup
match the verified build. Restart existing Web processes when idle and refresh the
browser. No commit or push was performed for this follow-up.

Web Research Mode now opens a deep-space observatory with a temporary navy palette,
static stars, a wireframe planet, orbit-compass marks and instrument-style frames.
Dreaming adds a pale-violet accent variant; the decoration has no moving background
or fictional telemetry. The ordinary sidebar collapses automatically. Leaving Research
restores the saved theme and sidebar preference. The floating, collapsible Board keeps
Project, Current cycle, Attention and Next; its closed launcher still shows the cycle
stage. Locally installed follow-up (2026-09-06, working tree, version 0.21.0): session lists now include compact,
live-only Research mode/Line facts, so several enabled sessions are discoverable
without opening their transcripts. Global activity events refresh each affected
session's overview; full transcript subscriptions remain capped at four. Cold
sessions stay unknown and are never resumed for discovery. Navigation does not
start or pause another session's Goal. **Research sessions** switches between sessions/workspaces without starting,
pausing or resuming scientific work. The previously installed build shows only Research snapshots already observed
by this browser, labels unread sessions explicitly, and offers the ordinary session
browser for older sessions; it is not a complete global active-project index. The existing
Research GET cold-resumes an agent, so the navigator deliberately does not probe every
session. Collaborative/Dreaming uses the existing revision-checked command when idle;
it does not change Goal continuation, tool permissions or human decisions. Closing the
picker with Escape does not interrupt the background turn. Locally installed from
`d23654b61` (package version remains `0.21.0`, no npm release); restart existing Web
processes when idle and refresh the browser. Installed Web assets and PTY startup
were verified; no AITP, SDK or transport contract changes are required.

Goal usage-only updates keep the Research revision stable while still refreshing the Board. Token accounting between a status read and workstream confirmation no longer makes that confirmation stale. Goal control changes and actual Research mutations still invalidate old requests; no binding is inferred or confirmed automatically. Locally installed from `172875fa2`; restart running Hakimi processes to load it. No Goal is automatically resumed. See the [integration handoff](docs/aitp/README.md).

Goal recovery checks the remaining budget before restarting. An exhausted Goal stays blocked and the model is told it was not resumed, without a transient active state or an immediate deadline cancelling its explanation. Existing usage, budget limits and earlier blocker reasons are preserved. Source verification and installation status are tracked in the [bounded recovery fix](docs/aitp/theory-physics-collaborator-program.md#goal-budget-resume-preflight).

Print-mode shutdown now pauses an active Goal and flushes its journal before releasing the runtime, including on SIGINT, SIGTERM and SIGHUP. Already stopped Goals are unchanged; interruption does not complete scientific work or write AITP records. The existing bounded cleanup cannot guarantee persistence after SIGKILL or a stalled storage write. See [non-interactive execution](docs/en/reference/kimi-command.md#non-interactive-execution).

The clean-installed build has passed independent-process signal tests and native PTY verification. This verifies shutdown persistence, not completion of cross-turn scientific acceptance; see the [delivery evidence](docs/aitp/theory-physics-collaborator-program.md#print-goal-shutdown).

Interactive SIGTERM shutdown retains its signal handler until Session cleanup finishes, preventing signal helpers from terminating an active turn before its cancellation and Goal pause are saved. Repeated SIGTERM does not skip that cleanup. SIGHUP/dead-terminal emergency exit and SIGKILL are not covered by this guarantee; see the [TUI shutdown verification and delivery status](docs/aitp/theory-physics-collaborator-program.md#tui-sigterm-shutdown).

Native sessions and print mode use the same home as the Hakimi SDK: explicit `homeDir`, then `HAKIMI_HOME`, then legacy `KIMI_CODE_HOME`, then `~/.hakimi`. This fixes a real research acceptance failure where the native engine opened the old Kimi home and could not find the installed AITP contract. No old configuration, plugins, or sessions are migrated or merged; to open a session created in the old home, select that home explicitly. Real-project acceptance and remaining limitations are tracked in the [collaborator program](docs/aitp/theory-physics-collaborator-program.md#1911-g7-首次真实运行与启动目录修复).

AITP discovery also waits for the session Skill catalog during cold restore. Exiting or resetting Research Mode cancels that wait; a late catalog result cannot restore old permissions. A missing/incompatible plugin or failed catalog initialization still reports unavailable, without extra maintenance retries.

Delegated operators do not own the shared AITP lifecycle: restoring or undoing a child agent cannot reset the main researcher's adapter or maintenance state. Research Mode entry and active restore also expose the existing evidence-review, run-observation, and historical-checkpoint-discard tools to restored tool allowlists. These repairs do not approve evidence or change checkpoint/human-decision semantics.

After a settled conclusion, the next explicit `BeginResearchAction` can start directly from `state_updated`; no extra phase-setting, Focus edit, or duplicate progress report is required. A pending checkpoint, live action/run, unresolved human gate, or stale plan still prevents replacement. This repairs action continuation, not scientific judgment or automatic Goal scheduling.

For a retained unbound result, the Board shows the actual outcome instead of leaving completed work labelled running. Fresh agent conclusions recover automatically after the original Line's first explicit workstream confirmation; ambiguous ownership still needs explicit recovery. The pending checkpoint can inspect one existing evidence file through `ReadResearchCheckpointEvidence`, without Bash hashing. After persistence, a new observation Action can explicitly retain the same external Run with `observed_run_action_id`, preserving its submission identity. AITP save, scientific decisions, normal tool permissions and Goal lifecycle remain separate. These recovery changes are locally installed as CLI 0.21.0; real Si submission persistence and a fresh bounded query have run. Retained structured-Run recovery is regression-tested, not yet demonstrated by that receipt-only session. No scheduler or automatic job submission is added. See [recovery details](docs/en/guides/research-mode.md#retained-local-conclusions).

The retained-result fix was installed from commit `06b8524102df` and verified by closing an existing real Heisenberg Action without repeating its calculation, followed by cold restore. This does not yet establish bound AITP persistence or automatic Goal research; [the acceptance record](docs/aitp/theory-physics-collaborator-program.md#1923-本地结论交付与原会话恢复验收) distinguishes those remaining checks and a model attribution error.

The run-observation recovery fix is delivered and locally installed: a closed Action can record a fresh observation of its existing external job without reopening the Action or changing its conclusion. This grants no polling or new-work permission. The [bounded recovery slice](docs/aitp/theory-physics-collaborator-program.md#retained-run-recovery) records the installed CLI restart and WebSocket checks; these are fixture tests, not scientific or Goal-continuation acceptance.

Research Mode is discoverable by default, but every new session starts inactive. For sustained work, `theory-physics` can guide the model to call `EnterAITPMode`, wait for authoritative probe status, and perform a bounded action; inactive sessions perform zero AITP I/O. The Research Board and model context distinguish the Hakimi Goal, the observed AITP Program (including its top-level **Research goal**), and the Local Research Loop. Hakimi observes that top-level goal only through AITP `enter`; it never writes `TOPIC.md` or an AITP Topic. A Goal-to-Program alignment is a local, checkpointed binding that the user explicitly confirms rather than a text-similarity inference. In the current lightweight source redesign, a missing, stale, or conflicting binding limits the associated memory operation, not independent Goal completion or continuation. Unresolved human decisions remain protected. Entering Research Mode does not schedule model turns—Goal alone owns cross-turn continuation, while Plan is only a short-lived action overlay. Interactive Research still works without a Goal. The compact TUI/Web Board uses four slots—Project, Current cycle, Attention, and Next—and labels the legacy period counter as Research turns; healthy AITP/provenance stays in expanded detail. A settled `state_updated` cycle can switch Lines directly, archiving the old period and returning to `idle` without an AITP write; live work, pending persistence, unresolved human gates and other non-idle phases still block switching. Another Line's alerts never appear as current attention. The default Goal engine exposes derived `idle`/`deciding`/`enqueued`/`running`/`held`/`waiting` continuation state, so an active Goal held by Research policy is shown as `active · continuation held` with its owner and reason instead of being confused with a paused Goal. Legacy snapshots without that optional field are labelled unavailable, and multi-Line Board state remains scoped to the selected Line. Every admitted Research turn performs one deterministic local reconciliation before model context is injected, so mechanically recoverable Line/Action/phase/period/cursor drift is repaired before the answer; this does not run another AITP maintenance cycle or infer scientific outcomes. A historical checkpoint is discarded automatically only when Hakimi can prove that no save receipt, committed Entry, or committed-history trace exists and its captured Question or Program binding is stale; any ambiguous checkpoint remains blocked for explicit recovery. Replay repairs only deterministic Action/phase structure: historical actions remain unchanged until evidence-based reconciliation, but do not block independent tools or Goal completion. Completing a Research Plan does not require flushing pending memory, and never commits that memory or completes the Goal.

In the paragraph above, “Plan” means the short-lived Action-local Plan/Todo. The revisioned Research Plan is the multi-turn scientific strategy; it may evolve with evidence but still does not own continuation or complete the Goal. A reviewed local Action Plan can execute without creating a Goal or full Research Plan. If a draft or active Research Plan already exists, a planned action must bind its active milestone as well as the reviewed local plan; partial or stale bindings still fail closed. A simple check may also explicitly bind the active milestone without a detailed local Action Plan. Omitting that association remains valid; it is never inferred. The fix is clean-installed and verified through the installed CLI's REST/WS surface and process restart; this software fixture is not real-model scientific acceptance. See the [milestone-binding evidence](docs/aitp/theory-physics-collaborator-program.md#simple-action-milestone).

The compact Board puts the selected Line, scientific objective or milestone, and current work ahead of bookkeeping. A live Action's purpose stays visible alongside its running job; explicitly foreign Action/run metadata stays out of the selected Line, including legacy single-Line views. Turn counts and classified historical failures remain in expanded audit detail; they are not scientific progress or current blockers. A concluded action with no pending checkpoint shows “Next / ready”, and an explicit Goal wait shows “Waiting”. Research context does not repeat a full brief solely because budget counters or internal revisions changed; meaningful scope, completion, continuation, and budget-limit changes still refresh it. These presentation fixes are one part of the [collaborator program](docs/aitp/theory-physics-collaborator-program.md), not acceptance of the entire research workflow.

Research collaboration policy and tool permission are orthogonal. `collaborative` asks the researcher only when a consequential unknown would change the Research Plan. `dreaming` means that, once the Goal, scope, and completion criterion are clear, Hakimi records reversible, low-cost, in-scope assumptions and lets Goal-owned continuation keep the project moving without per-step confirmation. Both still stop for changes to the Goal or scope, ambiguous scientific conventions that affect the claim, expensive or irreversible actions, and AITP or other human decisions. `auto` controls routine tool-risk confirmations only; combining Goal + `dreaming` + `auto` therefore enables autonomous research inside the agreed scientific and operational boundary without granting new scientific authority.

Action ownership is executor-enforced whenever Research Mode is active; no experimental switch is required. Model-initiated research tools require one fresh, in-progress bounded Action and one explicitly granted capability, while control/recovery operations and exact checkpoint-draft persistence have narrower separate leases. A rejected `BeginResearchAction` cannot be followed by unowned Web, workspace, shell, subagent, scheduler, or unknown plugin/MCP work, and beginning an Action cannot share the same tool batch with that work. This is a Tool Executor policy, not OS-level isolation: a granted shell capability is still broad and remains subject to the normal permission system and host sandbox.

A Research Line and an AITP workstream are also separate identities. After Hakimi observes the current Topic, the user or main agent must explicitly confirm a revisioned local Line-to-workstream binding; matching slugs, text, paths, or IDs never imply membership. Each confirmation has a server-owned opaque identity, and clear must compare both that identity and the non-rewinding public Research revision. Unbound, unavailable, stale, or conflicting Lines may continue low-risk local exploration, but scoped maintenance and Hakimi checkpoint adoption require the exact confirmed binding. Hakimi re-observes the unscoped Topic before scoped maintenance and checkpoint writes, while the post-save commit barrier verifies the captured Topic and exactly one captured workstream. Checkpoint-bound saves require AITP 0.9.0 adapter-contract 0.2: Hakimi supplies the captured Topic and exact singleton workstream to atomic `record save`, so a mismatch creates no canonical Entry; post-save `show` and scoped `check` remain defense in depth. The expanded Board reports read readiness separately from scoped checkpoint-write capability, so a ready 0.1 adapter is never presented as atomic-write capable. Rebinding requires an explicit clear first, and undo or cold restore revalidates the stored Topic and observed revision instead of repairing the binding automatically. The same binding and typed durable-candidate state is projected through REST, WebSocket, Node SDK, klient, TUI, and Web.

[AITP](docs/aitp/) is an optional external durable-evidence ledger, used through its CLI and files. It is not a second Hakimi runtime or database. After `ConcludeResearchAction`, Hakimi can route one assessed durable delta through the existing prepare/fill/save/show/checkpoint path; a no-delta conclusion schedules no persistence or distillation work, and human assertions or decisions remain separate from agent/tool/source verification. After the first successful commit of a new checkpoint, Hakimi makes one same-turn, best-effort handoff of only that touched Entry to the exact external `distilling-methods` Skill. A duplicate commit or unavailable Skill is a non-blocking no-op, and the external Skill alone decides whether the evidence meets an existing trigger. The Research snapshot can show only that the latest exact handoff was requested or unavailable; it never claims a trigger, card, trial, completed review, approval, or publication. Hakimi does not parse markers, create or revise cards on its own, approve or publish them, auto-initialize/adopt/backfill workspaces, add `/research goal`, introduce a workstream registry, or provide the planned native H6b coordinator. Hakimi-local Goal–Program and Line–workstream bindings never write AITP. When AITP is unavailable, Research Mode reports a degraded state and blocks durable writes, checkpoints, and completion of an active Research Goal. Detailed compatibility and operating boundaries are maintained in the [AITP documentation](docs/aitp/).

Post-commit Note review keeps the verified source Line/Topic/workstream confirmation and rechecks it at actual Note-tool execution. Switching Line, rebinding, losing readiness, undo, or restore cannot reuse an old draft's write permission. A restored review marker alone remains read-only. Stage synthesis and interrupted review can use a fresh bounded Note Action: the host verifies the selected Question evidence through canonical Entry reads before preparing or saving a new draft, without requiring a fabricated scientific delta. This local protection is not AITP's atomic Entry compare-and-save and adds no automatic card approval, publication, or distillation coordinator.

When AITP is degraded, user-directed Research turns may still perform provisional exploration inside a fresh bounded Action with the normal scope and permission checks. Automatic Goal work, AITP writes and Goal completion remain held. A new result or failure with confirmed record ownership stays a local pending candidate until recovery; it is not silently reclassified as no-delta. This fixes the conflict between allowing local Research actions and refusing all their work tools.

Opening Research Mode within a user turn now starts its Research context and one local boundary as entry settles, without requiring another prompt. Pause/exit revokes admission; mode recovery never grants autonomous Goal continuation.

Saving evidence does not itself update the scientific Question. Durable-action guidance finishes the captured checkpoint first, then the first successful commit prompts conditional synthesis for the still-current Question: assessment, relevant evidence, remaining unknowns, and next action. Duplicate commits or changed context do not repeat that targeted prompt. The model performs this synthesis through the existing Question tool; receipts never automatically promote scientific confidence or close a Question.

The current Question respects explicit Focus. Without Focus, it can use the foreground Action's explicit Question on the current Line, without setting Focus or guessing ownership. After higher-priority action, run, decision and persistence work settles, the Question's explicit next step takes precedence over historical progress. Snapshot, status and post-commit guidance share that context. See the [Question-context repair and verification status](docs/aitp/theory-physics-collaborator-program.md#question-context-projection).

For a stage Note from existing evidence, the model should settle the Question's canonical evidence references before beginning its Note Action, since Begin captures that revision. The existing context also identifies completed native scoped maintenance when its Topic and confirmed binding match; Skill loading alone does not require another `enter/check`. Evidence review, genuine stale-state refresh, and required save verification remain necessary. These are guidance corrections, not new phases or automatic scientific judgments.

The optional Theory Physics plugin includes a `calculation-operator` agent profile for bounded build, input, numerical and postprocessing work. The main agent supplies the scientific test and scope, reviews the existing typed evidence packet, and owns all Research/AITP mutations. This role is distinct from the `/preset` model-routing pool; it installs no runner or scheduler and provides no OS-level isolation. Real scientific acceptance is tracked separately in the collaborator program.

Theory Physics 0.2.3 exposes delegation guidance directly in the calling researcher's available-agent description: pass the whole task's remaining time and reserve parent review/closeout, then request one saved packet with a brief return or one inline packet. The specialist's detailed instructions remain separate; the caller need not read its full prompt to see these essentials. Requested packet saving and evidence-backed failure reporting remain required: an unattempted write is not proof of a missing tool, and a failed handoff does not erase a numerical result. These are instructions, not a runtime deadline or a guarantee that a model will follow them.

The checkpoint barrier also compares the saved Entry's kind, authority and creator with the concluded candidate before accepting it. A mismatch retains the saved record and receipt for review, leaves the checkpoint pending, and prevents the post-commit distillation handoff. This is a post-save identity check, not a semantic validation or an atomic pre-save authority guarantee. A 2026-09-07 follow-up also verifies the saved idempotency key against the checkpoint using the same canonical `show`; a mismatch must not be bypassed by resaving or editing canonical metadata. This follow-up is regression-tested and locally installed as CLI 0.21.0; cold reads preserve the five real sessions' scope and commit histories without resaving. It changes neither AITP's atomic Topic/workstream contract nor human decisions, and does not establish scientific completion.

## Install from source

Hakimi currently installs from source. Use Node.js 24.15.0 or newer and pnpm 10.33.0:

```sh
git clone https://github.com/bhjia-phys/Hakimi.git
cd Hakimi
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install
pnpm build:packages
pnpm -C apps/kimi-code build
mkdir -p .tmp/dist-pack
pnpm -C apps/kimi-code pack --pack-destination ../../.tmp/dist-pack
npm install -g "$(ls -t ./.tmp/dist-pack/*.tgz | head -n 1)"
hakimi --version
```

`pnpm pack` prints the tarball filename it creates; the command above selects the newest tarball in `.tmp/dist-pack`. To update a source installation, pull the desired revision and repeat the build, pack, and install steps.

Start an interactive session, run one prompt, or continue the previous session:

```sh
hakimi
hakimi -p "Summarize the test failures in this repository."
hakimi -c
```

In an interactive session, toggle Research Mode when the work requires it:

```text
/research
```

Use `/login` to configure an available provider. For DeepSeek setup, run `hakimi provider deepseek`. Login is explicit; Hakimi never begins OAuth login at startup. Configuration, sessions, logs, and caches live under `~/.hakimi` by default; set `HAKIMI_HOME` to use another data directory.

On Windows, install [Git for Windows](https://gitforwindows.org/) before first launch. Hakimi uses its bundled Git Bash shell; if Git Bash is installed elsewhere, set `KIMI_SHELL_PATH` to the absolute path of `bash.exe`.

## Current status

- Hakimi is a development version that can be built from source.
- The Research Loop and the optional `theory-physics` pack are experimental and may change.
- There is no public npm package or release installer; use the source-build path above.
- Hakimi does not replace expert judgment, human review, or reproducible scientific validation.

## Documentation

- [Getting started](docs/en/guides/getting-started.md)
- [Configuration](docs/en/configuration/config-files.md)
- [Research Mode](docs/en/guides/research-mode.md)
- [Theory-physics collaborator forward program](docs/aitp/theory-physics-collaborator-program.md)
- [Theory-physics collaborator and Research Loop design](docs/aitp/theory-research-agent-design.md)
- [AITP documentation and compatibility records](docs/aitp/)
- [Implementation notes](IMPLEMENTATION.md)

## Project background

Hakimi is an independent repository with its own `hakimi` command, `~/.hakimi` data directory, semver release line, and research direction. It selectively builds on engineering foundations from [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code), but it is not a product-parity fork and does not adopt upstream behavior automatically.

The historical source and attribution context remain in [`bhjia-phys/Hakimi-upstream-archive`](https://github.com/bhjia-phys/Hakimi-upstream-archive). See the [MIT license](LICENSE) for required attribution.

## Development

From the repository root:

```sh
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false -C apps/kimi-code typecheck
corepack pnpm --config.engine-strict=false -C apps/kimi-code test
```

The CLI lives in `apps/kimi-code`; packages provide the SDK, model/provider integrations, and agent runtime used by the application.

## License

MIT. See [LICENSE](LICENSE). Hakimi retains the required attribution for upstream Kimi Code work by Moonshot AI.
