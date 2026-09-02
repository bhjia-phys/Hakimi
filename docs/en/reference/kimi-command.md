# `hakimi` Command

`hakimi` is the main command for Hakimi, used to start an interactive session in the terminal. Running it without any arguments opens a new session in the current working directory; combined with different flags, you can resume a previous session, skip approvals, start in Plan mode, or load Skills from a custom directory.

```sh
hakimi [options]
hakimi <subcommand> [options]
```

## Main Command Options

All flags are optional — run `hakimi` directly to enter an interactive session:

| Option | Short | Description |
| --- | --- | --- |
| `--version` | `-V` | Print the version number and exit |
| `--help` | `-h` | Show help information and exit |
| `--session [id]` | `-S` | Resume a session. With an ID, opens that session directly; without an ID, enters an interactive selector |
| `--continue` | `-c` | Continue the most recent session in the current working directory, without specifying an ID manually |
| `--model <model>` | `-m` | Specify a model alias for this launch. When omitted, new sessions use `default_model` from the config file |
| `--prompt <prompt>` | `-p` | Run a single prompt non-interactively and stream the Assistant output to stdout. This mode does not open the TUI |
| `--output-format <format>` | | Set the non-interactive output format; supports `text` and `stream-json`. Can only be used with `--prompt`; defaults to `text` |
| `--yolo` | `-y` | Auto-approve regular tool calls, skipping approval requests |
| `--auto` | | Start with auto permission mode; tool approvals are handled automatically and the Agent will not ask the user questions |
| `--plan` | | Start a new session in Plan mode — the AI will prioritize read-only tools for exploration and planning |
| `--skills-dir <dir>` | | Load Skills from the specified directory, replacing the automatically discovered user and project directories. Can be repeated |
| `--agent <name>` | | Start a new session with the specified agent as the main Agent. Cannot be combined with `--session`/`--continue` |
| `--agent-file <path>` | | Load a custom agent from a Markdown file for the new session and select it. Cannot be repeated or combined with `--agent`, `--session`, or `--continue` |
| `--add-dir <dir>` | | Add an extra workspace directory for this session. Relative paths resolve against the current working directory. Can be repeated |

`-r` / `--resume` is a hidden alias for `--session`; `--yes` and `--auto-approve` are hidden aliases for `--yolo` and are not shown in help output.

::: warning
`--yolo` skips human approval for regular tool calls, including file writes and shell command execution. Use it only in trusted working directories. Plan mode exit approval is not bypassed by `--yolo`; `Bash` inside Plan mode is handled under the regular allow rules.
:::

### Flag Conflict Rules

The following combinations are rejected at startup:

- `--continue` and `--session` are mutually exclusive — both mean "resume a previous session"
- `--yolo` and `--auto` are mutually exclusive — the two permission modes cannot be combined
- `--prompt` cannot be used with `--yolo`, `--auto`, or `--plan` — non-interactive mode uses `auto` permission by default
- `--output-format` can only be used together with `--prompt`

When resuming a session, you can override its saved permission or plan mode by adding `--auto`, `--yolo`, or `--plan`. For example, `hakimi --continue --auto` resumes the latest session and switches it to auto permission mode.

## Common Usage

Start a new session directly:

```sh
hakimi
```

Pick up where you left off (automatically finds the most recent session in the current directory):

```sh
hakimi --continue
```

Choose from the session history list, or specify a known ID directly:

```sh
hakimi --session
hakimi --session 01HZ...XYZ
```

Skip approval prompts — suitable for batch tasks that are known to be safe:

```sh
hakimi --yolo
```

Let the Agent handle everything autonomously, without asking the user questions:

```sh
hakimi --auto
```

Read the code and produce an implementation plan before making any file changes:

```sh
hakimi --plan
```

### Custom Skills Directories

There are two ways to specify Skills directories, with different semantics:

- **`--skills-dir <dir>`** (CLI flag): **Replaces** the automatically discovered user and project directories for this launch only. Can be repeated to stack multiple directories:

  ```sh
  hakimi --skills-dir /path/to/team-skills --skills-dir ./local-skills
  ```

- **`extra_skill_dirs`** (`config.toml`): **Adds** directories on top of the automatically discovered ones, taking effect permanently. Suitable for configuring team-shared Skills. See [Agent Skills](../customization/skills.md).

### Custom Agents

`--agent` and `--agent-file` select which agent drives a new session, in both print mode (`hakimi -p`) and the interactive TUI:

```sh
hakimi --agent reviewer
hakimi -p --agent reviewer "Review the changes on this branch"
```

