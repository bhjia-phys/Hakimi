# Sessions and context

Hakimi persists every conversation as a "session" — storing message history and metadata so you can close the terminal and pick up right where you left off. This page covers how to resume sessions, manage context, and export or fork sessions.

## Session storage

All sessions are saved under `$KIMI_CODE_HOME/sessions/` (default: `~/.hakimi/sessions/`), grouped by working directory:

```text
~/.hakimi/
├── config.toml
├── session_index.jsonl
└── sessions/
    └── <workDirKey>/
        └── <sessionId>/
            ├── state.json
            └── agents/
                ├── main/
                │   └── wire.jsonl
                └── <subagentId>/
                    └── wire.jsonl
```

- `state.json`: session metadata such as title and creation time.
- `agents/*/wire.jsonl`: the agent event stream, used for session recovery and replay. It also carries a request trace — the tool schemas, request parameters, and MCP tool listings sent to the model — for debugging.

::: warning
Do not manually edit files inside the `sessions/` directory — doing so may prevent sessions from being restored correctly.
:::

## Starting and resuming sessions

Every time you run `hakimi` directly it creates a new session. To resume a previous session, use one of the following:

**Resume the most recent session in the current directory:**

```sh
hakimi --continue
```

**Resume a specific session by ID:**

```sh
hakimi --session abc123
```

**Interactively browse session history and choose one:**

```sh
hakimi --session
```

::: warning
`--continue` and `--session` are mutually exclusive.
:::

In the desktop web UI, the conversation header summarizes the current Git worktree beside the session title: branch or detached-HEAD state, changed-file count, ahead/behind counts, line additions/deletions, and pull request status. Select the worktree summary to open change details, or select the pull request badge to open that pull request. The card is hidden outside Git repositories and progressively removes lower-priority metrics when the conversation column narrows.

## Switching sessions inside the TUI

You can manage sessions without leaving the terminal. The following slash commands are available only when the agent is idle:

- **`/new`** (alias `/clear`): switch to a new session, discarding the current context.
- **`/sessions`** (alias `/resume`): browse and resume a previous session.
- **`/fork`**: fork the current session (see below).
- **`/title <text>`** (alias `/rename`): set a session title for easier identification; without arguments, displays the current title.

## Remote control from another device

Web remote control lets a phone or another computer use Hakimi Web over the internet. Your current computer remains the server: Hakimi opens an authenticated full Web listener on `127.0.0.1`, then `cloudflared` exposes it through a temporary Cloudflare Quick Tunnel. You do not need a VPS, Tailscale, a Cloudflare account, or a public inbound port.

The feature is available by default in Hakimi Web:

