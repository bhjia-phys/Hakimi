# Research Mode

Research Mode turns Hakimi into a joint research partner backed by the [AITP](https://github.com/bhjia-phys/AITP-Research-Protocol) evidence ledger. Instead of answering a single question and forgetting, the agent maintains a live portfolio of research questions, steers itself through bounded actions, and persists durable checkpoints to AITP — all while you retain full control through `/research`, the Research Board, and the Research Manager in TUI and Web.

::: warning
Research Mode is discoverable by default but starts `inactive`. The mode does not probe AITP or show the Research Board until you explicitly enter it. The AITP integration still has the compatibility limits described in [AITP handoff](../../aitp/README.md), including partial H5 integration and a planned/unavailable native H6b coordinator. The shipped S7 handoff is only one same-turn best-effort Skill review after a new checkpoint commit. S8 adds an observational receipt for the latest exact checkpoint/Entry, not H6b or exactly-once recovery.
:::

## Prerequisites

Research Mode has three hard prerequisites. Hakimi checks them only after explicit entry; if any is missing, the active mode enters a degraded state (explained below) and durable operations are blocked.

- **Python 3.11 or later** — The AITP adapter spawns the AITP CLI via Python. The adapter probes for a compatible Python at mode entry; if none is found, the mode degrades.
- **AITP plugin installed** — The `aitp-research-protocol` plugin must be discoverable in the session skill catalog. The adapter resolves the plugin root, reads its `aitp.contract.json` and `kimi.plugin.json`, and validates the contract version. A missing or incompatible plugin degrades the mode.
- **Initialized AITP workspace** — The current working directory must already be an initialized AITP workspace. The adapter does **not** auto-initialize, adopt, or run `init` / `init --adopt` / `inventory` / `backfill --apply`. An uninitialized workspace degrades the mode.

When all three are satisfied, the adapter enters the `ready` phase and the supported AITP read/write tool surface becomes available to the agent. The adapter does not expose, call, or parse the upstream `backfill-0.1` success envelope, and it does not implement `sha256-once:` or `check-policy` semantics.

For theoretical-physics work, the bundled `theory-physics` plugin is an optional domain pack and the single upper-layer handbook for sustained work. It can be discovered while Research Mode is inactive and routes a sustained request through Research Mode admission, the current Line / Question / Focus, an explicitly confirmed Goal–Program relationship when one is needed, one bounded Research Action, and on-demand AITP delegation. An ordinary one-off physics answer does not need Research Mode.

The external `aitp-research-protocol` plugin remains the protocol authority. Its `using-aitp` and `distilling-methods` skills stay independent and active-only: durable scientific deltas are delegated to `using-aitp`, while potentially reusable methods are delegated to `distilling-methods` only when that plugin is installed, Research Mode is active, and the skill is currently visible. After the first successful commit of a new checkpoint, Hakimi loads the exact plugin Skill for one bounded review of only the touched Entry; duplicate commits and unavailable or hidden Skills are non-blocking no-ops. The optional `hakimi/research-distillation-attention-0.1` snapshot receipt says only `review_requested` or `handoff_unavailable` for the latest exact committed checkpoint/Entry. It never means the Skill found a trigger, created a card or trial, completed review, approved, or published anything. Otherwise retain the method candidate and evidence without claiming distillation or publication. Hakimi does not copy their CLI, schema, marker, method-card, trial, trigger, or approval rules; it does not automatically write Topic Goals, `resolves`, or method cards. After `EnterAITPMode`, use `GetResearchStatus`; if it remains `probing`, wait for `ready` or `degraded` without busy polling or using a bare CLI.

Post-commit Note writing is scoped to the exact Line/Topic/workstream confirmation captured by the successful checkpoint commit. The executor checks admission, and the Note tool rechecks ownership when it actually runs, including a fresh Topic observation before Note I/O. Only the exact returned local Note draft can be edited or saved. Local Line switching/rebinding waits for outstanding Note I/O; undo, restore, readiness loss, a newer committed cursor, or a changed confirmation revokes the old permission. A late result cannot recreate it. If the adapter reports a save after ownership changed, the error preserves the reported artifact path; inspect it rather than assuming rollback or blindly saving again. A validation failure in unchanged scope retains the exact draft for retry.

The review context is transient. Restored attention alone cannot authorize Note prepare/save, nor can re-reading evidence or repeating an already committed checkpoint restore old draft permission. For a useful interrupted review or stage synthesis, begin a fresh Question-bound Action with the selected canonical Entry IDs in `evidenceRefs`/`falsifierRefs` and both `tool:aitp_note_prepare` and `tool:aitp_note_save` grants. Before prepare and save, the host verifies only those Entries through `aitp_show`: each must be active in the captured Topic with explicit membership in the current workstream. The Action, Question, Line and any plan bindings must remain fresh; Note prepare targets exactly that workstream. Cold restore requires a new prepare, not reuse of the old draft permission. No fake new scientific delta is required. Recorded knowledge stays readable, and unavailable distillation is not a Goal continuation gate. These local checks neither judge the synthesis nor implement durable review scheduling. AITP 0.9's atomic Topic/exact-workstream save variant applies to Entries, not Notes: Hakimi does not parse Note frontmatter, enforce its membership atomically, or provide an OS-level sandbox. Existing AITP Skill verification and human decisions remain necessary.

For a well-specified engineering slice, the optional Theory Physics plugin supplies the `calculation-operator` profile. Ask the main agent to delegate the bounded check; it must first own an Action with the subagent capability. The operator returns a typed evidence packet; only the main agent interprets it, concludes the Action and writes through AITP. `/preset` selects model routing separately. This is a role prompt with restricted tools, not a new runner, inherited per-command Action policy or OS sandbox; the real calculation/retry acceptance remains tracked in the collaborator program.

## Entering Research Mode

There is no opt-in flag for Research Mode. The `/research` command and the `EnterAITPMode` capability are discoverable by default. Every new session starts with Research Mode `inactive`, while hydration preserves the persisted mode. Inactive hydration, `getResearch`, and GET/snapshot reads use the local snapshot only: they perform no AITP I/O, do not probe the workspace, and keep the Research Board hidden. A persisted active session remains active after cold restore; cold restore re-probes the adapter and reruns the read-only `enter` → `check` maintenance cycle. The other Research/AITP tools and the AITP plugin skill remain active-only.

The old `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE` environment variable, `[experimental].aitp_research_mode`, and `KIMI_CODE_EXPERIMENTAL_FLAG` are inert no-ops for this graduated capability. They do not hide or enable its entry points; the master flag still applies to other experimental features. To activate the AITP-backed capabilities from an inactive session, toggle with `/research`, select **Research** in Web, or let the model call `EnterAITPMode`. Active conversation undo and cold restore also re-probe the adapter and, after a ready probe, perform the read-only `enter` → `check` maintenance cycle. Research Mode never auto-runs `init`, `init --adopt`, `inventory`, or `backfill --apply`.

## Starting and stopping

In Web, open the composer's **Modes** menu and select **Research**. When the shared snapshot is inactive, this explicitly enters Research Mode and shows the Research Board; once the snapshot is `probing`, `ready`, or `degraded`, the same row stays active and opens the Research Manager. The button does not create a question or schedule a model turn.

You can use `/research` in either TUI or the Web composer to toggle the mode. Web routes the typed command through the Research command endpoint rather than sending it as a model prompt. Hakimi activates the AITP adapter, enters the `probing` phase while it checks the workspace, then shows the live Research Board with the resulting `ready` or `degraded` state. Submit a research question after entering, continue an active Goal, or let the model call `EnterAITPMode` while handling a research request. Explicit `on`/`off` forms remain compatible, and `on --` can select a research line at entry:

```text
/research
/research on -- boundary-zero-mode
```

In TUI only, entering from `manual` or `yolo` permission mode opens a keyboard prompt asking whether to switch to `auto` or `yolo`. Web uses the session's current permission mode; change it in the Web controls before entering if needed. Neither surface starts an independent background loop, and a research turn may still wait for approval in `manual`. An active Goal remains the sole owner of autonomous continuation across turns.

While Research Mode is active and not paused, each typed main-agent user prompt receives a transient `interactive_research` lease in `ready` or `degraded` mode and enters one Research turn with Research context. Degraded work is provisional, not a claim of freshly verified or saved AITP state. It does not enqueue another turn. A Goal-owned continuation receives the separate `autonomous_research` lease only in `ready` mode after the existing Research continuation guards allow the Goal engine to enqueue it. If AITP degrades during an autonomous turn, further Action work is held. System, cron, subagent, unclassified, inactive, probing, and paused turns abstain. These leases are runtime-only and are not persisted or added to the public wire schema.

In `auto`, a model-initiated bounded Research Action does not add a separate routine execution-approval gate: `requires_human_approval` is normalized off, and ordinary tool-risk prompts may be suppressed. `auto` does not answer science. A genuinely non-delegable scientific or protocol choice still uses `RequestResearchDecision`, which creates a durable human gate in every permission mode. On restore or when switching to `auto`, Hakimi treats only an unresolved approval tied to the currently planned action as the standing auto authorization and starts that action, provided the Research Loop is active; historical review, action-less approval, and scientific-decision gates are never auto-resolved.

### Web manual check

If the model opens Research Mode during a typed user turn, admission starts when entry settles; no second user prompt is required. The same turn receives only one local Research boundary, even if adapter readiness changes. Exiting or pausing revokes admission, and the next normal step-head injection reads the current state. A mode update never creates or revives a Goal continuation lease.

1. From an inactive, idle session, open **Modes** and select **Research**. Confirm that the Board appears and reaches `probing`, then `ready` or `degraded`, without scheduling a model response.
2. Open **Modes** again and select the active **Research** row or **Manage**. Confirm that the Research Manager opens instead of exiting the mode.
3. Run `/research` again. Confirm that the Board and **Research** tag disappear and that the **Modes** row returns to its start action.
4. From an inactive session, send a research request that leads the model to call `EnterAITPMode`. Confirm that the same Board and active **Research** entry appear automatically.
5. Restart Hakimi. Confirm that the **Research** row and `/research` slash-menu entry remain discoverable while a new session starts inactive and performs no AITP I/O before explicit entry.

To exit Research Mode:

```text
/research
```

Exiting revokes AITP tool admissions and hides the Research Board in both surfaces. Already-saved AITP records are **not** deleted — they persist in the ledger.

## Checking status

At any time, check the current research snapshot:

```
/research status
```

In TUI, this displays the mode phase, loop status, current research line, focus question, AITP adapter health, and—when available—the current-state maintenance summary. In Web, it refreshes the authoritative session snapshot and expands the live Board.

## Current-state maintenance

After the adapter probe reports `ready`, Hakimi first calls unscoped `enter` and observes only the current Topic identity and revision. It does not adopt an unscoped handoff or evidence set. If the current Research Line has an exact confirmed binding for that observed Topic revision, Hakimi then runs the read-only scoped `enter` → `check` maintenance cycle for the bound workstream. Without that binding, it clears the old maintenance scope and makes no scoped maintenance claim.

The maintenance receipt and context injection expose only a safe summary: Working Note age, whether active state is newer, unresolved failure count, next action, warning codes, and check status/counts/finding codes. A full Research snapshot/API response or expanded Board may still include checkpoint, revision, and adapter-health fields; those projections are not the maintenance receipt or context injection.

Valid check findings, including error findings, keep the mode `ready`; only an unavailable or invalid scoped `enter`/`check` cycle surfaces `degraded`. Error findings can still block a specific checkpoint according to its save barrier. This maintenance is read-only: it never runs `init`, adopts, or performs backfill, and it never writes a semantic handoff, Entry, or Note automatically. It runs after Research Mode entry, active undo/cold restore, and at the end of an admitted interactive or autonomous Research turn when the Research state changes, but only the current exact confirmed Line-to-workstream binding can supply its scope. It is not session-end automatic closeout.

## Pausing and resuming

To mark the Research Loop as paused without exiting AITP mode:

```
/research pause
```

The paused state is included in the snapshot injected into subsequent model steps, so the agent must not advance the research loop until you resume it:

```
/research resume
```

## The Research Board

Research Mode and Goal are related, but they do not own the same lifecycle:

| Layer | Responsibility | Does not own |
| --- | --- | --- |
| Generic Goal engine | Objective status, completion, budget, waiting, and cross-turn automatic continuation | Scientific phase, Line, Question, evidence, or AITP records |
| Hakimi Research Goal | One-to-one scientific projection of the current generic Goal, including Research scope and persistence guards | A second lifecycle, budget, scheduler, or continuation queue |
| Research Mode | Admission of interactive Research turns and the long-lived Research working state | Automatic creation of a Goal or autonomous turns |
| Research Plan v2 | Goal- and Program-bound multi-loop milestones and evidence strategy | Goal completion or turn continuation |
| Local Action Plan | The detailed TODO and reviewed choices for one bounded Research Action | The multi-loop strategy or scientific truth |
| Research Loop / Action | One admitted turn and its normal `BeginResearchAction → work → ConcludeResearchAction` unit | Canonical AITP persistence |
| AITP Program and ledger | Observed Topic goal, canonical Entry/Note evidence, workstreams, and human decisions | Hakimi Goal lifecycle, tool execution, or Board state |

Consequently, an active, ready or degraded, unpaused Research Mode admits an interactive
user turn even when no Goal exists. A Goal is required only for autonomous
cross-turn continuation. When one exists, Research Goal projects it rather
than replacing it, and Goal–Program alignment guards automatic continuation
and completion without suppressing the current bounded action's recovery.

When Research Mode is active, the TUI **Research Board** appears above the input area. In Web, click **Research board** at the right edge of the conversation to open a floating panel. It starts collapsed, scrolls independently, and never resizes the conversation or composer. Use **Hide research board** (or Escape while focused inside it) to collapse it; this does not pause Research or the Goal. Live updates do not reopen it, and switching sessions resets it to collapsed. Inside the panel, **Expand** opens the detailed audit view. The compact Board is deliberately limited to the decisions needed at a glance:

- **Project**: Goal lifecycle/continuation when a Goal exists, otherwise an explicit interactive-without-Goal state; the current Research Plan milestone, Line, and focused Question workflow/epistemic state live here
- **Current cycle**: one display-only scientific stage (`Frame / hypothesis`, `Test / action`, `Evaluate`, `Record`, or `Next / ready`), the current action or run/progress summary, Research mode and planning policy, and the legacy `period.loopCount` labelled accurately as **Research turns**, not completed scientific cycles
- **Attention**: an exact Goal continuation hold, unresolved human gate, action/phase recovery requirement, pending checkpoint, active Goal–Program alignment or Line-workstream blocker, unavailable method-review handoff, current-Line alert, maintenance problem, or adapter error, plus a count when more items exist; healthy AITP, alignment, workstream, and provenance facts stay collapsed, and alerts owned by another Line never appear as current attention
- **Next**: one effective next step with its source, or an explicit missing-next state

While a current Action has a running job, Current cycle keeps its scientific purpose alongside the observed job and scheduler/stage. Long purposes are clipped without replacing them with job metadata; Web places the observation beneath the purpose. A completed Action is not presented as ongoing work, and an explicitly foreign Action/run is hidden even in a single-Line snapshot. This display does not infer an unrecorded scientific step or authorize new work while waiting.

The **Hakimi Research Goal** shown in Project is an additive `hakimi/research-goal-0.1` projection of the one generic Goal that owns cross-turn continuation, not a second scheduler or an AITP Topic Goal. The expanded Board remains the audit surface for the complete Goal and observed AITP Program goal, Program/Line/Question scope, plans, evidence, checkpoints, and provenance. The legacy `goalSummary` remains a compatibility fallback. Long compact narratives are clipped to the available terminal width or two Web lines; expanding the Board restores the complete text.

Goal lifecycle and continuation are separate. `active` means the objective is
still eligible to progress; it does not prove that another model turn is
running or queued. The optional continuation projection distinguishes `idle`,
`deciding`, `enqueued`, `running`, `held`, and task `waiting`. A held Goal is
rendered as `active · continuation held`, with the participant owner and exact
reason in the expanded Board and Attention row; it is not relabelled as
`paused`. The projection is derived runtime state, so explicit retry, a new
user turn, lifecycle changes, waiting, cancellation, replay, and resume clear
or recompute stale hold details.

The compact header separates **mode** readiness, **workflow** health, the
display-only scientific stage, and the current Line. Adapter/AITP health is
shown only when it needs Attention or in the expanded audit surface. Therefore
`mode ready · workflow blocked` is coherent: Research Mode is operational, but
the current Research state requires recovery. The
effective Next projection uses the same priority as Attention: unresolved
human gate, mismatched live action, coherent run/action, pending checkpoint,
Goal–Program alignment, then ordinary question or maintenance guidance. Its
text, source, freshness, timestamp, and provenance are one atomic projection;
TUI and Web do not combine a locally overridden text with metadata from a
different next step.

Immediately before context injection for every admitted Research turn, the
shared coordinator runs one deterministic local reconciliation pass. It can
repair only mechanically determined Line, Action/phase, period, committed-cursor,
and alert structure; it does not run another AITP maintenance cycle, infer a
scientific outcome, complete or abandon an Action, or resolve a checkpoint. A
pending checkpoint whose captured Question revision or captured Program / Line binding is provably stale is shown as historical and unsafe to commit as current evidence. Reconciliation discards it automatically only when there is also no `committedEntryId`, no save receipt, and no committed cursor/history trace; `/research discard-checkpoint <id>` exposes the same guarded operation for explicit recovery. Any evidence that the save boundary may have been crossed keeps the proposal fail-closed and visible for inspection. Duplicate blocker causes are counted once in the compact Board, while
their full records remain in the owning expanded sections. Expanded adapter
health reports read readiness separately from adapter-contract-0.2 scoped
checkpoint-write capability.

Mode, loop, question, focus, and checkpoint changes publish one complete snapshot to both surfaces. TUI rejects stale cold hydration; Web serializes same-session mutations and prevents an older HTTP response from overwriting a newer live WebSocket update.

Line changes are an explicit cycle boundary. A settled `state_updated` cycle can
switch directly: the existing switch operation returns it to `idle`, archiving
the old period's focused Question and latest progress summary before the new Line
opens. No manual phase reset or AITP write is required. Hakimi still rejects a
switch while a live Action or Run, pending checkpoint, unfiled local conclusion,
Note persistence operation, unresolved human gate, or any other non-`idle` phase
remains. Invalid targets and stale revisions do not close or archive the cycle.
Hakimi may reconcile only
deterministic local references and receipts. It never guesses AITP workstream
membership, rewrites AITP state, or repairs scientific meaning automatically.

Cold replay applies the same boundary. A legacy single-Line snapshot may omit
the optional Goal continuation field; the Board labels it as unavailable
rather than inventing `held`, `running`, or completion. In a multi-Line
snapshot, only the selected Line can supply compact Question, Action, Run,
gate, alert, continuation attention, and Next state. If replay finds a live
Action stranded outside its mechanically owned phase, Hakimi restores that
phase idempotently while preserving the Action and any recorded human
resolution. It then blocks Goal completion, holds autonomous continuation, and
routes the next interactive Research turn to inspect the recorded evidence and
finish or abandon the same Action. Hakimi never chooses `completed` versus
`abandoned` from UI structure alone and does not ask the user merely to repair
bookkeeping; a real scientific or authorization ambiguity can still require a
human decision.

The board tracks semantic research state, not raw activity. Ordinary tool calls and AITP `list` / `show` / `check` reads do not change it by themselves. During an active research turn, the agent is instructed to prefer the simplest sufficient explanation or experiment and the cheapest decisive evidence first, before escalating to remote, long-running, or multi-branch work. Escalate once a simple probe establishes that the larger action is necessary; do not invent an additional human approval after that evidence when the permission mode already authorizes execution. The agent must create a question before substantive work, set its focus, begin one bounded action with `BeginResearchAction`, and conclude that action with `ConcludeResearchAction` after reporting the physical work, result, tests or derivation, limitations, mainline impact, next step, and one explicit durability assessment. A `no_durable_delta` conclusion records the single Research progress boundary and schedules no S6 persistence or distillation I/O; independent session-boundary `enter` / `check` maintenance may still run. A `durable_delta` conclusion creates exactly one typed pending commit candidate and routes it through the existing same-turn `record prepare` → model-authored draft fill → atomic `record save` → canonical `show` → scoped `check` → checkpoint commit barrier. The first successful commit then returns one same-turn steer containing the exact external `distilling-methods` Skill and only the touched Entry/checkpoint context. The Skill may no-op; a duplicate commit or unavailable handoff does not repeat or roll back the durable commit. `ConcludeResearchAction` itself does not submit or poll HPC jobs, directly write canonical `.aitp` files, or change a question's assessment automatically. Do not repeat the same conclusion with `RecordResearchProgress`. Human assertions and decisions must use their own human-attributed candidate and Entry rather than being merged into agent, tool, or source verification. `PlanResearchAction`, `CompleteResearchAction`, `SetResearchPhase`, `RecordResearchProgress`, and manual checkpoint proposal remain lower-level recovery or maintenance tools rather than the normal action path. While an action is planned or in progress, standalone phase/progress mutation is rejected; this prevents a live action from being stranded outside its owning phase. A legacy in-progress action already stranded by older state can still be completed or concluded, unless an unresolved human gate owns the pause. The agent should call `UpdateResearchQuestion` only when evidence, failure, or sustained no-progress changes the assessment or next action. This is semantic guidance, not a runtime guarantee that candidate confirmation will guard every focus call. If no such semantic transition occurred, an unchanged board is expected.

The expanded Board organizes the full research record into direction, current work, the research map, evidence and uncertainty, and operations or persistence. It preserves the complete period, multi-loop Research Plan, bounded Action Plan, and status projection, and shows every available Research Line, Question, alert, evidence reference, uncertainty, checkpoint, run detail, AITP maintenance item, and latest method-review handoff receipt without silently replacing the remainder with an "additional items" count.

Planning has two explicit layers. The additive `hakimi/research-plan-0.2` record is the Goal- and Program-bound multi-loop strategy: milestones, evidence requirements, decision points, assumptions, current milestone, and stop/replan conditions. The legacy bounded `ResearchPlan` remains the reviewed local Action Plan and is also exposed as `actionPlan` during the compatibility period. A non-trivial action must capture both the active Research Plan milestone revision and the approved local Plan revision. A reversible one-step action receives an explicit minimal Action Plan binding. If either layer or its Goal/Program/Line/Question context becomes stale, the action cannot start or conclude. Completing a plan never closes a Question, writes AITP, or completes the Goal.

The checkpointed planning policy is orthogonal to those layers. `collaborative` is the default and routes a consequential unknown through the existing `AskUserQuestion` UI only when it cannot be resolved from the active Goal, current Research state, prior explicit human direction, or checked evidence and its answer would materially change the Research Plan. If `auto` suppresses `AskUserQuestion`, the agent must gather non-committing evidence or use `RequestResearchDecision` for the genuinely non-delegable choice instead of guessing it. The agent must not ask the user to restate or re-approve an existing Goal, completion criterion, scope, confirmed Program relation, or Plan decision. Dismissing the question or giving an empty or ambiguous answer leaves the Plan unchanged. `dreaming` is the Goal-driven autonomous planning policy: once the Goal, scope, and completion criterion are clear, it keeps selecting the next reversible, low-cost, in-scope step across Goal-owned Research turns without per-step confirmation, and records every chosen default in the Plan's `assumptions`. Neither policy may answer or bypass an expensive or irreversible action, ambiguous scientific convention, Goal or scope change, or AITP/human-decision gate. Tool permission mode remains separate: `auto` can remove routine execution prompts, but it cannot create Research capabilities or answer `RequestResearchDecision`. Changing the planning policy is a revisioned Hakimi-state mutation with no AITP write. The Manager's Plan view changes it, and the expanded Board displays it.

TUI additionally projects the session's `TodoList` into the expanded Board as **External Todo actions**. Todo state remains separate from Research Questions and the AITP ledger: completing an action does not change an epistemic state or create an AITP Entry. Press `Ctrl-O` in TUI to expand or collapse the Board; `Ctrl-T` remains the non-research Todo shortcut. In Web, click **Expand** or **Collapse** on the Board; Web uses buttons and forms, not these TUI keyboard shortcuts.

For child-agent work, the main agent can review a strict typed evidence packet containing the claim, evidence, assumptions, tests, sources, artifacts, limitations, and confidence. Reviewing a packet is deliberately zero-write: it does not alter the assessment, epistemic state, or AITP. The main agent must interpret the physics and explicitly record any resulting progress or question change.

For HPC work, the loop can record an explicit observation bound to the current Research Action: campaign, job ID, stage, scheduler state, observation time, next check, and artifact references. This is not a scheduler integration: Hakimi neither submits nor polls jobs, creates a campaign entity, nor treats a `RUNNING` observation as scientific success. A terminal observation must carry an explicit terminal state.

`ObserveResearchRun` can also update an existing run retained by a completed or abandoned Action. Use the original Action/campaign/job identity and a fresh Research revision; omitted source/binary pins retain their original values, while conflicting identities or terminal outcomes are rejected. This narrow recovery remains available while the loop is paused, but does not resume it, resolve a human decision, update the original conclusion, write AITP, or authorize generic tools. Obtain the observation through an already authorized source; this operation does not poll the job. It does not allow a new Action to replace a still-running foreground run. Once a terminal observation arrives, normal next-Action checks still apply, including pending records and human decisions.

When the agent proposes candidate questions for confirmation, it may register them as open working state so they appear on the board. The intended behavior is to wait for confirmation before setting one as Focus or persisting a durable AITP decision, but candidate confirmation is not a runtime-enforced guard on `SetResearchFocus`. Alerts and a generic human gate are implemented; `ResolveResearchDecision` resolves runtime state but does not automatically write an AITP `decision` Entry.

The Board is read-only. Use `/research manage` or a direct `/research` subcommand for changes. Both managers are line-first, but their controls differ. When an unresolved gate or active alert exists, the TUI opens an **Attention view** first: press `R` to enter a resolution and choose the phase to resume, `A` to acknowledge the alert, or `L` to return to the lines. In Attention view, `R` means resolution rather than reopen. After attention items are cleared, TUI selects a Research Line and opens its questions with keyboard commands. Press `W` to confirm an AITP workstream binding, `X` to clear the existing binding, `V` to inspect the multi-loop plan, or `P` to switch the planning policy; exact-revision `A`, `C`, and `D` actions activate, complete, or discard the plan when legal. Web shows a clickable line list beside Line, Question, Science, Checkpoint, and Research Plan sections. Its Line section shows the observed Topic, binding status and provenance, and explicit confirm/clear controls; the Plan section exposes the same legal transitions and policy choices. Plan content is prepared or revised through the agent's `PrepareResearchPlanV2` tool rather than a second unversioned UI editor. **Science** can resolve the current human decision with an explicit next phase, acknowledge active alerts, review a typed evidence packet, or record an observation for the current external run. These controls update Hakimi Research working state through the Research endpoint and do not write the AITP ledger.

## Line–workstream binding

A Hakimi Research Line is local orchestration state; an AITP workstream is an explicit membership tag on canonical records. They are separate namespaces. After unscoped `enter` observes the current Topic, the user or main agent may confirm one revisioned local Line→workstream binding. Hakimi never infers that binding from matching slugs, prose, paths, record IDs, or any other similarity, and confirmation never writes AITP.

The shared Research snapshot exposes the confirmed binding records and the current Line's derived status through REST, WebSocket, Node SDK, klient, TUI, and Web. Each record also carries a server-generated opaque `confirmationId`; a clear must echo the exact identity visible in the same snapshot and its public Research revision:

| Status | Meaning |
| --- | --- |
| `unbound` | This Line has no explicit confirmation. |
| `unavailable` | A saved binding exists, but no current AITP Topic is observed. |
| `bound` | The saved Topic ID and observed revision exactly match the current Topic observation. |
| `stale` | The Topic is the same, but its observed revision changed; confirm membership again. |
| `conflict` | The saved binding belongs to a different Topic. |

An unbound, unavailable, stale, or conflicting Line may still do low-risk local exploration. It cannot propose or commit a scoped durable checkpoint, and Hakimi does not run scoped maintenance for it. Before turn-end or Line-switch maintenance and before checkpoint prepare/save, Hakimi first repeats an unscoped Topic observation and then re-derives the exact binding; a changed Topic causes zero scoped I/O. A checkpoint captures the exact binding tuple and revalidates it across prepare, canonical `show`, scoped `check`, and commit; the shown Entry must exactly match the captured Topic and contain exactly the one captured workstream. Switching Lines changes the maintenance scope only when the destination Line has its own exact confirmed binding.

Bindings are immutable confirmations. Clear an existing binding explicitly before rebinding, and refresh before retrying a stale revision or confirmation identity. A live action or pending checkpoint prevents a binding change. For checkpoint-bound saves, Hakimi requires AITP 0.9.0 adapter-contract 0.2 and automatically supplies the captured Topic and exact singleton workstream to atomic `record save`; a mismatch creates no canonical Entry. Post-save `show` and scoped `check` remain defense in depth. If canonical save succeeds while the local binding becomes stale, Hakimi retains the save receipt, enters a degraded state, and requires the pending checkpoint proposal to be undone before rebinding. A reset/exit racing a mutation can still be indeterminate: inspect canonical state and retry only with the same recovery identity. Undo and cold restore replay the stored binding and re-evaluate it against the newly observed Topic; they do not infer, repair, or backfill membership.

AITP 0.9.0 still has no workstream registry, so confirmation does not prove that a workstream already has records. An empty scoped result is legal; legacy unscoped records remain outside the scope, and `counts.outside_scope` is the global-minus-scoped count difference rather than a finding or proof of membership. Hakimi does not add a registry, alias catalog, automatic backfill, or new AITP schema.

## Goal–Program alignment

The Hakimi Goal, the observed AITP Program, and the Local Research Loop are distinct records. The Program's top-level AITP Research Goal is observed only through `enter`; Hakimi never writes an AITP Topic or `TOPIC.md`.

When a generic Goal exists, the Research snapshot projects it one-to-one as the Hakimi Research Goal, including its objective, completion criterion, current Research scope, full budget, derived stop conditions, Program relation, human gates, persistence guards, and Research revision. Interactive Research does not require a Goal. The current generic Goal contract has no structured non-goal or separately declared stop-condition input, so the projection reports an empty `nonGoals` list and derives stop conditions only from known runtime budgets and guards; it never parses goal prose to invent structure.

Before an active Research Goal can complete or continue automatically, explicitly confirm its relationship to the observed Program. The checkpointed binding exists only in Hakimi and is never inferred from text similarity:

| Relation | Meaning |
| --- | --- |
| `same_program_goal` | The Hakimi Goal and observed Program express the same goal. |
| `goal_parent_of_program` | The Hakimi Goal is broader and the observed Program is one of its children. |
| `goal_milestone_in_program` | The Hakimi Goal is a milestone within the observed Program. |
| `unrelated` | The Goal and observed Program are explicitly unrelated. This is the only explicit conflict. |

Without a binding, the status is `confirmation_required`. If the active Goal has no observed AITP Program, the status is `unavailable`; this also blocks completion and automatic continuation until the Program is observed again. A change to the Hakimi Goal, AITP Topic, or observed Program revision makes an existing binding `stale`; only `unrelated` makes it `conflict`. In active Research Mode, `unavailable`, `confirmation_required`, `stale`, and `conflict` block Goal completion and automatic continuation. Probing or degraded adapter state, a pending Research checkpoint, or an unresolved human gate also blocks both paths. An inactive Goal is unaffected.

The command requires both a current Hakimi Goal and an observed AITP Program. It uses the captured Research snapshot revision for optimistic concurrency, so a stale snapshot must be refreshed before retrying. The TUI and Web Board can confirm or clear the binding; neither operation writes AITP.

## Steering the research

Research Mode uses optimistic concurrency for revisioned mutations. The public Research snapshot revision is a world-time publication token: it never rewinds with conversation undo, and every different published full snapshot receives a strictly newer token. Commands carry the draft's captured snapshot or entity `revision` as `expectedRevision`, and a stale revision fails without applying the mutation. Checkpoint proposals use the Research snapshot revision captured when the user edits the form, so a later change cannot create a pending checkpoint against newer state. Binding clear additionally carries the exact server-owned confirmation identity. Other mutations rely on captured target or pending-checkpoint identity and server-side state constraints. TUI refreshes the Board for a retry; Web re-reads the same session's authoritative snapshot. If a newer live revision arrives while a Web form is dirty, the Manager preserves the draft, shows a stale warning, and requires a refresh/retry rather than silently replacing the form.

### Research Manager

Open the manager in either surface:

```
/research manage
```

In TUI, use `↑` / `↓` and `Enter` to navigate line-first; use `F` to set focus, `E` to edit wording, `D` to defer, `B` to block, `C` to close, `R` to reopen, and `Esc` to go back or cancel. Only Attention view assigns `R` to resolution. In Web, select lines and questions by clicking, edit fields in the form, and use the labeled buttons for focus, workflow transitions, pause/resume, and save.

### Direct steering commands

For precise control without opening the manager:

| Command | Description |
| --- | --- |
| `/research edit <questionId> -- <new wording>` | Replace a question's wording |
| `/research focus <questionId> -- <bounded action>` | Set the focus question and its next bounded action |
| `/research defer <questionId> [-- <reason>]` | Defer a question (reason optional) |
| `/research block <questionId> [-- <reason>]` | Block a question |
| `/research close <questionId> [-- <reason>]` | Close a question |
| `/research reopen <questionId> [-- <reason>]` | Reopen a previously closed question |
| `/research line <slug>` | Switch the current research line |
| `/research discard-checkpoint <checkpointId>` | Discard only a provably historical, never-committed checkpoint proposal |
| `/research align same_program_goal\|goal_parent_of_program\|goal_milestone_in_program\|unrelated` | Explicitly confirm the local Goal–Program relation |
| `/research align clear` | Clear the local Goal–Program binding |

Example:

```
/research focus q-17 -- probe the boundary zero mode with a small-lattice sweep
```

## Save, show, and check barrier

### Action-scoped tool enforcement

Research Action ownership is an executor-enforced policy for admitted Research turns whenever Research Mode is active. It is part of the mode's normal behavior and needs no experimental flag.

Status/control and narrowly defined recovery tools may run without an active Action. New research work requires an `in_progress` Action in `action_executing`, fresh Line, Question, and Plan bindings, no unresolved human gate, and a matching `allowed_tool_kinds` capability. Known capabilities are `workspace_read`, `workspace_write`, `web_search`, `web_fetch`, `shell`, `task`, `subagent`, and `scheduler`; an otherwise unknown plugin or MCP tool requires the exact `tool:<lowercase-tool-name>` grant and is denied by default. `BeginResearchAction` and a work tool in the same tool-call batch are rejected so a failed Begin cannot race with unowned work.

Recorded-knowledge inspection is a narrow read-only exception, not new action work. When the mode is `ready`, `Read` can open one exact workspace-relative `.aitp/topic/notes/note-<id>.md`; AITP `show` supports Entries, not Notes. `Grep` may discover the generic `^> method-card:` marker under `.aitp/topic/notes/` or `^> method-observation:` under `.aitp/topic/entries/`; either marker may also be searched under `.aitp/topic/`, with `files_with_matches` output only. These reads do not require a live Action, including after commit or with a paused Goal/loop. They do not grant general searches, absolute cross-workspace Note paths, Entry file reads, shell access, or writes. The Skill still checks applicability and evidence; marker counts prove nothing, and the runtime does not initiate scans.

After a bound Action concludes with a durable delta, checkpoint persistence uses a separate, narrow lease bound to the pending checkpoint, exact AITP Topic/workstream, and exact draft path. An unbound local conclusion grants no draft or canonical-write permission. Note/method-card persistence similarly uses the exact successful `note prepare` draft path and revokes it after save, mode exit, undo, or cold restore. Other direct access to canonical `.aitp/topic` files remains denied; canonical writes still go through the AITP adapter and CLI contract.

This is a Tool Executor policy, not an operating-system sandbox. A granted `shell` capability is intentionally broad and the host's normal command approval and filesystem/network containment remain the lower-level security boundary. The policy prevents standard model tool calls from bypassing Research Action ownership; it does not claim to isolate a compromised subprocess or external program.

`EnterAITPMode` is always discoverable as the explicit entry tool. Use `GetResearchStatus` for the authoritative snapshot after entry; if it remains `probing`, wait for `ready` or `degraded` without repeated calls or busy polling. Once the mode is active, the remaining Research and AITP tools are exposed according to adapter health. The `theory-physics` skill does not persist ordinary turn progress: it hands off only a durable delta to the external AITP skill. Before filling potentially reusable execution evidence, the agent retrieves relevant cards and follows `distilling-methods` so the Entry can carry the Skill-required exact card pin or observation marker at creation. After first commit, Hakimi loads the exact AITP plugin Skill once more for a bounded touched-Entry review; the Skill alone decides whether any trigger holds. Otherwise retain the method candidate and evidence without claiming distillation or publication. Current-topic state is read only for the selected Line / Question; unrelated lines contribute only already-distilled methods.

- **Read tools** (`aitp_enter`, `aitp_list`, `aitp_show`, `aitp_check`) — available when the adapter is `ready` **or** `degraded`. The agent can still browse the ledger and run health checks in degraded mode.
- **Write tools** (`aitp_record_prepare`, `aitp_record_save`, `aitp_note_prepare`, `aitp_note_save`) — available **only** when the adapter is `ready`. Write operations use a single-flight guard: a concurrent mutation is rejected until the current one settles.

This barrier means the agent cannot silently persist evidence when AITP is unhealthy. The adapter validates every versioned read response and unversioned prepare/save response against the installed AITP contract; unknown schemas, statuses, or extra transport fields fail closed instead of being accepted as research state. `aitp_record_prepare` accepts only `observation`, `result`, `failure`, `decision`, `source`, `code_change`, `run`, or `closeout`; Note preparation uses `working` or `theory` mode, and save accepts only the draft path returned by prepare.

The Web Manager's Checkpoint form preserves this boundary. **Propose** creates only pending Research working state and requires the current Line's exact `bound` workstream confirmation. **Commit** stays disabled until a checkpoint is pending and you enter an explicit existing AITP ledger `entryId`, obtained after the agent or official AITP CLI has completed the canonical save flow. Web sends that ID to the Research command endpoint to link the checkpoint; it never calls `record`/`note`, writes `.aitp` files, or creates a canonical Entry. The Entry and scoped check must still match the binding captured by the pending checkpoint, so supplying an ID cannot bypass the save → show → check barrier.

`aitp_check` treats exit code 0 as clean and exit code 1 as a successful report containing findings. Findings remain visible without degrading the adapter. A new error finding keeps the relevant checkpoint pending, while a pre-existing error is retained as an auditable receipt warning. Finding codes are projected as opaque strings; the adapter does not implement AITP's `sha256-once:` or `check-policy` semantics. During entry/restore maintenance, valid error findings keep the Research Mode receipt `ready`; only an unavailable or invalid maintenance cycle is `degraded`. Exit code 2 is a failed command: a valid AITP JSON error or invalid check transport degrades the adapter, while an argument-parser misuse is reported as a tool error without poisoning the session. Full-text `Grep` may locate candidate records, but a complete canonical Entry must be read through `aitp_show`; a failed `aitp_show` is never replaced by direct Markdown parsing.

### Retained local conclusions

A completed check can produce useful evidence before its record ownership is settled. If the Action is still fresh but has no Line or its Line is unbound, `ConcludeResearchAction` closes it and retains the full result, evidence detail, limitations, and durability assessment in local Research working state. The Board shows the result and asks for ownership. It is not an AITP Entry or pending checkpoint, and the result must not be relabelled as no durable delta or recorded again with `RecordResearchProgress`.

To record that result, select an existing target Line in the Research Manager and explicitly confirm its AITP workstream. Then review the original result in Web's Checkpoint section and choose **Confirm ownership and prepare checkpoint**. In the terminal, use `/research adopt-conclusion <localConclusionId> <lineSlug> [questionId]` after confirming the binding with the Manager's `W` control. Adoption preserves the original result and creates only the existing scoped checkpoint; it does not save an Entry, approve a claim, or confirm Goal–Program alignment.

The request requires the exact current snapshot revision. A Line-bound result cannot move to another Line; changed Question, Program, or reviewed Plan context is rejected without losing the retained evidence. The Line's first binding confirmation alone is not a change to the science. A local result survives cold restore and follows conversation undo, without restoring tool or draft permissions. Until ownership is settled, another Action cannot overwrite it and Goal continuation/completion remain held. Ordinary discussion and status inspection remain available.

## Degraded mode

The adapter enters `degraded` when any of these conditions hold:

- Python 3.11+ is not found
- The AITP plugin is missing or its contract version is incompatible
- The workspace is not initialized (`not_initialized`)
- `aitp_check` cannot run and returns a valid AITP error, or its success payload fails contract validation

In degraded mode:

- **User-directed exploration** may continue inside one fresh bounded Action, with its granted tools and normal permissions. Human gates, pending checkpoints, stale scope/plan bindings, and the one-live-Action rule still apply. The generic adapter warning is not a claim that all scientific work is blocked.
- **Read tools** remain available — the agent can still list and show AITP entries.
- **Write tools and checkpoint commits** are blocked — no `record_save`, `note_save`, or pending-checkpoint commit can execute.
- **AITP writes, automatic Goal work and Goal completion are blocked**. A no-delta conclusion updates local progress without persistence. A genuine new result or failure can retain a pending durable candidate when its explicit Line/workstream binding is available; resume that same candidate after recovery. Never relabel it `no_durable_delta` to avoid the write barrier. Without a valid binding, durable Conclude is rejected without completing the Action; keep the evidence in the transcript/workspace and resolve record ownership before retrying. There is no automatic unbound-result persistence or inferred binding.
- Research Mode performs no automatic session-closeout. It does **not** automatically run `init`, `init --adopt`, `inventory`, or `backfill --apply`, and the adapter does not expose, call, or parse the upstream `backfill-0.1` success envelope. The user must initialize the workspace manually or resolve the AITP health issue.

## Exclusions and limitations

Research Mode has several hard exclusions:

- **Plan layers**: Research Mode is a long-lived scientific context. Research Plan v2 directs multiple loop iterations; local Plan mode is a short-lived, nestable Action Plan overlay. Entering or exiting local Plan mode does not exit or reset Research Mode. Neither plan is a second Goal or continuation owner.
- **Research hierarchy**: A large topic belongs to the Research Line / Question / AITP context. A Goal is the current bounded autonomous objective and cross-turn continuation owner; Research Plan v2 selects milestones across loops, while local Plan makes one Research Action executable.
- **Main agent only**: AITP and Research mutation tools are only available on the main agent. Subagents cannot use them — they must return results to the main agent via typed packets.
- **No automatic recovery or native coordinator**: Hakimi does not implement core auto-recovery, workspace auto-init/adopt/backfill, a `/research goal` command, or the native H6b coordinator; H6b remains planned/unavailable. S7 adds only a same-turn Skill handoff after the first successful commit, and S8 records only its latest observational receipt. A crash between commit and handoff can still miss that review, and no retry ledger, background loop, exactly-once guarantee, automatic approval, or publication is implied.
- **Conversation undo**: Research working state (questions, focus, lines) follows conversation undo through the checkpointed model. The committed AITP cursor does **not** — once a checkpoint is committed to AITP, conversation undo cannot retract that external fact.

## Next steps

- [Slash commands reference](../reference/slash-commands.md#research-mode) — full `/research` command grammar
- [Sessions and context](./sessions.md) — how conversation undo interacts with research state
- [Using Goals](./goals.md) — another special mode; Goal completion is blocked while a Research checkpoint is pending
