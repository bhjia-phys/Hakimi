# Slash Commands

Slash commands are built-in control commands provided by Hakimi in the interactive TUI, covering account configuration, session management, mode switching, information queries, and more. Type `/` in the input box to trigger command completion — the candidate list filters in real time as you continue typing; command aliases are also matched.

After typing the full command name, press `Enter` to execute. If the `/`-prefixed input does not match any built-in or Skill command, it is sent to the Agent as a regular message.

::: tip
Some commands are only available in the idle state. Executing these commands while a session is streaming output or compacting context will be blocked — press `Esc` or `Ctrl-C` to interrupt first. The "Always available" column in the tables below indicates commands that are also available during streaming.
:::

## Account & Configuration

| Command | Alias | Description | Always available |
| --- | --- | --- | --- |
| `/login` | — | Select an account or platform and log in: Kimi Code uses OAuth, Kimi Platform uses an API key, and ChatGPT / OpenAI Codex uses OAuth | No |
| `/logout` | — | Clear credentials for the currently selected account | No |
| `/provider` | — | Open the interactive provider manager to view, add, and remove configured providers. See [Platforms & Models — `/provider` and provider management](../configuration/providers.md#provider-—-interactive-provider-management) | Yes |
| `/model` | — | Switch the LLM model used in the current session | Yes |
| `/preset` | — | Configure and activate canonical `main`, Agent, AgentSwarm, and Tower routes. Manual choices are locked; run `/preset auto` to resume automatic selection | No |
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
| `/remote` | — | Hand off the current TUI session to a foreground Cloudflare Quick Tunnel. The link opens that session first, then provides full Web access to all workspaces and sessions. Plain `/remote` uses an 8h TTL; advanced use can add `--ttl <duration>` (maximum 24h) or `--cloudflared <absolute-path>`. Hakimi Web can start a share from its visible conversation-header button without a handoff. See [Remote control from another device](../guides/sessions.md#remote-control-from-another-device) | No |

## Modes & Run Control

| Command | Alias | Description | Always available |
| --- | --- | --- | --- |
| `/yolo [on\|off]` | `/yes` | Toggle YOLO mode. Without arguments, flips the current state; explicitly passing `on`/`off` forces the setting. When enabled, skips approval for regular tool calls; Plan mode exit approval is not affected | Yes |
| `/auto [on\|off]` | — | Toggle auto permission mode. Tool approvals are handled automatically and ordinary questions are suppressed; explicit protocol-owned workflow decisions may still pause | Yes |
| `/plan [on\|off]` | — | Toggle Plan mode. Without arguments, flips the current state; explicitly passing `on`/`off` forces the setting. Simply toggling does not create an empty plan file | Yes |
| `/plan clear` | — | Clear the current plan | No |
| `/swarm on\|off` | — | Turn swarm mode on or off without sending a prompt. | Yes |
| `/swarm <task>` | — | Turn swarm mode on, then send `<task>` as a normal prompt. If the turn completes normally, swarm mode turns off automatically. In `manual` permission mode, Hakimi asks whether to switch to `auto` or `yolo` before starting. | No |
| `/goal [...]` | — | Start or manage an autonomous goal | See below |
| `/research [...]` | — | Control AITP Research Mode; the command is discoverable by default and the mode starts inactive | See below |

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

## Research Mode

**Locally implemented and installed; running processes need a restart.** The lightweight Research Mode retains only the basic mode commands for local-knowledge and long-term-memory guidance. Turning it on makes discoverable official AITP skills visible; turning it off hides those skills while preserving existing project knowledge and AITP records. `/research status` reads local mode state. None of these commands installs AITP, probes or initializes a store, runs CLI maintenance, writes the ledger, or starts a background loop.

| Command | Action | Surfaces / availability |
| --- | --- | --- |
| `/research on` | Enable the lightweight mode and official AITP skill visibility | TUI and Web; available locally |
| `/research status` | Read local mode status without running the AITP CLI | TUI and Web; available locally |
| `/research off` | Disable the mode and skill visibility; existing knowledge and records remain | TUI and Web; available locally |

The old research-management and advancement commands — including pause/resume, Manager, question and line mutations, alignment, and checkpoint operations — are no longer supported. Do not infer aliases, extra flags, or a legacy command workflow from historical records. Read those records through raw session logs or session exports; there is no structured Research history API or Manager. The CLI wrapper currently points at the built workspace output, so newly started processes use this implementation; already-running processes keep the previous code until restarted, and no user session has been force-restarted.

Research Mode does not create a second Goal, Plan mode, or permission layer. Goal remains responsible for cross-turn continuation, budgets, and completion; ordinary tool permissions continue to apply. The retired host Research veto does not become a new guarantee that ordinary file tools cannot touch canonical AITP files: official CLI validation constrains only its own operations and is not OS-level isolation.

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