`--agent-file` registers a single agent file at the highest priority for this launch only and selects it; the flag cannot be repeated, and `--agent` and `--agent-file` are mutually exclusive. Both flags only apply when starting a new session — neither can be combined with `--session`/`--continue`, because the agent is bound at session creation and resuming restores the bound agent automatically. The selection is fixed at the session's first bind and cannot be switched later; in the TUI the flags bind only the startup session, and a session created later in the same process (for example via `/new`) starts with the default agent. See [Agents and Sub-Agents](../customization/agents.md#custom-agents) for the agent file format and discovery directories.

## Non-Interactive Execution

When running a single prompt in a script or CI environment, use `-p`:

```sh
hakimi -p "Summarize the current repository status"
```

Output uses a transcript style: thinking content and Assistant text are both prefixed with `• `, and wrapped lines are indented by two spaces. Assistant text goes to stdout; thinking, tool progress, and "resuming session" notices go to stderr. In `-p` mode, no human approval is requested — regular tool calls are handled under the `auto` permission policy, while static deny rules remain in effect.

Temporarily switch the model:

```sh
hakimi -m kimi-code/kimi-for-coding -p "Explain the latest diff"
```

When you need to parse output programmatically, use the `stream-json` format — each line on stdout is a JSON object:

```sh
hakimi -p "List changed files" --output-format stream-json
```

In `stream-json` mode, regular replies produce an Assistant message; when the model calls a tool, an Assistant message with `tool_calls` is emitted first, followed by the corresponding Tool message, then subsequent Assistant messages. Thinking content is not written to JSONL; tool progress and "resuming session" notices are still written to stderr.

## Subcommands

`hakimi` provides the following subcommands: `login` (non-interactive login), `acp` (ACP IDE mode), `web` (run the local REST/WebSocket/web service in the foreground and open the web UI), `remote` (manage persistent personal remote access), `doctor` (validate configuration files), `export` (export a session), `migrate` (migrate legacy data), `upgrade` (check for updates), and `provider` (manage providers).

### `hakimi login`

Log in to Kimi Code OAuth or the ChatGPT / OpenAI Codex OAuth provider via a device-code flow, without entering the TUI. OAuth login starts only when you explicitly run this command (or call the corresponding API login); startup, auth status, and cached-token reads never start a login flow. The command prints the verification URL and user code to stderr, then polls until browser-side authorization is complete. The generated token is written to the same local location as TUI `/login` and is loaded automatically on the next launch.

```sh
hakimi login
hakimi login --provider openai-codex
hakimi login --provider openai-codex --no-open
```

| Option | Description |
| --- | --- |
| `--provider <provider>` | Select `kimi-code` (default) or `openai-codex`; `chatgpt` is accepted as an alias. |
| `--enable-experimental` | Deprecated compatibility option; has no effect. |
| `--no-open` | Print the device URL and user code without attempting to open a browser. |

ChatGPT / OpenAI Codex OAuth is available without an experimental switch. Its generated model aliases are `openai-codex/gpt-5.6-sol`, `openai-codex/gpt-5.6-terra`, and `openai-codex/gpt-5.6-luna`. OAuth network activity occurs only through an explicit login or an API/token request that needs authentication; Hakimi never logs in merely because it starts. Press `Ctrl-C` at any time during polling to cancel; the exit code is `1` on cancellation or failure, and `0` on success.

### `hakimi acp`

Switch Hakimi to ACP (Agent Client Protocol) mode, communicating with an IDE via JSON-RPC over stdin/stdout so the editor can directly drive the CLI's sessions and tool calls. You typically do not need to run this manually — the IDE starts it as a subprocess entry point. For configuration, see [Using in IDEs](../guides/ides.md); for technical details, see the [hakimi acp reference](./kimi-acp.md).

```sh
hakimi acp
```

### `hakimi web`

Run the local Hakimi server in the foreground of the current terminal — a single process that exposes the REST + WebSocket API and serves the web UI from the same origin — and open the web UI in the default browser once it is ready. The command stays attached to the terminal and shuts down cleanly on `SIGINT` / `SIGTERM` (e.g. `Ctrl-C`).

When the server is running, `GET /openapi.json` returns the REST OpenAPI document and `GET /asyncapi.json` returns the local WebSocket AsyncAPI document. For an end-to-end walkthrough of driving sessions over the API, see [Local server and API](../guides/server.md); for the protocol details, see the [Server API](./server-api.md) reference.

```sh
hakimi web                 # run the server in the foreground and open the browser
hakimi web --no-open       # don't open the browser
hakimi web --port 58628    # pick a specific bind port
```

