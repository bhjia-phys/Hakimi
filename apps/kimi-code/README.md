# @bhjia-phys/hakimi

> Hakimi is a truth-seeking research agent built on the Kimi Code runtime.

Hakimi keeps the terminal loop, tools, sessions, skills, MCP, subagents, permissions, and Kimi OAuth integration, while providing its own `hakimi` command, cat-ear spacecraft identity, `~/.hakimi` data home, release channel, provider defaults, and experimental AITP-backed Research Mode. Its data-home resolution order is `HAKIMI_HOME` > `KIMI_CODE_HOME` > `~/.hakimi`.

## Install from this repository

Hakimi does not yet publish a public npm package or release install script. Building this repository requires Node.js 24.15.0 or later and pnpm 10.33.0:

```sh
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install
pnpm build:packages
pnpm -C apps/kimi-code build
mkdir -p .tmp/dist-pack
pnpm -C apps/kimi-code pack --pack-destination ../../.tmp/dist-pack
npm install -g ./.tmp/dist-pack/bhjia-phys-hakimi-0.21.0.tgz
```

The tarball filename contains the current package version. If it has changed, use the filename printed by `pnpm pack` instead of `0.21.0`.

> On Windows, install [Git for Windows](https://gitforwindows.org/) before first launch because Hakimi uses the bundled Git Bash as its shell environment. If Git Bash is installed in a custom location, set `KIMI_SHELL_PATH` to the absolute path of `bash.exe`.

This package installs only the `hakimi` executable. It does not install a `kimi` alias, so a separate Kimi Code installation can keep owning the `kimi` command.

## First run

```sh
hakimi --version
cd /path/to/your/project
hakimi
```

Use `/login` in the TUI to authenticate with Kimi Code OAuth or a Kimi Platform API key. Common entry points include:

```text
/help              Show commands and keyboard shortcuts
/model             Select a model
/sessions          Browse and resume sessions
/goal              Start or inspect autonomous goal work
/check-hakimi-docs Ask the built-in Hakimi manual skill
```

Use `hakimi -p "<instruction>"` for a non-interactive run and `hakimi -c` to resume the latest session.

## Experimental Research Mode

Research Mode requires Python 3.11 or later, the `aitp-research-protocol` plugin, and an initialized AITP workspace. The `aitp_research_mode` experimental flag is enabled by default, so a plain launch already makes `/research` and the `EnterAITPMode` capability available. Launch Hakimi, then enter the mode from the TUI:

```sh
cd /path/to/initialized-aitp-workspace
hakimi
```

```text
/research on
/research status
/research manage
```

See the [English Research Mode guide](../../docs/en/guides/research-mode.md) or [中文研究模式指南](../../docs/zh/guides/research-mode.md) for prerequisites, the Research Board, steering commands, persistence barriers, and degraded behavior.

## User manual

- [English getting started](../../docs/en/guides/getting-started.md)
- [中文开始使用](../../docs/zh/guides/getting-started.md)
- [CLI command reference](../../docs/en/reference/kimi-command.md)
- [Configuration and data locations](../../docs/en/configuration/data-locations.md)

Hakimi uses its own release version line (currently `0.21.x`), independently of upstream Kimi Code release tags.
