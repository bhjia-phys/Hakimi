# Hakimi

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi terminal welcome screen with a pixel cat-ear exploration spacecraft" />
</p>

<p align="center">
  <strong>A product-shell fork of Kimi Code with its own identity.</strong><br />
  <span>Same agent runtime — Hakimi branding, shared sessions, its own release channel, and a few extra conveniences.</span>
</p>

<p align="center">
  <a href="README.zh-CN.md">Chinese</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">Repository</a> |
  <a href="https://moonshotai.github.io/kimi-code/en/">Upstream Kimi Code docs</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## What Hakimi Is

Hakimi is a fork of [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) that tracks upstream `main` closely and layers a small, deliberately non-research "product shell" on top. The agent runtime — terminal loop, tools, sessions, skills, MCP, subagents, permissions, OAuth — is upstream Kimi Code; Hakimi changes how the product looks, where it lives, and how it updates.

> The AITP theoretical-physics research runtime that used to live on `main` now lives on the [`aitp-research`](https://github.com/bhjia-phys/Hakimi/tree/aitp-research) branch and is not part of this line.

## Differences From Upstream

- **Branding**: `hakimi` command, `Hakimi` product name, and a pixel cat-ear spacecraft welcome logo. The package installs **only** the `hakimi` executable — it never overwrites a `kimi` command from a separate Kimi Code install.
- **Own home directory**: config, sessions, logs, and caches live under `~/.hakimi` (override with `HAKIMI_HOME`), independent of Kimi Code's `~/.kimi-code`.
- **Bidirectional session sharing**: `hakimi -r` and the `/sessions` picker can list and resume Kimi Code sessions from `~/.kimi-code`, and new Hakimi sessions are mirrored into `~/.kimi-code` (symlink + index line) so the upstream `kimi` CLI can resume them too. Sharing is wired only for the default `~/.hakimi` home.
- **Own release channel**: update checks and the tips banner resolve against [`bhjia-phys/Hakimi` releases](https://github.com/bhjia-phys/Hakimi/releases) — including prereleases, which `releases/latest` never matches — instead of upstream Kimi Code builds. Hakimi versions follow their own semver line (currently `0.21.x`) and intentionally do not track upstream tags.
- **DeepSeek provider**: first-class `provider add deepseek` setup with sane defaults, plus a no-auth local web-search fallback (DuckDuckGo/Bing HTML) so `WebSearch` keeps working when no Moonshot token is configured.
- **Experimental ChatGPT OAuth**: opt-in device login can use a ChatGPT subscription through the OpenAI Codex backend, independently of OpenAI API-key billing.
- **Subagent presets**: `[subagent.agents.<type>]` and `[subagent.presets.<name>]` in `config.toml` pin per-subagent-type models and thinking efforts (oh-my-opencode-slim style), switchable at runtime with `/preset <name>`.
- **Transport identity**: provider-pipeline requests identify as `kimi-code-cli/<version> (hakimi)` so Kimi-for-Coding OAuth keeps working unchanged.

Everything else — features, flags, config schema, behavior — is upstream Kimi Code. See the [upstream docs](https://moonshotai.github.io/kimi-code/en/) for the full reference; the `[subagent]` preset fields are documented in `docs/en/configuration/config-files.md`.

## Roadmap

**Positioning**: Hakimi is an agent for theoretical-physics research, tuned for chain-of-thought (CoT) models. It develops physics algorithm code and gains physical insight through a human-like research workflow backed by the [AITP Research Protocol](https://github.com/bhjia-phys/AITP-Research-Protocol) research-memory ledger.

### Done · Product shell baseline

Branding and welcome logo, own `~/.hakimi` home, bidirectional session sharing, own release channel, DeepSeek provider, ChatGPT/OpenAI Codex OAuth (experimental), subagent presets.

### M1 · Product shell hardening (in progress)

- Institutionalize the upstream sync cadence; polish release and CI automation.
- One-click provider setup for more models, extending the DeepSeek pattern.

### M2 · Research memory integration (depends on AITP M0.6 → M4)

- Adopt the AITP "Hakimi contract": a CLI + files interface — Hakimi owns web retrieval, PDF reading, reasoning, and private caches; AITP owns the research ledger.
- Integrate through a thin process-boundary bridge (`aitp enter/record/note` tools) plus AITP methodology Skills — never re-implement AITP inside Hakimi.
- Ship AITP alongside the Hakimi install script; gate the integration behind an experimental flag until it matures.
- Freeze and archive the old `aitp-research` branch; the research line is rebuilt on the new AITP.

### M3 · Chain-of-thought adaptation

- Deep adaptation for DeepSeek / Kimi reasoning models: thinking management, budgets, and display.
- A physics-derivation CoT harness: structured hypothesis → derivation → verification chains. Conclusions and evidence land in AITP through its contract; raw reasoning chains stay out of the ledger.

### M4 · Unified research workflow

One methodology — hypothesis → derivation → verification → record — validated across project scales, from large codebases (librpa-class) to quick numerical checks. Physical insight stays uniform; scale changes what is recorded, not how the workflow is structured.

### M5 · Web and mobile

- Thinking-process visualization and research-knowledge retrieval in the web UI.
- Remote control from a phone: the web mobile shell plus a remotely deployed hakimi server with hardened authentication.

### M6 · Branding and community

Bilingual docs, research use cases, and tutorials.

## Install

Prebuilt binaries and install scripts are published on the [releases page](https://github.com/bhjia-phys/Hakimi/releases):

```sh
curl -fsSL https://github.com/bhjia-phys/Hakimi/releases/latest/download/install.sh | bash
```

To update an existing install, run `hakimi upgrade` inside the terminal.

## Build From Source

Requires Node.js and pnpm (via corepack):

```sh
git clone https://github.com/bhjia-phys/Hakimi.git
cd Hakimi
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false -C apps/kimi-code build
node apps/kimi-code/dist/main.mjs --version
```

To pack an installable tarball:

```sh
mkdir -p dist-pack
corepack pnpm --config.engine-strict=false -C apps/kimi-code pack --pack-destination ../../dist-pack
npm install -g ./dist-pack/bhjia-phys-hakimi-0.21.0.tgz
```

> On Windows, install [Git for Windows](https://gitforwindows.org/) before first launch because Hakimi uses the bundled Git Bash as its shell environment. If Git Bash is installed in a custom location, set `KIMI_SHELL_PATH` to the absolute path of `bash.exe`.

## Experimental ChatGPT / OpenAI Codex Login

Enable the experiment and start the device-code flow from the terminal:

```sh
hakimi login --provider openai-codex --enable-experimental
```

For a headless terminal, add `--no-open` and open the printed URL manually. In
the TUI, run `/experiments`, enable `openai-codex-oauth`, then run `/login` and
choose `ChatGPT / OpenAI Codex (OAuth)`. Credentials and generated provider
configuration remain under Hakimi's own home directory.

## Development

```sh
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false -C apps/kimi-code typecheck
corepack pnpm --config.engine-strict=false -C apps/kimi-code test
```

Layout follows upstream: the CLI is `apps/kimi-code`, the agent runtime is `packages/agent-core`, model providers are `packages/kosong`, and the SDK is `packages/node-sdk`.

## License

MIT. Upstream Kimi Code is © Moonshot AI; see [LICENSE](LICENSE).
