# Research Mode

Research Mode is an experimental capability that turns Hakimi into a joint research partner backed by the [AITP](https://github.com/bhjia-phys/AITP-Research-Protocol) evidence ledger. Instead of answering a single question and forgetting, the agent maintains a live portfolio of research questions, steers itself through bounded actions, and persists durable checkpoints to AITP — all while you retain full control through slash commands and the Research Board.

::: warning Experimental
Research Mode is gated behind the `aitp_research_mode` experimental flag, which is **enabled by default**. Its surface, behavior, and tool names may change between releases. See [Experimental features](../configuration/env-vars.md#runtime-switches) for how flags work.
:::

## Prerequisites

Research Mode has three hard prerequisites. If any is missing, the mode enters a degraded state (explained below) and durable operations are blocked.

- **Python 3.11 or later** — The AITP adapter spawns the AITP CLI via Python. The adapter probes for a compatible Python at mode entry; if none is found, the mode degrades.
- **AITP plugin installed** — The `aitp-research-protocol` plugin must be discoverable in the session skill catalog. The adapter resolves the plugin root, reads its `aitp.contract.json` and `kimi.plugin.json`, and validates the contract version. A missing or incompatible plugin degrades the mode.
- **Initialized AITP workspace** — The current working directory must already be an initialized AITP workspace. The adapter does **not** auto-initialize, adopt, or run `init` / `init --adopt` / `inventory` / `backfill --apply`. An uninitialized workspace degrades the mode.

When all three are satisfied, the adapter enters the `ready` phase and the full AITP tool surface becomes available to the agent.

## Enabling Research Mode

The `aitp_research_mode` flag is enabled by default, so a plain launch already makes the `/research` command and the `EnterAITPMode` capability available to the agent. However, the flag only makes the surface available — it does **not** enter Research Mode, probe AITP, show the Research Board, or open AITP plugin skills and research tools. In the inactive state, zero AITP I/O occurs; no `init`, `init --adopt`, `inventory`, or `backfill --apply` is ever auto-run. You still need to enter the mode explicitly (via `/research on` or the model `EnterAITPMode` entry path) to activate the AITP adapter and make the research capabilities available to subsequent research turns.

```sh
hakimi
```

To hide the entire Research surface, set `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE=0` before launching, or toggle it off interactively with `/experiments` inside the TUI. When the flag is off, the `/research` command is hidden from autocomplete, all AITP tools and skills are invisible to the model, and zero AITP I/O occurs.

## Starting and stopping

Use `/research on` to enter Research Mode. Hakimi activates the AITP adapter, probes the workspace, and shows the Research Board. The command does not create a research question or schedule a model turn by itself: submit a research question after entering, continue an active Goal, or let the model call `EnterAITPMode` while handling a research request. You can optionally select a research line at entry:

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

This displays the mode phase, loop status, current research line, the focus question, and AITP adapter health.

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

When Research Mode is active, a **Research Board** appears in the live chrome area (the persistent UI region above the input box). The board shows a curated view of the research state — not the full portfolio, but the items that need your attention:

- The current focus question and its next bounded action
- Questions that are blocked or contradicted
- Recently reopened questions
- Recently closed questions

Mode, loop, question, focus, and checkpoint changes publish one complete snapshot to the TUI, so the board updates immediately without polling. A cold session read cannot overwrite a newer live update.

The board tracks semantic research state, not raw activity. Ordinary tool calls and AITP `list` / `show` / `check` reads do not change it by themselves. During an active research turn, the agent is instructed to create a question before substantive work, declare each bounded action with `SetResearchFocus`, and call `UpdateResearchQuestion` only when evidence, failure, or sustained no-progress changes the assessment or next action. If no such semantic transition occurred, an unchanged board is expected.

Research Mode also projects the session's `TodoList` into the board as **Actions**. Todo state remains separate from the Research Question and the AITP ledger: completing an action does not itself change an epistemic state or create an AITP Entry. In the compact view, the board shows the current bounded action and Todo progress. Press `Ctrl-O` to expand the board in place and inspect the current line, line summaries, assessment, evidence counts, checkpoint status, alerts, and the bounded Actions list; press `Ctrl-O` again to collapse it. In ordinary non-research mode, `Ctrl-T` continues to expand the standalone Todo panel.

When the agent proposes candidate questions for confirmation, it may register them as open working state so they appear on the board. It must not set one as Focus or persist a durable AITP decision until you confirm it. A Hakimi Research Line and an AITP workstream are separate namespaces: if their slugs differ, the agent may read the existing workstream but must not silently create an alias or use the Research Line slug for persistence.

The board is read-only. All human edits go through `/research manage` or the individual `/research` subcommands. The manager is line-first: select a Research Line, press `Enter` to inspect its questions, and press `Esc` to return to the line list. The line view shows status, question counts, and assessment; the question view supports focus, edit, defer, block, close, and reopen actions.

## Steering the research

Research Mode uses optimistic concurrency: every mutating command carries the latest snapshot `revision` as `expectedRevision`. If the agent has modified a question since you last saw the board, the command returns a `research_stale_revision` error and the board refreshes so you can retry with the current revision.

### Research Manager

Open an interactive manager to navigate and edit questions:

```
/research manage
```

Use `↑` / `↓` to navigate, `F` to set focus, `E` to edit wording, `D` to defer, `B` to block, `C` to close, `R` to reopen, and `Esc` to cancel.

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

`aitp_check` treats exit code 0 as clean and exit code 1 as a successful report containing findings. Warning-only findings remain visible but do not degrade the adapter or block a checkpoint cursor; error findings keep that checkpoint pending. Exit code 2 is a failed command: a valid AITP JSON error or invalid check transport degrades the adapter, while an argument-parser misuse is reported as a tool error without poisoning the session. Full-text `Grep` may locate candidate records, but a complete canonical Entry must be read through `aitp_show`; a failed `aitp_show` is never replaced with direct Markdown parsing.

## Degraded mode

The adapter enters `degraded` when any of these conditions hold:

- Python 3.11+ is not found
- The AITP plugin is missing or its contract version is incompatible
- The workspace is not initialized (`not_initialized`)
- `aitp_check` cannot run and returns a valid AITP error, or its success payload fails contract validation

In degraded mode:

- **Read tools** remain available — the agent can still list and show AITP entries.
- **Write tools** are blocked — no `record_save` or `note_save` can execute.
- **Question closure, Goal completion, and session closeout are blocked** — these operations require a healthy adapter because they depend on durable persistence.
- Research Mode does **not** automatically run `init`, `init --adopt`, `inventory`, or `backfill --apply`. The user must initialize the workspace manually or resolve the AITP health issue.

You can explicitly choose to proceed without persistence when the adapter is degraded, but this skips ledger writes for that operation.

## Exclusions and limitations

Research Mode has several hard exclusions:

- **Plan mode conflict**: Plan mode and Research Mode are mutually exclusive. Exit one before entering the other.
- **Main agent only**: AITP and Research mutation tools are only available on the main agent. Subagents cannot use them — they must return results to the main agent via typed packets.
- **Conversation undo**: Research working state (questions, focus, lines) follows conversation undo through the checkpointed model. The committed AITP cursor does **not** — once a checkpoint is committed to AITP, conversation undo cannot retract that external fact.

## Next steps

- [Slash commands reference](../reference/slash-commands.md#experimental-research-mode) — full `/research` command grammar
- [Sessions and context](./sessions.md) — how conversation undo interacts with research state
- [Using Goals](./goals.md) — another special mode; Goal completion is blocked while Research Mode is degraded
