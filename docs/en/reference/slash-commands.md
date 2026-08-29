# Slash Commands

Slash commands are built-in control commands provided by Hakimi in the interactive TUI, covering account configuration, session management, mode switching, information queries, and more. Type `/` in the input box to trigger command completion — the candidate list filters in real time as you continue typing; command aliases are also matched.

After typing the full command name, press `Enter` to execute. If the `/`-prefixed input does not match any built-in or Skill command, it is sent to the Agent as a regular message.

::: tip
Some commands are only available in the idle state. Executing these commands while a session is streaming output or compacting context will be blocked — press `Esc` or `Ctrl-C` to interrupt first. The "Always available" column in the tables below indicates commands that are also available during streaming.
:::

## Account & Configuration

| Command | Alias | Description | Always available |
| --- | --- | --- | --- |
| `/login` | — | Select an account or platform and log in: Kimi Code uses OAuth, Kimi Platform uses an API key, and experimental ChatGPT OAuth appears after enabling `openai-codex-oauth` in `/experiments` | No |
| `/logout` | — | Clear credentials for the currently selected account | No |
| `/provider` | — | Open the interactive provider manager to view, add, and remove configured providers. See [Platforms & Models — `/provider` and provider management](../configuration/providers.md#provider-—-interactive-provider-management) | Yes |
| `/model` | — | Switch the LLM model used in the current session | Yes |
| `/preset` | — | Configure and activate canonical `main`, Agent, AgentSwarm, and Tower model routes through `[subagent]` | No |
| `/secondary-model` | `/subagent-model` | Deprecated compatibility command. It is hidden from completion and help; typing it only shows a migration notice. Use `/preset` instead | Yes |
| `/settings` | `/config` | Open the settings panel inside the TUI | Yes |
| `/experiments` | `/experimental` | Open the experimental feature panel | Yes |
| `/permission` | — | Select a permission mode | Yes |
| `/editor` | — | Configure the external editor launched by `Ctrl-G` | Yes |
| `/theme` | — | Switch the terminal UI color theme | Yes |

## Session Management

| Command | Alias | Description | Always available |
| --- | --- | --- | --- |
| `/new` | `/clear` | Start a fresh session, discarding the current context | No |
| `/sessions` | `/resume` | Browse historical sessions and switch to / restore one | No |
| `/tasks` | `/task` | Browse the background task list | Yes |
| `/fork` | — | Fork a new session from the current one, preserving the full conversation history; you stay in the current session | No |
| `/title [<text>]` | `/rename` | Without arguments, display the current session title; with an argument, set a new title (max 200 characters) | Yes |
| `/compact [<instruction>]` | — | Compact the current conversation context to free up token usage; an optional custom instruction can hint to the model what to preserve | No |
| `/undo [<count>]` | — | Undo recent prompts from the active context. Without a count, opens a selector; with a count, undoes that many prompts. Prompts before the last compaction cannot be undone. Undoing also rolls back the todo list and plan mode state produced by those prompts (code changes are not reverted) | No |
| `/reload` | — | Reload the current session and apply the latest `config.toml` settings (providers, models, etc.) and `tui.toml` UI preferences, without restarting the CLI | No |
| `/reload-tui` | — | Reload only the `tui.toml` UI preferences (theme, editor, notifications, etc.) without rebuilding the session | Yes |
| `/init` | — | Analyze the current codebase and generate `AGENTS.md` | No |
| `/export-md [<path>]` | `/export` | Export the current session as a Markdown file | No |
| `/export-debug-zip` | — | Export the current session as a debug ZIP archive (same behavior as [`hakimi export`](./kimi-command.md#hakimi-export)) | No |
| `/copy` | — | Copy the last assistant message to the clipboard | No |
| `/add-dir [<path>]` | — | Add an extra workspace directory to the current session. Run without a path (or with `list`) to list configured directories. When adding, choose whether to remember the directory for the project in `.kimi-code/local.toml` | No |
| `/web` | — | Open the current session in the web UI: pick a running server to connect to, or start a new foreground server after the TUI exits. See [`hakimi web`](./kimi-command.md#hakimi-web) | Yes |

## Modes & Run Control

| Command | Alias | Description | Always available |
| --- | --- | --- | --- |
| `/yolo [on\|off]` | `/yes` | Toggle YOLO mode. Without arguments, flips the current state; explicitly passing `on`/`off` forces the setting. When enabled, skips approval for regular tool calls; Plan mode exit approval is not affected | Yes |
| `/auto [on\|off]` | — | Toggle auto permission mode. When enabled, tool approvals are handled automatically and the Agent will not ask the user questions | Yes |
| `/plan [on\|off]` | — | Toggle Plan mode. Without arguments, flips the current state; explicitly passing `on`/`off` forces the setting. Simply toggling does not create an empty plan file | Yes |
| `/plan clear` | — | Clear the current plan | No |
| `/swarm on\|off` | — | Turn swarm mode on or off without sending a prompt. | Yes |
| `/swarm <task>` | — | Turn swarm mode on, then send `<task>` as a normal prompt. If the turn completes normally, swarm mode turns off automatically. In `manual` permission mode, Hakimi asks whether to switch to `auto` or `yolo` before starting. | No |
| `/goal [...]` | — | Start or manage an autonomous goal | See below |
| `/research [...]` | — | Control experimental AITP Research Mode (`aitp_research_mode` flag, default off) | See below |

::: warning
`/yolo` skips approval for regular tool calls. Please make sure you understand the potential risks before enabling it. Plan mode exit approval is not bypassed by `/yolo`; `Bash` inside Plan mode is still subject to the regular `/yolo` allow rules.
:::

## Autonomous Goal

`/goal` starts or manages goal mode: a persistent objective that Hakimi works toward across automatically continuing turns. For usage guidance and examples, see [Goals](../guides/goals.md).

```sh
/goal Update the checkout docs, run docs build, and stop if still blocked after 20 turns
```

| Command | Action | Availability |
| --- | --- | --- |
| `/goal` or `/goal status` | Display the current goal along with its status, elapsed time, turn count, and token count | Always available |
| `/goal pause` | Pause an active goal and keep it | Always available |
| `/goal resume` | Resume a paused or blocked goal | Idle only |
| `/goal cancel` | Remove the current goal | Always available |
| `/goal replace <objective>` | Replace the saved goal with a new objective | Idle only |
| `/goal next <objective>` | Queue an upcoming goal for this session. If no goal is active, start it immediately. The agent does not see queued goals until the current goal completes | Always available |
| `/goal next manage` | Open the upcoming-goal manager. Use <kbd>↑</kbd> / <kbd>↓</kbd> to browse, <kbd>Space</kbd> to select a goal for moving, selected <kbd>↑</kbd> / <kbd>↓</kbd> to reorder it, <kbd>E</kbd> to edit, <kbd>D</kbd> to delete, and <kbd>Esc</kbd> to cancel. In the edit field, use <kbd>Shift-Enter</kbd> or <kbd>Ctrl-J</kbd> for a new line and <kbd>Enter</kbd> to save | Always available |

The words `status`, `pause`, `resume`, `cancel`, `replace`, and `next` act as subcommands only when they are the first word after `/goal`. If your objective needs to start with one of those words, put `--` before it:

```sh
/goal -- cancel the old rollout note after the new docs are published
```

If an upcoming goal needs to start with `manage`, put `--` after `next`:

```sh
/goal next -- manage the release checklist
```

In non-interactive prompt mode, only the create forms start goal mode:

```sh
hakimi -p "/goal Fix the failing checkout test"
```

Prompt mode exits with code `0` when the goal completes, `3` when it blocks, and `6` when it pauses. Other `/goal` subcommands, including `next`, are TUI controls and are not handled by `hakimi -p`.

## Experimental Research Mode

`/research` controls the experimental AITP Research Mode in both TUI and Web. It is gated behind the `aitp_research_mode` experimental flag (env `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE`, default off; set it to `1` before launch). Enabling the flag only exposes `/research`, the Web **Modes** entry, and `EnterAITPMode`; the mode stays inactive with zero AITP I/O until `/research on`, the Web entry, or the model path succeeds. Set the flag to `0` to hide the feature in both surfaces. TUI can also toggle it through `/experiments`; Web follows the server's flag state.

::: warning
Research Mode is experimental. `/research on` activates the adapter and Board but does not schedule a model turn or start an independent multi-turn loop. Goal remains the sole cross-turn continuation owner, and research turns in `manual` permission mode may wait for approvals.
:::

The grammar is the same in TUI and Web: reserved subcommands are honored only as the first token, and `--` separates arguments from free text. Web routes a typed `/research` through the Research endpoint rather than sending it as a model prompt.

| Command | Action | Surfaces / availability |
| --- | --- | --- |
| `/research` or `/research status` | Refresh the current snapshot. TUI prints mode, loop, line, focus, and AITP health; Web expands the refreshed Board | TUI and Web; always available |
| `/research on` | Enter Research Mode. TUI prompts for a permission-mode choice when entering from `manual` or `yolo`; Web uses the current session permission mode | TUI and Web; idle only |
| `/research on -- <line slug>` | Enter Research Mode and switch to a specific research line | TUI and Web; idle only |
| `/research off` | Exit Research Mode, revoke AITP tool admissions, and hide the Board; saved AITP records remain | TUI and Web; idle only |
| `/research pause` | Pause the research loop without exiting AITP mode | TUI and Web; always available |
| `/research resume` | Resume a paused research loop | TUI and Web; always available |
| `/research manage` | Open the line-first Manager. TUI uses keyboard navigation and action keys; Web provides Line, Question, Science, and Checkpoint sections, including human-decision, alert, evidence-review, and external-run controls | TUI and Web; idle only |
| `/research edit <questionId> -- <new wording>` | Replace a question's wording using the current snapshot revision | TUI and Web; idle only |
| `/research focus <questionId> -- <bounded action>` | Set the current focus question and its next bounded action | TUI and Web; idle only |
| `/research defer <questionId> [-- <reason>]` | Defer a question (workflow disposition change; reason optional) | TUI and Web; idle only |
| `/research block <questionId> [-- <reason>]` | Block a question | TUI and Web; idle only |
| `/research close <questionId> [-- <reason>]` | Close a question | TUI and Web; idle only |
| `/research reopen <questionId> [-- <reason>]` | Reopen a previously closed question | TUI and Web; idle only |
| `/research line <slug>` | Switch the current research line | TUI and Web; idle only |

Subcommands (`on`, `off`, `pause`, `resume`, `manage`, `status`, `edit`, `focus`, `defer`, `block`, `close`, `reopen`, `line`) are only honored as the first token. If your text needs to start with one of those words, use `--`:

```sh
/research focus q-17 -- on the boundary zero mode
```

While the main turn or context compaction is running, both surfaces accept only `/research status`, `/research pause`, and `/research resume`; Web does not open the Manager or accept Manager mutations until the current operation ends.

Revisioned mutations carry the draft's captured snapshot or entity `revision` as `expectedRevision`; a stale revision fails without applying the mutation. Other mutations do not carry `expectedRevision` and instead rely on captured target or pending-checkpoint identity and server-side state constraints. TUI refreshes the Board; Web re-reads the same session's authoritative snapshot and preserves a dirty form with a stale warning so you can refresh and retry.

The read-only Research Board appears above the input area in both surfaces and shows `probing`, `ready`, or `degraded` health, current line and focus, question counts, alerts, and checkpoint state. TUI additionally projects Todo Actions and uses `Ctrl-O` to expand or collapse the Board. Web uses **Expand**, **Collapse**, and **Manage** buttons plus forms; the TUI shortcuts do not apply there.

Web checkpoint controls do not write AITP. **Commit** requires a pending checkpoint and an explicit existing AITP `entryId`; Web only links that ID through the Research endpoint and never invokes `record`/`note` or writes canonical ledger files.

When AITP is missing, uninitialized, or its `check` returns exit 2, both surfaces show `degraded`. Read tools remain available, but AITP write tools, checkpoint commits, and active Research Mode Goal completion are blocked; unresolved human-gate decisions also block Goal completion. Local Question/Line mutations may still occur, but they are not durable AITP writes. Research Mode performs no automatic session closeout and never auto-runs `init`, `init --adopt`, `inventory`, or `backfill --apply`; `backfill` is not a model tool in this slice.

## Information & Status

| Command | Alias | Description | Always available |
| --- | --- | --- | --- |
| `/help` | `/h`, `/?` | Show keyboard shortcuts and all available commands | Yes |
| `/btw [question]` | — | Open a side conversation in a forked sub-Agent without affecting the current main Agent turn; without a question, opens the panel first to wait for input | Yes |
| `/usage` | — | Show token usage, context consumption, and quota information | Yes |
| `/status` | — | Show the current session runtime state: version, model, working directory, permission mode, etc. | Yes |
| `/mcp` | — | List MCP servers and their connection status in the current session | Yes |
| `/plugins` | — | Open the interactive plugin manager | Yes |
| `/version` | — | Display the Hakimi version number | Yes |
| `/feedback` | `/bug` | Submit feedback with optional diagnostic logs and codebase context | Yes |

## Exit

| Command | Alias | Description | Always available |
| --- | --- | --- | --- |
| `/exit` | `/quit`, `/q` | Exit Hakimi | No |

## Built-in skill commands

Hakimi ships with a set of built-in Skills that appear directly as `/<name>` slash commands. Unlike external Skills, they do not require the `skill:` prefix and are available out of the box.

| Command | Description |
| --- | --- |
| `/mcp-config` | Configure MCP servers and handle MCP OAuth login. See [MCP](../customization/mcp.md) |
| `/custom-theme [<text>]` | Create or edit a custom TUI color theme. See [Themes](../customization/themes.md) |
| `/update-config` | Inspect or edit `config.toml` (model, provider, permission, hooks) and `tui.toml` (theme, editor, notifications, auto-update) |
| `/check-hakimi-docs` | Answer Hakimi product questions (CLI usage, configuration, skills, MCP, hooks, server API, error codes) against the official Hakimi docs. `/check-kimi-code-docs` is a compatibility alias that the model never invokes automatically — use it explicitly only for Kimi platform questions (account, membership, quota, platform error codes). Legacy v1 engines only expose `/check-kimi-code-docs` |
| `/import-from-cc-codex` | Import Claude Code and Codex instructions, skills, and MCP settings into Hakimi |
| `/sub-skill` | Discover and reorganize the local skill inventory into hierarchical sub-skill bundles. Includes `/sub-skill.review` (read-only proposal) and `/sub-skill.consolidate` (apply the reorganization) |

All built-in Skill commands are only available in the idle state.

## Skill Dynamic Commands

Activated external Skills are automatically registered as slash commands. Ordinary external Skills use the `skill:` namespace prefix:

```
/skill:<name> [extra text]
```

For example, `/skill:code-style` loads the Skill named `code-style` and sends it to the Agent; any text appended after the command is concatenated to the Skill prompt.

External sub-skills appear directly in the slash command panel with dotted names:

```
/<parent-skill>.<sub-skill> [extra text]
```

For example, a child Skill named `review` inside a parent Skill named `code-style` is shown as `/code-style.review`. The dotted command name is derived from the hierarchy; the child `SKILL.md` can keep its local `name`.

For convenience, external Skill commands also support a shorthand form that omits the `skill:` prefix — `/<name>` — as long as the name is not taken by a system slash command. That is, `/code-style` falls back to matching `/skill:code-style`.

Built-in Skills shipped with Hakimi appear directly as `/<name>` in the slash command panel. For example, `/mcp-config` helps configure MCP servers and handle MCP OAuth login, and `/custom-theme [extra text]` invokes the custom-theme workflow to create or edit a TUI theme.

::: info
All Skill commands are only available in the idle state. `flow`-type Skills are also exposed via `/skill:<name>` — there is no separate `/flow:` namespace.
:::

For installing and authoring Skills, see [Agent Skills](../customization/skills.md).

## Next steps

- [Keyboard Shortcuts](./keyboard.md) — Quick reference for TUI keyboard operations
- [Built-in Tools](./tools.md) — Complete reference for tools the Agent can call
