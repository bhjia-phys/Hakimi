---
name: check-hakimi-docs
description: Answer questions about the Hakimi product using the local docs checkout or the Hakimi docs on GitHub — CLI usage, configuration, slash commands, features, server and API, customization, and data locations. Use when the user asks how Hakimi works, how to set something up, or what a Hakimi message means. For Kimi account, membership, quota, or platform error codes, defer to the official Kimi docs instead.
---

# Check Hakimi docs (check-hakimi-docs)

Answer Hakimi **product** questions from the documentation, not from memory. This skill covers product usage ("how do I configure a provider", "what does this error mean", "how does the server API work"); it is not for developing the Hakimi repository itself.

## Hakimi vs Kimi boundary

Hakimi is a fork of Kimi Code. Most product concepts — configuration, skills, MCP, hooks, plugins, sessions, goals — are documented in the Hakimi docs. However, the following topics belong to the **Kimi platform** and must be answered from the official Kimi docs:

- Kimi account and login (OAuth, `kimi` platform identity)
- Membership plans, quota, rate limits, fuel packs
- Kimi Open Platform (`api.moonshot.cn`) vs Kimi Code platform (`api.kimi.com/coding`)
- Platform error codes (e.g. 401 for high-speed model access)

For those topics, use the official Kimi docs:

```
https://www.kimi.com/code/docs/en/
```

Everything else — CLI commands, config files, env vars, data locations, customization, server API, built-in tools, slash commands, keyboard shortcuts — is a Hakimi product question and should be answered from the Hakimi docs.

## The Hakimi docs sources

Prefer the **local source checkout** if the agent has filesystem access to a Hakimi repository:

```
docs/en/   (English)
docs/zh/   (Chinese)
```

Read pages directly with the **Read** tool. All page paths below are relative to the `docs/<locale>/` root.

If no local checkout is available, fetch the raw markdown from GitHub:

```
https://raw.githubusercontent.com/bhjia-phys/Hakimi/main/docs/en/
https://raw.githubusercontent.com/bhjia-phys/Hakimi/main/docs/zh/
```

Fetch pages with **FetchURL**. The same relative paths apply — append the path to the base URL.

## Which page to read for which question

| Question topic | Page (relative to `docs/<locale>/`) |
| --- | --- |
| What Hakimi is; install, upgrade, system requirements, first steps | `guides/getting-started.md` |
| Migrating from `kimi-cli` | `guides/migration.md` |
| Common use cases and workflows | `guides/use-cases.md` |
| Interaction modes, input methods, YOLO mode, thinking mode | `guides/interaction.md` |
| Sessions and context management | `guides/sessions.md` |
| Goal mode and how to use it | `guides/goals.md` |
| Experimental AITP-backed Research Mode, Research Board, and steering | `guides/research-mode.md` |
| Using Hakimi in IDEs (VS Code extension) | `guides/ides.md` |
| Local server and API usage | `guides/server.md` |
| MCP (Model Context Protocol) setup | `customization/mcp.md` |
| Agent Skills — writing and using skills | `customization/skills.md` |
| Plugins — installing and managing | `customization/plugins.md` |
| Agents and subagents | `customization/agents.md` |
| Hooks — lifecycle and event hooks | `customization/hooks.md` |
| Custom themes | `customization/themes.md` |
| Kimi Datasource | `customization/datasource.md` |
| Config files (`config.toml`, `tui.toml`) structure | `configuration/config-files.md` |
| Providers and models — base URL, API key, model IDs | `configuration/providers.md` |
| Config overrides (`HAKIMI_HOME`, `KIMI_CODE_HOME`, etc.) | `configuration/overrides.md` |
| Environment variables | `configuration/env-vars.md` |
| Data locations (`~/.hakimi`, session storage, caches) | `configuration/data-locations.md` |
| `hakimi` command flags and subcommands | `reference/kimi-command.md` |
| `hakimi acp` subcommand | `reference/kimi-acp.md` |
| Server API reference | `reference/server-api.md` |
| Built-in tools (Read, Edit, Bash, Grep, etc.) | `reference/tools.md` |
| Slash commands (`/help`, `/config`, etc.) | `reference/slash-commands.md` |
| Keyboard shortcuts | `reference/keyboard.md` |
| CLI changelog | `release-notes/changelog.md` |

If no row fits the question, read the docs index page (`index.md`) and follow its links.

## How to answer

1. Determine whether the question is a **Hakimi** product question or a **Kimi platform** question (see the boundary section above).
2. For Hakimi questions: pick the page from the table, then **read or fetch it before answering** — answer strictly from the fetched content, never from memory.
3. For Kimi platform questions: fetch the relevant page from `https://www.kimi.com/code/docs/en/` before answering.
4. Cite the page path(s) or URL(s) you used at the end of the answer.
5. If the fetch fails or the docs do not cover the question, say so plainly: answer from what you already know, attach the docs entry link, and mark which parts you could not verify. **Never invent config keys, command names, model IDs, or product behaviors.**