1. Install the official [`cloudflared` binary](https://developers.cloudflare.com/tunnel/downloads/). Hakimi does not download or update it automatically.
2. Start the local Web server:

   ```sh
   hakimi web
   ```

3. Open any session and select the visible **Remote control** button in the conversation header. On mobile Web, select the globe button in the top bar.
4. For a temporary share, keep **Temporary share** selected, choose 30 minutes, 1 hour, 8 hours, or 24 hours, then select **Start remote control**.
5. For long-running access on Linux, select **Persistent**, then start or stop the background service and view its current health, URL, and QR code from the same dialog.

The link initially opens the session selected in the local Web UI, then provides the same workspace and session navigation as local Web. On a narrow phone, the top bar and its switcher and settings bottom sheets expose session actions, subagent presets, Git and pull-request details, and background Agent, Bash, and task output without requiring a desktop-width layout.

While sharing is active, the conversation header shows a **Remote** badge that reopens the dialog. Select **Stop remote control** to close the tunnel immediately; the tunnel also closes when the TTL expires, `cloudflared` exits, or the local Web server stops. The remote viewer does not show controls for creating another tunnel.

A temporary share does not expose the main listener itself. Hakimi creates a second loopback listener that reuses the current runtime, accepts only the temporary credential, and serves the full authenticated Web data plane.

For long-running personal access on Linux, Hakimi can keep a separate Quick Tunnel running as a `systemd --user` service. This flow has no TTL and does not require `hakimi web` to remain open:

```sh
hakimi remote start
hakimi remote status
hakimi remote stop
```

`hakimi remote start` installs and enables the user service, starts a full all-session Web listener, and prints its URL and QR code. `hakimi remote status` prints the current URL again and reports whether the local service is healthy. `hakimi remote stop` disables and stops the service but keeps its private configuration and control token under `~/.hakimi/remote/` for the next start. The service starts again with your Linux user session and is restarted automatically after an unexpected process failure.

The background service keeps the same control token across restarts, but a Quick Tunnel does not provide a stable hostname. Its `*.trycloudflare.com` address normally remains unchanged while the same `cloudflared` process is running; restarting `cloudflared`, restarting the service, or rebooting the computer creates a new address. Run `hakimi remote status` on the host computer to retrieve the replacement link.

The TUI keeps its selected-session handoff flow. Open the session, wait until the agent is idle, then run `/remote`—no environment variable is required. The TUI closes the session and exits before the foreground remote server takes ownership, so two runtimes never write the same session at once. The link opens that session first, but the resulting Web UI can access all workspaces and sessions. Press `Ctrl-C` in the original terminal to stop it. `/remote` is the user-facing command; the takeover subcommand remains internal.

The default TTL for Web and TUI shares is 8 hours and the maximum is 24 hours. Web offers fixed presets; the TUI also accepts a positive duration such as `/remote --ttl 30m` or `/remote --ttl 1d`. If `cloudflared` is not on `PATH`, set `KIMI_CODE_CLOUDFLARED_PATH` before starting Hakimi, or pass `/remote --cloudflared /absolute/path/to/cloudflared` in the TUI.

::: danger Security
The generated URL contains a control token in its fragment. Anyone who receives the complete URL or QR code gets full Web access to Hakimi on this computer, so treat it like a password and do not paste it into chat, logs, or issue reports. Web and TUI shares use temporary tokens; the background service deliberately reuses its token across restarts until you remove its private configuration.
:::

After authentication, remote Web can create, rename, archive, switch, and control sessions; change configuration, models, providers, OAuth, and plugins; upload, browse, and download files; and display media, local paths, tool inputs, approval details, and complete Agent, Bash, and task output. The tunnel listener still does not register PTY terminal, debug, server-shutdown, or nested remote-control routes.

Cloudflare states that [Quick Tunnels have no SLA or uptime guarantee and are intended for testing and development](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/). This mode is suitable for short-lived personal use or a few trusted users, not production availability. Use a managed tunnel or another deployed service if you need a stable hostname, access policy, audit controls, or an uptime commitment.

## Context compression

As a conversation grows, Hakimi automatically compresses the message history when the context approaches the window limit, freeing up token space. You can also trigger compression manually at any time:

```
/compact
```

You can pass a hint to tell the model what to prioritize when compressing:

```
/compact Keep the discussion about database migrations
```

## Forking a session

To explore a new direction without disrupting the current conversation, use `/fork`:

```
/fork
```

Forking does not switch you away: you stay in the original session and the conversation continues untouched. The fork is an independent copy you can switch to at any time using `/sessions`. A saved `/goal` is not copied to the fork. Start a new goal there if you want autonomous goal work.

After forking, the CLI prints a ready-to-run `hakimi --resume` command (also copied to the clipboard) so you can enter the fork directly from a new terminal process.

## Exporting a session

Use `hakimi export` to package a session as a ZIP file — useful for sharing, archiving, or filing a bug report:

```sh
hakimi export <sessionId>
```

Omitting `sessionId` exports the most recent session in the current directory (with an interactive confirmation prompt; add `-y` to skip). Use `-o` to specify an output path:

```sh
hakimi export <sessionId> -o ~/Desktop/my-session.zip
```

The export includes all files in the session directory, including diagnostic logs. The global diagnostic log (`~/.hakimi/logs/kimi-code.log`) is also bundled by default; add `--no-include-global-log` to exclude it.

You can also export from inside the TUI without leaving the interactive session:

- **`/export-debug-zip`**: produces the same debug ZIP as `hakimi export`.
- **`/export-md`** (alias `/export`): exports the conversation as a human-readable Markdown file, suitable for sharing or archiving. Accepts an optional path argument; without one, it writes to `kimi-export-<short-id>-<timestamp>.md` in the current working directory.

In the web UI, `/export` downloads the current session as a diagnostic ZIP. It includes the persisted session data, diagnostic logs, and a bounded metadata-only `logs/kimi-web.jsonl` record of key browser events. Prompt text, WebSocket payloads, and console arguments are not copied into this browser log. This web command differs from the TUI `/export` alias above.

::: tip
Exported files may contain code, command output, and file paths that are sensitive. Review the content before sharing.
:::

## Next steps

- [Data locations](../configuration/data-locations.md) — full directory layout for session files
- [hakimi command reference](../reference/kimi-command.md) — complete parameter reference for `--continue`, `--session`, `export`, and other commands