Multiple instances can share one home directory: each registers itself under `~/.hakimi/server/instances/`, and a busy port is retried with `port + 1` (58628, 58629, …).

| Option | Description |
| --- | --- |
| `--port <port>` | Bind port; defaults to `58627`; a busy port is retried with `+1` |
| `--host [host]` | Bind host; omit for `127.0.0.1` (this machine only), pass a bare `--host` for `0.0.0.0` (all interfaces) |
| `--allowed-host <host...>` | Extra Host header values allowed through the DNS-rebinding check; repeatable or comma-separated |
| `--log-level <level>` | Enable server logs at the selected level; omitted by default |
| `--debug-endpoints` | Mount `/api/v1/debug/*` routes (off by default) |
| `--dangerous-bypass-auth` | Disable bearer-token auth on all REST and WebSocket routes so the web UI connects without a token; only for trusted networks or behind an authenticating proxy |
| `--no-open` | Do not open the browser once the server is ready |

`hakimi web` binds to local loopback only by default and prints the bearer token in the startup banner; the web UI authenticates automatically via the `#token=` URL fragment.

::: info
The `hakimi server` command tree is deprecated: any `hakimi server …` invocation (including all legacy subcommands) only prints a deprecation notice and exits with code 1 — use `hakimi web` instead. The one exception is `hakimi server kill`, which stays functional for stopping servers started by a version before 0.28.0. The notice will be removed in the next major version of Hakimi.
:::

::: danger
`--dangerous-bypass-auth` disables authentication entirely. Anyone who can reach the port gets full access to your sessions, filesystem, and shell. Only use it on a trusted network or behind your own authenticating reverse proxy, and stop the server with `Ctrl+C` when you are done.
:::

#### `hakimi server kill`

Deprecated — only stops a server started by a version before 0.28.0. Those versions could leave a background server behind, recorded in the legacy single-instance lock at `~/.hakimi/server/lock`; the command first tries `POST /api/v1/shutdown` for a graceful exit, then signals the recorded pid with SIGTERM, escalating to SIGKILL when needed, and removes the lock file once the process is confirmed dead. Servers started by `hakimi web` run in the foreground — stop them with `Ctrl+C` instead.

#### `hakimi web rotate-token`

Generate a new persistent bearer token (written to `~/.hakimi/server.token`); the previous token stops working immediately. The token is shared by the whole home directory, so every running instance picks the new one up on its next auth check — no restart needed.

### `hakimi remote`

Manage long-running personal remote access on Linux through a free Cloudflare Quick Tunnel. The command starts an authenticated full Web listener for all workspaces and sessions, including configuration, providers, OAuth, plugins, files, and complete Agent, Bash, tool, and task output. PTY terminals, debug endpoints, server shutdown, and nested remote-control routes remain unavailable through this listener. It does not require a Cloudflare account, domain, VPS, public IP address, or inbound router port.

