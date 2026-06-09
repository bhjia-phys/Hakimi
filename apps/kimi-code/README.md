# @bhjia-phys/hakimi

> Hakimi: truth-seeking physics research agent.

Hakimi is a terminal AI agent for theoretical-physics research. It keeps the native Kimi Code runtime, tool loop, sessions, skills, MCP, subagents, permissions, and OAuth compatibility, then adds AITP research memory, scoped WorkFrames, research actions, evidence ledgers, domain packs, and graph-aware validation inside the runtime rather than as an external wrapper.

## Install From This Repository

Build and pack the local CLI:

```powershell
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false build
New-Item -ItemType Directory -Force dist-pack
corepack pnpm --config.engine-strict=false -C apps/kimi-code pack --pack-destination ..\..\dist-pack
npm install -g .\dist-pack\bhjia-phys-hakimi-0.13.0.tgz
```

> On Windows, install [Git for Windows](https://gitforwindows.org/) before first launch because Hakimi uses the bundled Git Bash as its shell environment. If Git Bash is installed in a custom location, set `KIMI_SHELL_PATH` to the absolute path of `bash.exe`.

Run Hakimi:

```sh
hakimi --version
hakimi
```

This package intentionally installs only the `hakimi` executable. It does not install a `kimi` alias, so a separate Kimi Code installation can keep owning the `kimi` command.

Hakimi uses its own release version line. The current CLI package version is `0.13.0`, and it is not meant to match upstream Kimi Code release tags.

## Login

For the managed Kimi for Coding model, use either terminal entry point:

```powershell
hakimi login
hakimi
```

or start the TUI and run `/login`. Choose `Kimi for Coding (OAuth)`, complete
the browser device-code flow, then return to Hakimi. A
successful login provisions `~/.hakimi/config.toml` with provider
`managed:kimi-code`, model alias `kimi-code/kimi-for-coding`, and matching Kimi
search/fetch service credentials.
Requests to the Kimi Coding API use a Kimi-Code-compatible coding-agent
transport identity with a Hakimi provenance suffix; the user-facing command,
package, sessions, and config remain Hakimi-owned.

Quick checks:

```powershell
hakimi provider list
hakimi doctor config ~/.hakimi/config.toml
hakimi --model kimi-code/kimi-for-coding --prompt "Reply with OK"
```

Hakimi uses its own `.hakimi` config/data directory by default, so
model/provider/session/MCP configuration stays separate from a Kimi Code
install. The `kimi` command is never required for Hakimi; use `hakimi login` or
the in-app `/login`.

## DeepSeek

If your Kimi OAuth model is unavailable, configure DeepSeek without leaving the native runtime:

```powershell
hakimi provider deepseek
hakimi provider list
hakimi
```

The command prompts for your DeepSeek API key, writes an OpenAI-compatible `deepseek` provider and `deepseek/deepseek-v4-pro` model alias into `~/.hakimi/config.toml`, then makes it the default. Use `--api-key`, `DEEPSEEK_API_KEY`, `--model-id deepseek-v4-flash`, `--no-thinking`, or `--no-default` when you need a different setup.

When DeepSeek is active, `WebSearch` still works without Kimi OAuth: Hakimi
prefers the configured Moonshot/Kimi search service when authenticated, then
falls back to a no-auth local web search provider.

## Research Runtime

The physics research runtime is enabled by default. Start a WorkFrame and
compile a ContextPack to use the built-in `theoretical-physics/general`
scaffold for new topics.

New project research artifacts are written under `.hakimi/`, for example
`.hakimi/research-ledger`. Legacy `.aitp/` packs are still read for
compatibility.

## Source

- Repository: https://github.com/bhjia-phys/Hakimi
- Upstream runtime: https://github.com/MoonshotAI/kimi-code
- License: MIT
