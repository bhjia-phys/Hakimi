# Research Mode

Research Mode is an experimental capability available in both the terminal UI (TUI) and Web. It turns Hakimi into a joint research partner backed by the [AITP](https://github.com/bhjia-phys/AITP-Research-Protocol) evidence ledger: the agent maintains a live portfolio of research questions, steers itself through bounded actions, and persists durable checkpoints to AITP while you retain control through `/research`, the Research Board, and the Research Manager.

::: warning Experimental
Research Mode is gated behind the `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE` (`aitp_research_mode`) experimental flag, which is **disabled by default**. This default-off flag is a Hakimi product setting, not an AITP protocol-state indicator and not an H6 availability signal. Its surface, behavior, and tool names may change between releases. See [Experimental features](../configuration/env-vars.md#runtime-switches) for how flags work.
:::

## Prerequisites

Research Mode has three hard prerequisites. If any is missing, the mode enters a degraded state (explained below) and durable operations are blocked.

- **Python 3.11 or later** — The AITP adapter spawns the AITP CLI via Python. The adapter probes for a compatible Python at mode entry; if none is found, the mode degrades.
- **AITP plugin installed** — The `aitp-research-protocol` plugin must be discoverable in the session skill catalog. The adapter resolves the plugin root, reads its `aitp.contract.json` and `kimi.plugin.json`, and validates the contract version. A missing or incompatible plugin degrades the mode.
- **Initialized AITP workspace** — The current working directory must already be an initialized AITP workspace. The adapter does **not** auto-initialize, adopt, or run `init` / `init --adopt` / `inventory` / `backfill --apply`. An uninitialized workspace degrades the mode.

When all three are satisfied, the adapter enters the `ready` phase and the supported AITP read/write tool surface becomes available to the agent. The adapter does not expose, call, or parse the upstream `backfill-0.1` success envelope, and it does not implement `sha256-once:` or `check-policy` semantics.

For theoretical-physics work, the bundled `theory-physics` plugin is an optional domain pack. It adds physics-specific routing and reporting discipline to the generic Research Loop — when to search literature, how to check a derivation, how to separate scheduler evidence from physical conclusions, and when to request a human decision. It does not add another runtime, autonomous loop, literature database, HPC observer, or AITP schema.

## Enabling Research Mode

The `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE` (`aitp_research_mode`) flag is disabled by default. Set it to `1` before launch to make `/research` available in TUI and Web, show **Research** in the Web composer's **Modes** menu, and expose `EnterAITPMode` to the agent. These entry paths use the same authoritative server snapshot. The flag is a Hakimi product decision only; it does not report an AITP protocol stage or H6 availability, and it only makes the surface available — it does **not** enter Research Mode, probe AITP, show the Research Board, or open AITP plugin skills and research tools. In the inactive state, zero AITP I/O occurs; no `init`, `init --adopt`, `inventory`, or `backfill --apply` is ever auto-run. Enter explicitly from the Web **Modes** menu, with `/research on`, or through the model's `EnterAITPMode` path to activate the adapter for later research turns.

```sh
KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE=1 hakimi
```

To hide the entire Research surface, set `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE=0` before launching. TUI users can also toggle it with `/experiments`; Web follows the server's current flag state and hides the command and panels when disabled. In either surface, the flag-off state hides AITP tools and skills from the model and performs zero AITP I/O.

## Starting and stopping

In Web, open the composer's **Modes** menu and select **Research**. When the shared snapshot is inactive, this starts the capability and shows the Research Board; once the snapshot is `probing`, `ready`, or `degraded`, the same row stays active and opens the Research Manager instead of acting as an on/off switch. The button only activates the capability and Board — it does not create a question or schedule a model turn. Web enforces the Plan mode conflict before either manual transition: turn off Plan mode before starting Research, and exit Research before enabling Plan mode.

You can also use `/research on` in either TUI or the Web composer. Web routes a typed `/research` command through the Research command endpoint rather than sending it as a model prompt. Hakimi activates the AITP adapter, enters the `probing` phase while it checks the workspace, then shows the live Research Board with the resulting `ready` or `degraded` state. Submit a research question after entering, continue an active Goal, or let the model call `EnterAITPMode` while handling a research request. You can optionally select a research line at entry:

```text
/research on
/research on -- boundary-zero-mode
```

In TUI only, entering from `manual` or `yolo` permission mode opens a keyboard prompt asking whether to switch to `auto` or `yolo`. Web uses the session's current permission mode; change it in the Web controls before entering if needed. Neither surface starts an independent background loop, and a research turn may still wait for approval in `manual`. An active Goal remains the sole owner of autonomous continuation across turns.

### Web manual check

1. With the flag enabled and the session idle, open **Modes** and select **Research**. Confirm that the Board appears and reaches `probing`, then `ready` or `degraded`, without scheduling a model response.
2. Open **Modes** again and select the active **Research** row or **Manage**. Confirm that the Research Manager opens instead of exiting the mode.
3. Run `/research off`. Confirm that the Board and **Research** tag disappear and that the **Modes** row returns to its start action.
4. From an inactive session, send a research request that leads the model to call `EnterAITPMode`. Confirm that the same Board and active **Research** entry appear automatically.
5. Restart with `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE=0`. Confirm that the **Research** row and `/research` slash-menu entry are hidden.

To exit Research Mode:

```text
/research off
```

Exiting revokes AITP tool admissions and hides the Research Board in both surfaces. Already-saved AITP records are **not** deleted — they persist in the ledger.

## Checking status

At any time, check the current research snapshot:

```
/research status
```

In TUI, this displays the mode phase, loop status, current research line, focus question, AITP adapter health, and—when available—the current-state maintenance summary. In Web, it refreshes the authoritative session snapshot and expands the live Board.

## Current-state maintenance

After the adapter probe reports `ready`, entering Research Mode performs one read-only AITP cycle: `enter` followed by `check`. Active conversation undo and cold restore repeat the same cycle after their adapter probe. The cycle is per selected workstream when one is provided.

The maintenance receipt and context injection expose only a safe summary: Working Note age, whether active state is newer, unresolved failure count, next action, warning codes, and check status/counts/finding codes. A full Research snapshot/API response or expanded Board may still include checkpoint, revision, and adapter-health fields; those projections are not the maintenance receipt or context injection.

Valid check findings, including error findings, keep the mode `ready`; only an unavailable or invalid `enter`/`check` cycle surfaces `degraded`. Error findings can still block a specific checkpoint according to its save barrier. This maintenance is read-only: it never runs `init`, adopts, or performs backfill, and it never writes a semantic handoff, Entry, or Note automatically. It runs on mode entry and active undo/cold restore only; it is not session-end automatic closeout.

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

When Research Mode is active, a **Research Board** appears above the input area in both TUI and Web. The default compact Board is **science-first**: it tells the story of the research before showing supporting task state. It highlights:

- The scientific phase and most recent state transition
- The latest progress, including completed physics work and its resulting insight or result
- How that result affects the mainline and the current uncertainty
- The current bounded action and any recorded external-run observation
- The effective next step, plus any unresolved human gate or active alert

The phase badge exposes `probing`, `ready`, or `degraded`. Mode, loop, question, focus, and checkpoint changes publish one complete snapshot to both surfaces. TUI rejects stale cold hydration; Web serializes same-session mutations and prevents an older HTTP response from overwriting a newer live WebSocket update.

The board tracks semantic research state, not raw activity. Ordinary tool calls and AITP `list` / `show` / `check` reads do not change it by themselves. During an active research turn, the agent is instructed to create a question before substantive work, set its focus, begin one bounded action with `BeginResearchAction`, and conclude that action with `ConcludeResearchAction` after reporting the physical work, result, tests or derivation, limitations, mainline impact, and next step. `ConcludeResearchAction` does not submit or poll HPC jobs, write AITP, or change a question's assessment automatically. `PlanResearchAction`, `CompleteResearchAction`, `SetResearchPhase`, and `RecordResearchProgress` remain lower-level recovery or maintenance tools rather than the normal action path. The agent should call `UpdateResearchQuestion` only when evidence, failure, or sustained no-progress changes the assessment or next action. This is semantic guidance, not a runtime guarantee that candidate confirmation will guard every focus call. If no such semantic transition occurred, an unchanged board is expected.

TUI additionally projects the session's `TodoList` into the board as **Actions**. Todo state remains separate from Research Questions and the AITP ledger: completing an action does not change an epistemic state or create an AITP Entry. Press `Ctrl-O` in TUI to expand derivation, tests, sources, question counts, checkpoints, alerts, scheduler observations, and Actions; `Ctrl-T` remains the non-research Todo shortcut. In Web, click **Expand** or **Collapse** on the Board; Web uses buttons and forms, not these TUI keyboard shortcuts.

For child-agent work, the main agent can review a strict typed evidence packet containing the claim, evidence, assumptions, tests, sources, artifacts, limitations, and confidence. Reviewing a packet is deliberately zero-write: it does not alter the assessment, epistemic state, or AITP. The main agent must interpret the physics and explicitly record any resulting progress or question change.

For HPC work, the loop can record an explicit observation bound to the current Research Action: campaign, job ID, stage, scheduler state, observation time, next check, and artifact references. This is not a scheduler integration: Hakimi neither submits nor polls jobs, creates a campaign entity, nor treats a `RUNNING` observation as scientific success. A terminal observation must carry an explicit terminal state.

When the agent proposes candidate questions for confirmation, it may register them as open working state so they appear on the board. The intended behavior is to wait for confirmation before setting one as Focus or persisting a durable AITP decision, but candidate confirmation is not a runtime-enforced guard on `SetResearchFocus`. Alerts and a generic human gate are implemented; `ResolveResearchDecision` resolves runtime state but does not automatically write an AITP `decision` Entry. A Hakimi Research Line and an AITP workstream are separate namespaces: if their slugs differ, the agent may read the existing workstream but must not silently create an alias or use the Research Line slug for persistence.

The Board is read-only. Use `/research manage` or a direct `/research` subcommand for changes. Both managers are line-first, but their controls differ. When an unresolved gate or active alert exists, the TUI opens an **Attention view** first: press `R` to enter a resolution and choose the phase to resume, `A` to acknowledge the alert, or `L` to return to the lines. In Attention view, `R` means resolution rather than reopen. After attention items are cleared, TUI selects a Research Line and opens its questions with keyboard commands. Web shows a clickable line list beside Line, Question, Science, and Checkpoint sections; **Science** can resolve the current human decision with an explicit next phase, acknowledge active alerts, review a typed evidence packet, or record an observation for the current external run. These controls update Hakimi Research working state through the Research endpoint and do not write the AITP ledger.

## Steering the research

Research Mode uses optimistic concurrency for revisioned mutations: those commands carry the draft's captured snapshot or entity `revision` as `expectedRevision`, and a stale revision fails without applying the mutation. Checkpoint proposals use the Research snapshot revision captured when the user edits the form, so a later change cannot create a pending checkpoint against newer state. Other mutations rely on captured target or pending-checkpoint identity and server-side state constraints. TUI refreshes the Board for a retry; Web re-reads the same session's authoritative snapshot. If a newer live revision arrives while a Web form is dirty, the Manager preserves the draft, shows a stale warning, and requires a refresh/retry rather than silently replacing the form.

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

Example:

```
/research focus q-17 -- probe the boundary zero mode with a small-lattice sweep
```

## Save, show, and check barrier

The AITP tool surface exposed to the agent is split into two tiers based on adapter health:

- **Read tools** (`aitp_enter`, `aitp_list`, `aitp_show`, `aitp_check`) — available when the adapter is `ready` **or** `degraded`. The agent can still browse the ledger and run health checks in degraded mode.
- **Write tools** (`aitp_record_prepare`, `aitp_record_save`, `aitp_note_prepare`, `aitp_note_save`) — available **only** when the adapter is `ready`. Write operations use a single-flight guard: a concurrent mutation is rejected until the current one settles.

This barrier means the agent cannot silently persist evidence when AITP is unhealthy. The adapter validates every versioned read response and unversioned prepare/save response against the installed AITP contract; unknown schemas, statuses, or extra transport fields fail closed instead of being accepted as research state. `aitp_record_prepare` accepts only `observation`, `result`, `failure`, `decision`, `source`, `code_change`, `run`, or `closeout`; Note preparation uses `working` or `theory` mode, and save accepts only the draft path returned by prepare.

The Web Manager's Checkpoint form preserves this boundary. **Propose** creates only pending Research working state. **Commit** stays disabled until a checkpoint is pending and you enter an explicit existing AITP ledger `entryId`, obtained after the agent or official AITP CLI has completed the canonical save flow. Web sends that ID to the Research command endpoint to link the checkpoint; it never calls `record`/`note`, writes `.aitp` files, or creates a canonical Entry. Supplying an ID does not bypass the save → show → check barrier.

`aitp_check` treats exit code 0 as clean and exit code 1 as a successful report containing findings. Findings remain visible without degrading the adapter. A new error finding keeps the relevant checkpoint pending, while a pre-existing error is retained as an auditable receipt warning. Finding codes are projected as opaque strings; the adapter does not implement AITP's `sha256-once:` or `check-policy` semantics. During entry/restore maintenance, valid error findings keep the Research Mode receipt `ready`; only an unavailable or invalid maintenance cycle is `degraded`. Exit code 2 is a failed command: a valid AITP JSON error or invalid check transport degrades the adapter, while an argument-parser misuse is reported as a tool error without poisoning the session. Full-text `Grep` may locate candidate records, but a complete canonical Entry must be read through `aitp_show`; a failed `aitp_show` is never replaced by direct Markdown parsing.

## Degraded mode

The adapter enters `degraded` when any of these conditions hold:

- Python 3.11+ is not found
- The AITP plugin is missing or its contract version is incompatible
- The workspace is not initialized (`not_initialized`)
- `aitp_check` cannot run and returns a valid AITP error, or its success payload fails contract validation

In degraded mode:

- **Read tools** remain available — the agent can still list and show AITP entries.
- **Write tools and checkpoint commits** are blocked — no `record_save`, `note_save`, or pending-checkpoint commit can execute.
- **AITP writes and active Research Mode Goal completion are blocked** — unresolved human-gate decisions also block Goal completion. Local Question/Line mutations may still occur, but they are not durable AITP writes.
- Research Mode performs no automatic session-closeout. It does **not** automatically run `init`, `init --adopt`, `inventory`, or `backfill --apply`, and the adapter does not expose, call, or parse the upstream `backfill-0.1` success envelope. The user must initialize the workspace manually or resolve the AITP health issue.

## Exclusions and limitations

Research Mode has several hard exclusions:

- **Plan mode conflict**: Plan mode and Research Mode are mutually exclusive at every entry point, including direct API entry. Exit one before entering the other. If an older session restore would activate both, Plan mode wins and Hakimi exits Research Mode before probing AITP or injecting Research guidance.
- **Main agent only**: AITP and Research mutation tools are only available on the main agent. Subagents cannot use them — they must return results to the main agent via typed packets.
- **Conversation undo**: Research working state (questions, focus, lines) follows conversation undo through the checkpointed model. The committed AITP cursor does **not** — once a checkpoint is committed to AITP, conversation undo cannot retract that external fact.

## Next steps

- [Slash commands reference](../reference/slash-commands.md#experimental-research-mode) — full `/research` command grammar
- [Sessions and context](./sessions.md) — how conversation undo interacts with research state
- [Using Goals](./goals.md) — another special mode; Goal completion is blocked while a Research checkpoint is pending