Install the official [`cloudflared` binary](https://developers.cloudflare.com/tunnel/downloads/) first, then start the service:

```sh
hakimi remote start
```

The first start creates a private fixed control token under `~/.hakimi/remote/`, installs a `systemd --user` service, enables it for future Linux user sessions, and prints the current public URL and QR code. If `cloudflared` is not on `PATH`, pass its absolute path on the first start:

```sh
hakimi remote start --cloudflared /absolute/path/to/cloudflared
```

Use the management commands after that:

| Command | Description |
| --- | --- |
| `hakimi remote start` | Create or reuse the private configuration, enable the user service, and print the current URL and QR code |
| `hakimi remote status` | Show whether the service is active and healthy, plus its current URL, QR code, process ID, and local port |
| `hakimi remote stop` | Disable and stop the user service while keeping the fixed token for the next start |

There is no TTL while this service is running. The control token remains the same across starts, but the free `*.trycloudflare.com` hostname normally changes whenever `cloudflared`, the user service, or the computer restarts. Run `hakimi remote status` on the host computer to obtain the replacement link. Cloudflare provides no SLA or uptime guarantee for Quick Tunnels.

This background manager currently requires Linux with a working `systemd --user` session. In Hakimi Web, open **Remote control** and select **Persistent** to view, start, or stop the same service. The TUI `/remote` command remains a separate temporary handoff: its link opens the selected session first, then provides the same full remote Web access.

### `hakimi doctor`

Validate `config.toml` and `tui.toml` without starting the TUI or modifying either file. By default, the command checks the files under `KIMI_CODE_HOME` (or `~/.hakimi` when the environment variable is unset). Missing default files are reported as skipped because built-in defaults can apply.

```sh
hakimi doctor
```

| Command | Description |
| --- | --- |
| `hakimi doctor` | Validate the default `config.toml` and `tui.toml` |
| `hakimi doctor config [path]` | Validate only `config.toml`, using `path` instead of the default file when provided |
| `hakimi doctor tui [path]` | Validate only `tui.toml`, using `path` instead of the default file when provided |

When an explicit path is passed, the file must exist. The command exits with `0` when all checked files are valid or skipped, and `1` when any requested file is missing or invalid.

```sh
# Check the default config files
hakimi doctor

# Check only the default runtime config
hakimi doctor config

# Check a candidate TUI config before replacing the live config
hakimi doctor tui ./tui.toml
```

### `hakimi export`

Package a session into a ZIP file for sharing, archiving, or submitting bug reports.

```sh
hakimi export [sessionId] [options]
```

| Parameter / Option | Short | Description |
| --- | --- | --- |
| `sessionId` | | The ID of the session to export. When omitted, the most recent session in the current working directory is automatically selected and requires confirmation |
| `--output <path>` | `-o` | Output ZIP file path. When omitted, writes to a default filename in the current directory |
| `--yes` | `-y` | Skip the confirmation prompt for the default session and export directly |
| `--no-include-global-log` | | Do not include the global diagnostic log. Included by default |

The export contains all files in the target session directory. The global diagnostic log (`~/.hakimi/logs/kimi-code.log`) is included by default because it may contain events from other sessions or projects; add `--no-include-global-log` if you do not want to share it.

```sh
# Export the most recent session in the current directory, skipping confirmation
hakimi export -y

# Export a specific session to a custom path
hakimi export 01HZ...XYZ -o ./bug-report.zip

# Exclude the global diagnostic log
hakimi export 01HZ...XYZ -o ./bug-report.zip --no-include-global-log
```

### `hakimi migrate`

Migrate local data from a legacy kimi-cli installation to Hakimi, including session history and configuration files. Runs entirely interactively, guiding you through the full process.

```sh
hakimi migrate
```

For full migration instructions, see [Migrating from kimi-cli](../guides/migration.md).

### `hakimi upgrade`

Immediately check for the latest version and display an update prompt; exits after you make a selection. `hakimi update` is an alias for this command.

```sh
hakimi upgrade
```

For global npm, pnpm, yarn, bun, and macOS / Linux native installations, `hakimi upgrade` shows update options; selecting `Install update now` runs the corresponding foreground install command. When the current installation method cannot be upgraded automatically (e.g., Windows native installation), the manual update command is printed instead.

### `hakimi vis`

Launch the session visualizer in your browser to inspect a session as it unfolds. The command starts an in-process server pointed at your local sessions, prints the URL, opens your browser, and keeps running until you press `Ctrl-C`.

```sh
hakimi vis [sessionId] [options]
```

| Parameter / Option | Description |
| --- | --- |
| `sessionId` | Open the visualizer directly to this session. When omitted, it opens the home view listing your sessions |
| `--port <number>` | Port to bind. By default an available port is picked automatically |
| `--host <host>` | Host to bind. Default: `127.0.0.1` |
| `--no-open` | Do not open the browser automatically; just print the URL |

```sh
# Start the visualizer and open the browser at the home view
hakimi vis

# Open directly to a specific session
hakimi vis 01HZ...XYZ

# Bind a fixed port and host without opening a browser (e.g. on a remote host)
hakimi vis --host 0.0.0.0 --port 8123 --no-open
```

### `hakimi provider`

Manage providers in the shell — the non-interactive equivalent of `/provider` in the TUI. Suitable for scripted deployments, CI initialization, and one-line setup on a new machine.

```sh
hakimi provider <action> [options]
```

Five actions are available:

#### `hakimi provider add <url>`

Bulk-import all providers from a custom registry (`api.json`). The command fetches the registry, creates a `[providers.<id>]` and `[models.<alias>]` entry for each item, and writes `source` metadata so the TUI refreshes providers and models from the same registry URL automatically on next startup.

| Parameter / Option | Description |
| --- | --- |
| `<url>` | Registry URL |
| `--api-key <key>` | Bearer token for accessing the registry. Falls back to the `KIMI_REGISTRY_API_KEY` environment variable if not provided; required |

```sh
hakimi provider add https://registry.example.com/v1/models/api.json --api-key YOUR_KEY

# Or via environment variable (suitable for CI / .envrc)
KIMI_REGISTRY_API_KEY=YOUR_KEY hakimi provider add https://registry.example.com/v1/models/api.json
```

If a provider ID already exists, it is removed and re-created. The default model is not set automatically; you can select one later with `-m` or `/model` in the TUI.

#### `hakimi provider remove <providerId>`

Remove the specified provider and all its model aliases. If the removed provider is the one referenced by `default_model`, `default_model` is also cleared.

```sh
hakimi provider remove kohub
```

#### `hakimi provider list`

Print each configured provider on a separate line, including type, model count, and source. Add `--json` to output the raw `providers` and `models` tables for programmatic processing.

```sh
hakimi provider list
hakimi provider list --json | jq '.providers | keys'
```

#### `hakimi provider deepseek`

Configure DeepSeek as a native OpenAI-compatible provider. In the Hakimi package this command is exposed as `hakimi provider deepseek`; it writes a `[providers.deepseek]` entry and a DeepSeek model alias into `~/.hakimi/config.toml`, then makes that alias the default model unless `--no-default` is passed.

| Option | Description |
| --- | --- |
| `--api-key <key>` | DeepSeek API key. Falls back to the `DEEPSEEK_API_KEY` environment variable when omitted. Required. |
| `--model-id <model>` | DeepSeek model id. Defaults to `deepseek-v4-pro`; use `deepseek-v4-flash` for the flash model. |
| `--alias <alias>` | Model alias to write. Defaults to `deepseek/<model>`. |
| `--base-url <url>` | Override the DeepSeek base URL. Defaults to `https://api.deepseek.com`. |
| `--context-size <tokens>` | Model context window. Defaults to `1000000`. |
| `--max-output-size <tokens>` | Model output ceiling. Defaults to `384000`. |
| `--no-default` | Add the provider without changing `default_model`. |
| `--no-thinking` | Write the model alias with thinking disabled by default. |

```sh
DEEPSEEK_API_KEY=sk-... hakimi provider deepseek
hakimi provider deepseek --api-key sk-... --model-id deepseek-v4-flash --no-thinking
```

#### `hakimi provider catalog list [providerId]`

Browse the public [models.dev](https://models.dev/) model catalog without modifying any configuration. Without an argument, lists all providers along with their protocol type and model count; with a `providerId`, lists all models under that provider along with their context window and capabilities. If the catalog URL cannot be reached, a built-in snapshot of the catalog is used instead.

| Parameter / Option | Description |
| --- | --- |
| `[providerId]` | Optional — the provider ID to inspect |
| `--filter <substring>` | Case-insensitive substring filter on ID or name |
| `--url <url>` | Override the catalog URL; defaults to `https://models.dev/api.json` |
| `--json` | Output matching entries as JSON |

```sh
hakimi provider catalog list
hakimi provider catalog list --filter anthropic
hakimi provider catalog list anthropic
```

#### `hakimi provider catalog add <providerId>`

Import a known provider directly from the catalog by ID. The protocol type, base URL, and model information are all supplied by the catalog — only an API key is required. Vendors whose protocol the catalog does not declare (e.g. xai, openrouter, and other vendor-specific SDKs) are imported as OpenAI-compatible and the output notes the guess; when the catalog provides no usable endpoint, `--base-url` is required. Proprietary protocols (e.g. Amazon Bedrock) cannot be imported. When the public catalog is unreachable, the import uses the built-in snapshot, so it still works offline or in blocked networks.

| Parameter / Option | Description |
| --- | --- |
| `<providerId>` | Provider ID in the catalog, e.g., `anthropic`, `openai` |
| `--api-key <key>` | Provider API key. Falls back to `KIMI_REGISTRY_API_KEY` if not provided; required |
| `--default-model <modelId>` | Optional — set `default_model` to `<providerId>/<modelId>` after import |
| `--base-url <url>` | Override the catalog endpoint; required when the catalog declares none (or only an env placeholder) |
| `--url <url>` | Override the catalog URL; defaults to `https://models.dev/api.json` |

```sh
hakimi provider catalog list anthropic          # Browse available models first
hakimi provider catalog add anthropic --api-key sk-ant-... --default-model claude-opus-4-7
```

## Next steps

- [Slash Commands](./slash-commands.md) — Quick reference for control commands in the interactive TUI
- [Configuration Files](../configuration/config-files.md) — Persistent configuration for `default_model`, permission mode, and other startup parameters
- [Agent Skills](../customization/skills.md) — Skill file format for directories loaded via `--skills-dir`
- [Agents and Sub-Agents](../customization/agents.md) — Built-in sub-agents, custom agent files, and main Agent selection via `--agent`
