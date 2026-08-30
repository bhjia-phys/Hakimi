# Research Mode

Research Mode turns Hakimi into a joint research partner backed by the [AITP](https://github.com/bhjia-phys/AITP-Research-Protocol) evidence ledger. Instead of answering a single question and forgetting, the agent maintains a live portfolio of research questions, steers itself through bounded actions, and persists durable checkpoints to AITP — all while you retain full control through slash commands and the Research Board.

::: warning
Research Mode is discoverable by default but starts `inactive`. The mode does not probe AITP or show the Research Board until you explicitly enter it. The AITP integration still has the compatibility limits described in [AITP handoff](../../aitp/README.md), including partial H5 integration and planned/unavailable H6 method distillation.
:::

## Prerequisites

Research Mode has three hard prerequisites. Hakimi checks them only after explicit entry; if any is missing, the active mode enters a degraded state (explained below) and durable operations are blocked.

- **Python 3.11 or later** — The AITP adapter spawns the AITP CLI via Python. The adapter probes for a compatible Python at mode entry; if none is found, the mode degrades.
- **AITP plugin installed** — The `aitp-research-protocol` plugin must be discoverable in the session skill catalog. The adapter resolves the plugin root, reads its `aitp.contract.json` and `kimi.plugin.json`, and validates the contract version. A missing or incompatible plugin degrades the mode.
- **Initialized AITP workspace** — The current working directory must already be an initialized AITP workspace. The adapter does **not** auto-initialize, adopt, or run `init` / `init --adopt` / `inventory` / `backfill --apply`. An uninitialized workspace degrades the mode.

When all three are satisfied, the adapter enters the `ready` phase and the supported AITP read/write tool surface becomes available to the agent. The adapter does not expose, call, or parse the upstream `backfill-0.1` success envelope, and it does not implement `sha256-once:` or `check-policy` semantics.

For theoretical-physics work, the bundled `theory-physics` plugin is an optional domain pack. It adds physics-specific routing and reporting discipline to the generic Research Loop — when to search literature, how to check a derivation, how to separate scheduler evidence from physical conclusions, and when to request a human decision. It does not add another runtime, autonomous loop, literature database, HPC observer, or AITP schema.

## Entering Research Mode

There is no opt-in flag for Research Mode. The `/research` command and the `EnterAITPMode` capability are discoverable by default. Every new session starts with Research Mode `inactive`, while hydration preserves the persisted mode. Inactive hydration, `getResearch`, and GET/snapshot reads use the local snapshot only: they perform no AITP I/O, do not probe the workspace, and keep the Research Board hidden. A persisted active session remains active after cold restore; cold restore re-probes the adapter and reruns the read-only `enter` → `check` maintenance cycle. The other Research/AITP tools and the AITP plugin skill remain active-only.

The old `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE` environment variable, `[experimental].aitp_research_mode`, and `KIMI_CODE_EXPERIMENTAL_FLAG` are inert no-ops for this graduated capability. They do not hide or enable its entry points; the master flag still applies to other experimental features. To activate the AITP-backed capabilities from an inactive session, enter explicitly with `/research on` or let the model call `EnterAITPMode`. Active conversation undo and cold restore also re-probe the adapter and, after a ready probe, perform the read-only `enter` → `check` maintenance cycle. Research Mode never auto-runs `init`, `init --adopt`, `inventory`, or `backfill --apply`.

## Starting and stopping

Use `/research on` to enter Research Mode. Hakimi activates the AITP adapter, probes the workspace, and, after a ready probe, performs the read-only `enter` → `check` cycle before showing the Research Board. The command does not create a research question or schedule a model turn by itself: submit a research question after entering, continue an active Goal, or let the model call `EnterAITPMode` while handling a research request. You can optionally select a research line at entry:

```
/research on
/research on -- boundary-zero-mode
```

When entering from `manual` or `yolo` permission mode, a prompt asks whether to switch to `auto` or `yolo` first. This only chooses the approval posture for later research turns; it does not start an independent background loop. You can stay in `manual`, but a research turn may wait for confirmation on risky actions. An active Goal remains the owner of autonomous continuation across turns.

To exit Research Mode:

```
/research off
```

Exiting revokes AITP tool admissions and hides the Research Board. Already-saved AITP records are **not** deleted — they persist in the ledger.

## Checking status

At any time, check the current research snapshot:

```
/research status
```

This displays the mode phase, loop status, current research line, the focus question, AITP adapter health, and—when available—the current-state maintenance summary.

## Current-state maintenance

After the adapter probe reports `ready`, entering Research Mode performs one read-only AITP cycle: `enter` followed by `check`. Active conversation undo and cold restore repeat the same cycle after their adapter probe. The cycle is per selected workstream when one is provided.

The maintenance receipt and context injection expose only a safe summary: Working Note age, whether active state is newer, unresolved failure count, next action, warning codes, and check status/counts/finding codes. A full Research snapshot/API response or expanded Board may still include checkpoint, revision, and adapter-health fields; those projections are not the maintenance receipt or context injection.

Valid check findings, including error findings, keep the mode `ready`; only an unavailable or invalid `enter`/`check` cycle surfaces `degraded`. Error findings can still block a specific checkpoint according to its save barrier. This maintenance is read-only: it never runs `init`, adopts, or performs backfill, and it never writes a semantic handoff, Entry, or Note automatically. It runs after Research Mode entry, active undo/cold restore, and at the end of an active, admitted Goal continuation turn when the Research state changes; it is not session-end automatic closeout.

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

When Research Mode is active, a **Research Board** appears in the live chrome area (the persistent UI region above the input box). The default compact Board is **science-first**: it tells the story of the research before showing the task list. It highlights:

- The current Research phase and a progress headline
- The physics work already completed and its resulting insight or result
- How that result affects the mainline
- The current uncertainty or unresolved question
- The next bounded action, plus any human gate or active alert

Todo **Actions** remain supporting information, not the compact Board's primary narrative. Mode, loop, question, focus, and checkpoint changes publish one complete snapshot to the TUI, so the board updates immediately without polling. A cold session read cannot overwrite a newer live update.

The board tracks semantic research state, not raw activity. Ordinary tool calls and AITP `list` / `show` / `check` reads do not change it by themselves. During an active research turn, the agent is instructed to prefer the simplest sufficient explanation or experiment and the cheapest decisive evidence first, before escalating to remote, long-running, or multi-branch work. Escalate only when a simple probe cannot decide the question. It must create a question before substantive work, set its focus, begin one bounded action with `BeginResearchAction`, and conclude that action with `ConcludeResearchAction` after reporting the physical work, result, tests or derivation, limitations, mainline impact, and next step. `ConcludeResearchAction` does not submit or poll HPC jobs, write AITP, or change a question's assessment automatically. `PlanResearchAction`, `CompleteResearchAction`, `SetResearchPhase`, and `RecordResearchProgress` remain lower-level recovery or maintenance tools rather than the normal action path. The agent should call `UpdateResearchQuestion` only when evidence, failure, or sustained no-progress changes the assessment or next action. This is semantic guidance, not a runtime guarantee that candidate confirmation will guard every focus call. If no such semantic transition occurred, an unchanged board is expected.

Research Mode also projects the session's `TodoList` into the board as **Actions**. Todo state remains separate from the Research Question and the AITP ledger: completing an action does not itself change an epistemic state or create an AITP Entry. Press `Ctrl-O` to expand the Board in place. The expanded view adds derivation, tests, sources, checkpoint details, and any current scheduler observation while retaining the current line summaries, assessment, alerts, and bounded Actions list; press `Ctrl-O` again to collapse it. In ordinary non-research mode, `Ctrl-T` continues to expand the standalone Todo panel.

For child-agent work, the main agent can review a strict typed evidence packet containing the claim, evidence, assumptions, tests, sources, artifacts, limitations, and confidence. Reviewing a packet is deliberately zero-write: it does not alter the assessment, epistemic state, or AITP. The main agent must interpret the physics and explicitly record any resulting progress or question change.

For HPC work, the loop can record an explicit observation bound to the current Research Action: campaign, job ID, stage, scheduler state, observation time, next check, and artifact references. This is not a scheduler integration: Hakimi neither submits nor polls jobs, creates a campaign entity, nor treats a `RUNNING` observation as scientific success. A terminal observation must carry an explicit terminal state.

When the agent proposes candidate questions for confirmation, it may register them as open working state so they appear on the board. The intended behavior is to wait for confirmation before setting one as Focus or persisting a durable AITP decision, but candidate confirmation is not a runtime-enforced guard on `SetResearchFocus`. Alerts and a generic human gate are implemented; `ResolveResearchDecision` resolves runtime state but does not automatically write an AITP `decision` Entry. A Hakimi Research Line and an AITP workstream are separate namespaces: if their slugs differ, the agent may read the existing workstream but must not silently create an alias or use the Research Line slug for persistence.

The board is read-only. All human edits go through `/research manage` or the individual `/research` subcommands. When an unresolved gate or active alert exists, `/research manage` opens an **Attention view** first. In that view, press `R` to enter a resolution and choose the phase to resume, `A` to acknowledge the alert, or `L` to return to the lines. In Attention view, `R` means resolution; it does not have the ordinary question-view meaning of reopen. Once attention items are cleared, the ordinary manager remains line-first: select a Research Line, press `Enter` to inspect its questions, and press `Esc` to return to the line list. The line view shows status, question counts, and assessment; the question view supports focus, edit, defer, block, close, and reopen actions.

## Steering the research

Research Mode uses optimistic concurrency: every mutating command carries the latest snapshot `revision` as `expectedRevision`. If the agent has modified a question since you last saw the board, the command returns a `research_stale_revision` error and the board refreshes so you can retry with the current revision.

### Research Manager

Open an interactive manager to navigate and edit questions:

```
/research manage
```

In the ordinary line and question views, use `↑` / `↓` to navigate, `F` to set focus, `E` to edit wording, `D` to defer, `B` to block, `C` to close, `R` to reopen, and `Esc` to cancel. These shortcuts are unchanged; only Attention view assigns `R` to resolution.

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

Example:

```
/research focus q-17 -- probe the boundary zero mode with a small-lattice sweep
```

## Save, show, and check barrier

`EnterAITPMode` is always discoverable as the explicit entry tool. Once the mode is active, the remaining Research and AITP tools are exposed according to adapter health:

- **Read tools** (`aitp_enter`, `aitp_list`, `aitp_show`, `aitp_check`) — available when the adapter is `ready` **or** `degraded`. The agent can still browse the ledger and run health checks in degraded mode.
- **Write tools** (`aitp_record_prepare`, `aitp_record_save`, `aitp_note_prepare`, `aitp_note_save`) — available **only** when the adapter is `ready`. Write operations use a single-flight guard: a concurrent mutation is rejected until the current one settles.

This barrier means the agent cannot silently persist evidence when AITP is unhealthy. The adapter validates every versioned read response and unversioned prepare/save response against the installed AITP contract; unknown schemas, statuses, or extra transport fields fail closed instead of being accepted as research state. `aitp_record_prepare` accepts only `observation`, `result`, `failure`, `decision`, `source`, `code_change`, `run`, or `closeout`; Note preparation uses `working` or `theory` mode, and save accepts only the draft path returned by prepare.

`aitp_check` treats exit code 0 as clean and exit code 1 as a successful report containing findings. Findings remain visible without degrading the adapter. A new error finding keeps the relevant checkpoint pending, while a pre-existing error is retained as an auditable receipt warning. Finding codes are projected as opaque strings; the adapter does not implement AITP's `sha256-once:` or `check-policy` semantics. During entry/restore maintenance, valid error findings keep the Research Mode receipt `ready`; only an unavailable or invalid maintenance cycle is `degraded`. Exit code 2 is a failed command: a valid AITP JSON error or invalid check transport degrades the adapter, while an argument-parser misuse is reported as a tool error without poisoning the session. Full-text `Grep` may locate candidate records, but a complete canonical Entry must be read through `aitp_show`; a failed `aitp_show` is never replaced by direct Markdown parsing.

## Degraded mode

The adapter enters `degraded` when any of these conditions hold:

- Python 3.11+ is not found
- The AITP plugin is missing or its contract version is incompatible
- The workspace is not initialized (`not_initialized`)
- `aitp_check` cannot run and returns a valid AITP error, or its success payload fails contract validation

In degraded mode:

- **Read tools** remain available — the agent can still list and show AITP entries.
- **Write tools** are blocked — no `record_save` or `note_save` can execute.
- **AITP writes and active Research Mode Goal completion are blocked** — unresolved human-gate decisions also block Goal completion. Local Question/Line mutations may still occur, but they are not durable AITP writes.
- Research Mode performs no automatic session-closeout. It does **not** automatically run `init`, `init --adopt`, `inventory`, or `backfill --apply`, and the adapter does not expose, call, or parse the upstream `backfill-0.1` success envelope. The user must initialize the workspace manually or resolve the AITP health issue.

You can explicitly choose to proceed without persistence when the adapter is degraded, but this skips ledger writes for that operation.

## Exclusions and limitations

Research Mode has several hard exclusions:

- **Plan overlay**: Research Mode is a long-lived scientific context. Plan mode is a short-lived, nestable overlay that may be active alongside it; entering or exiting Plan mode does not exit or reset Research Mode.
- **Main agent only**: AITP and Research mutation tools are only available on the main agent. Subagents cannot use them — they must return results to the main agent via typed packets.
- **Conversation undo**: Research working state (questions, focus, lines) follows conversation undo through the checkpointed model. The committed AITP cursor does **not** — once a checkpoint is committed to AITP, conversation undo cannot retract that external fact.

## Next steps

- [Slash commands reference](../reference/slash-commands.md#research-mode) — full `/research` command grammar
- [Sessions and context](./sessions.md) — how conversation undo interacts with research state
- [Using Goals](./goals.md) — another special mode; Goal completion is blocked while Research Mode is degraded
