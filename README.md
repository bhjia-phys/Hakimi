# Hakimi

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi terminal welcome screen with a pixel cat-ear exploration spacecraft" />
</p>

<p align="center">
  <strong>An open-source terminal AI agent for software development, terminal tasks, and experimental theoretical-physics research workflows.</strong><br />
  <span>Use one focused workspace to inspect code, run tools, keep sessions, and organize research work with explicit evidence and boundaries.</span>
</p>

<p align="center">
  <a href="README.zh-CN.md">中文</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">Repository</a> |
  <a href="docs/en/guides/getting-started.md">User manual</a> |
  <a href="LICENSE">License</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## What Hakimi does

Hakimi is a terminal-first agent for work that benefits from an assistant able to inspect a workspace, use tools, and keep context across turns. It can:

- read and modify code and project files, search a workspace, and work with Git;
- run shell commands, builds, tests, and other terminal tasks while respecting configured permissions;
- start one-shot prompt runs or interactive sessions, resume previous sessions, and keep local session data;
- connect to configured model providers and extend the agent with MCP servers, Skills, and subagents;
- use profiles, presets, and permission modes to control how tools and delegated work are used.

Hakimi is designed for practical software work and terminal operations first. Its research features add structure around experimental scientific workflows; they do not replace an expert's judgment or independent verification.

## Quick start

Hakimi currently builds from source. Use Node.js 24.15.0 or newer and pnpm 10.33.0:

```sh
git clone https://github.com/bhjia-phys/Hakimi.git
cd Hakimi
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install
pnpm build:packages
pnpm -C apps/kimi-code build
mkdir -p .tmp/dist-pack
pnpm -C apps/kimi-code pack --pack-destination ../../.tmp/dist-pack
npm install -g "$(ls -t ./.tmp/dist-pack/*.tgz | head -n 1)"
hakimi --version
```

`pnpm pack` prints the tarball filename it creates; the command above selects the newest tarball in `.tmp/dist-pack`. To update a source installation, pull the desired revision and repeat the build, pack, and install steps.

Start the interactive terminal agent, run a single prompt, or continue the previous session:

```sh
hakimi
hakimi -p "Summarize the test failures in this repository."
hakimi -c
```

Inside an interactive session, use `/login` to configure an available provider, including Kimi Code OAuth or ChatGPT / OpenAI Codex OAuth. Codex login provisions the `openai-codex/gpt-5.6-sol`, `openai-codex/gpt-5.6-terra`, and `openai-codex/gpt-5.6-luna` model aliases. Login is explicit; Hakimi never starts OAuth login at startup. Hakimi keeps configuration, sessions, logs, and caches under `~/.hakimi` by default. Set `HAKIMI_HOME` to use a different data directory.

On Windows, install [Git for Windows](https://gitforwindows.org/) before first launch. Hakimi uses the Git Bash shell bundled with Git for Windows; if Git Bash is installed elsewhere, set `KIMI_SHELL_PATH` to the absolute path of `bash.exe`.

## Core capabilities

- **Terminal coding:** inspect files, review diffs, edit code, and work in the current project context.
- **Search and execution:** search project contents, invoke shell and file tools, and run builds or tests with visible tool activity.
- **Sessions:** use interactive conversations, prompt mode, session continuation, and session resumption.
- **Providers:** configure and select supported model providers through the CLI and TUI provider settings.
- **Extensibility:** load MCP servers and Skills, and delegate bounded work to subagents.
- **Control:** choose manual, YOLO, or auto permission modes, and use agent profiles or presets where configured.

The available commands and settings evolve with the development build. The [user manual](docs/en/guides/getting-started.md) and [configuration guide](docs/en/configuration/config-files.md) are the authoritative starting points.

## Research features

Hakimi's Research Loop organizes an experimental research workflow around structured state, evidence, falsifiers, and decisions. It can keep a compact research process trajectory across bounded actions and present research status to the user. It does not expose raw hidden chain-of-thought as a research record, and it does not infer scientific validity from an agent response alone.

The optional `theory-physics` domain pack adds physics-oriented routing, derivation checks, numerical/HPC evidence boundaries, and science-first reporting. It does not add a second runtime, ledger, literature database, or scheduler observer.

AITP Research Mode is discoverable by default. New sessions start `inactive`; hydration preserves the persisted mode. Inactive hydration and `GET`/SDK snapshot reads do not probe AITP or perform AITP I/O, while a persisted active session remains active after cold restore and re-probes the adapter for read-only maintenance. The Research Board and the other Research/AITP tools remain hidden until explicit `/research on`, `EnterAITPMode`, or an equivalent `enter_mode` request. Its current Hakimi compatibility status is **H0–H4 implemented-in-code, H5 partial, and H6b method distillation planned/unavailable**. A live subprocess smoke test has exercised the managed AITP 0.8.0 CLI in a disposable scratch store; complete cross-platform and failure-matrix conformance remains pending. Hakimi does not read or parse a `backfill-0.1` success envelope. See [`docs/aitp/`](docs/aitp/) for the maintained compatibility details.

## Current status and limitations

- Hakimi is a development version that can be built from source.
- Core terminal workflows—interactive sessions, tools, providers, and project work—are usable.
- Research Loop and the `theory-physics` pack remain experimental and may change; AITP Research Mode is a graduated surface, while its AITP compatibility boundaries remain explicit in [`docs/aitp/`](docs/aitp/).
- There is no public npm package or release installer yet; use the source build path above.
- Hakimi does not replace human review, reproducible experiments, or expert scientific validation.

## Documentation

- [Getting started](docs/en/guides/getting-started.md)
- [Configuration](docs/en/configuration/config-files.md)
- [Research Mode](docs/en/guides/research-mode.md)
- [AITP documentation and compatibility records](docs/aitp/)
- [Implementation notes](IMPLEMENTATION.md)

## Project background

Hakimi is an independent repository with its own `hakimi` command, `~/.hakimi` data directory, semver release line, and product direction. It is based on selected engineering foundations from [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code), but it is not a product-parity fork and upstream behavior is not adopted automatically. The historical source and attribution context is preserved in [`bhjia-phys/Hakimi-upstream-archive`](https://github.com/bhjia-phys/Hakimi-upstream-archive); see the [MIT license](LICENSE) for required attribution.

## Development

From the repository root:

```sh
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false -C apps/kimi-code typecheck
corepack pnpm --config.engine-strict=false -C apps/kimi-code test
```

The CLI lives in `apps/kimi-code`; packages provide the SDK, model/provider integrations, and agent runtime used by the application.

## License

MIT. See [LICENSE](LICENSE). Hakimi retains the required attribution for upstream Kimi Code work by Moonshot AI.
