---
name: check-kimi-code-docs
description: Compatibility alias for check-hakimi-docs. Use check-hakimi-docs for Hakimi product questions instead. This skill answers Kimi platform questions — account, membership, quota, and platform error codes — using the official Kimi documentation. Only invoke explicitly when the question is about the Kimi platform, not the Hakimi CLI product.
disable-model-invocation: true
---

# Check Kimi Code docs (check-kimi-code-docs)

> This is a **compatibility alias**. For Hakimi product questions (CLI usage, configuration, skills, MCP, hooks, sessions, goals, server API, etc.), use the `check-hakimi-docs` skill instead. This skill is kept for explicit invocations about the **Kimi platform** — account, membership, quota, and platform error codes.

## Hakimi vs Kimi boundary

Hakimi is a fork of Kimi Code. The two products share a common ancestry but have diverged:

- **Hakimi product questions** (CLI commands, config files, env vars, data locations, customization, server API, built-in tools, slash commands, keyboard shortcuts): use the `check-hakimi-docs` skill, which reads from the local docs checkout or `raw.githubusercontent.com/bhjia-phys/Hakimi/main/docs/{en,zh}`.
- **Kimi platform questions** (account, login/OAuth, membership plans, quota, rate limits, fuel packs, Kimi Open Platform vs Kimi Code platform, platform error codes): use this skill, which reads from the official Kimi docs.

## The single source of truth

Official Kimi documentation (English):

```
https://www.kimi.com/code/docs/en/
```

Fetch pages with **FetchURL** before answering. All page links below are relative to this base.

## Which page to read for which question

| Question topic | Page (relative to the base URL) |
| --- | --- |
| What Kimi Code is; Base URL / API Key; standard vs high-speed model; platform comparison | `./` (home overview) |
| Membership plans, quota and rate limits, fuel packs | `kimi-code/membership.html` |
| Install / login / usage FAQ | `kimi-code/faq.html` |
| Error codes and their meaning (e.g. 401 for high-speed model access) | `kimi-code/error-reference.html` |
| Product news and recent changes | `kimi-code/whats-new.html` |
| Community guidelines; contact and feedback | `kimi-code/community-guidelines.html`, `kimi-code/contact-and-feedback.html` |
| `config.toml` fields, providers/models, environment variables, data locations, config overrides | `kimi-code-cli/configuration/` — `config-files.html`, `providers.html`, `env-vars.html`, `data-locations.html`, `overrides.html` |
| Skills, MCP, hooks, plugins, themes, agents/sub-agents, Kimi Datasource | `kimi-code-cli/customization/` — `skills.html`, `mcp.html`, `hooks.html`, `plugins.html`, `themes.html`, `agents.html`; Kimi Datasource lives at `plugins.html#kimi-datasource` |
| Getting started, sessions and context, goals, interaction and input, IDEs, migration, use cases | `kimi-code-cli/guides/` — `getting-started.html`, `sessions.html`, `goals.html`, `interaction.html`, `ides.html`, `migration.html`, `use-cases.html` |
| Slash commands, keyboard shortcuts, builtin tools, `kimi` command flags, ACP | `kimi-code-cli/reference/` — `slash-commands.html`, `keyboard.html`, `tools.html`, `kimi-command.html`, `kimi-acp.html` |
| CLI changelog | `kimi-code-cli/release-notes/changelog.html` |
| Using Kimi Code in Claude Code and other third-party agents | `third-party-tools/other-coding-agents.html` |

If no row fits the question, fetch the docs home page and follow its navigation links.

## How to answer

1. Determine whether the question is a **Hakimi** product question or a **Kimi platform** question (see the boundary section above). For Hakimi product questions, direct the user to the `check-hakimi-docs` skill.
2. Pick the page from the table above.
3. **FetchURL the page before answering** — answer strictly from the fetched content, never from memory.
4. Cite the page link(s) you used at the end of the answer.
5. If the fetch fails or the docs do not cover the question, say so plainly: answer from what you already know, attach the docs entry link (`https://www.kimi.com/code/docs/en/`), and mark which parts you could not verify. **Never invent config keys, command names, model IDs, or product behaviors.**
