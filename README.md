# Hakimi

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi terminal welcome screen with a pixel cat-ear exploration spacecraft" />
</p>

<p align="center">
  <strong>A Kimi Code fork evolving into a chain-of-thought-native agent for theoretical physics.</strong><br />
  <span>Upstream engineering foundations — Hakimi research orchestration, staged AITP memory integration, and its own product experience.</span>
</p>

<p align="center">
  <a href="README.zh-CN.md">Chinese</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">Repository</a> |
  <a href="https://moonshotai.github.io/kimi-code/en/">Upstream Kimi Code docs</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## What Hakimi Is

Hakimi is a fork of [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) that tracks upstream `main` closely. Today's `main` provides a stable Hakimi product shell while the research layer is built behind explicit milestones: Hakimi will own the research loop, agent orchestration, tools, and interaction experience; the separate [AITP Research Protocol](https://github.com/bhjia-phys/AITP-Research-Protocol) remains the authority for durable research memory and evidence.

The underlying terminal loop, tools, sessions, Skills, MCP, subagents, permissions, and OAuth continue to come from upstream Kimi Code. The historical deeply embedded research prototype remains archived on the [`aitp-research`](https://github.com/bhjia-phys/Hakimi/tree/aitp-research) branch; it is not the integration path for this line.

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

**Positioning**: Hakimi is being built as a theoretical-physics research agent for reasoning models such as DeepSeek and Kimi. It should develop scientific software, ask the right questions throughout a research project, test competing explanations, and preserve grounded results through AITP without storing transcripts or raw chain-of-thought as research memory.

### Done · Product shell baseline

Branding and welcome logo, own `~/.hakimi` home, bidirectional session sharing, own release channel, DeepSeek provider, ChatGPT/OpenAI Codex OAuth (experimental), subagent presets.

### M1 · Product shell hardening (in progress)

- Institutionalize the upstream sync cadence; polish release and CI automation.
- One-click provider setup for more models, extending the DeepSeek pattern.

### M2 · Hakimi research-loop foundation

This milestone is Hakimi-owned and does not wait for AITP:

- A Goal-like **Research Frame** holds the current scientific question, objective, focus, and blocker.
- A Todo-like **Research Question Board** tracks what is unknown, why it matters now, the evidence needed, and whether it is open, under investigation, answered, blocked, or deferred.
- Bounded research checkpoints identify the largest knowledge gap, invoke only the relevant independent subagent perspectives, and decide whether Hakimi should inspect code, read literature, run a benchmark, or ask the researcher.
- Goal answers *what outcome to pursue*; Todo tracks *what actions to execute*; the research loop asks *what must be learned or challenged next*.
- The same loop is evaluated across project scales, from a large scientific codebase to a quick numerical or analytic check; scale changes the evidence and actions, not the method.

### M3 · Staged AITP memory integration

[AITP Research Protocol](https://github.com/bhjia-phys/AITP-Research-Protocol) owns `.aitp` schemas, validation, persistence, provenance, and later graph semantics. Hakimi owns orchestration, web/PDF retrieval, reasoning, tools, UX, and ephemeral private caches. Integration remains CLI + files — no copied runtime, SDK, API server, MCP server, daemon, or second ledger.

**Current compatibility status** — last verified against AITP `8658f6827288f4bb61e5c193a346f0f73ebbe3b2`: M0/M0.5 are complete; M0.6 is in progress; later stages are blocked. The installed plugin's `/skill:aitp` workflow can use the current CLI manually with Python 3.11 or newer. Hakimi's native structured adapter is **not implemented yet**, but it is not blocked: AITP decided that `record/note prepare|save` responses stay **unversioned version-0 contracts** (strict shape validation, fail closed on unknown `status` values), and the first versioned transport contract point is `aitp/enter-0.2` at the M1a gate. Full matrix, decisions, and the H0 implementation plan live in `docs/aitp/` (mirrored by `docs/hakimi/` in the AITP repository).

| Hakimi track | AITP gate | Integration status |
| --- | --- | --- |
| **H0 · current CLI** | Current M0/M0.6 | Available through the installed AITP Skill: `init`, `enter`, `inventory`, `record prepare/save`, and `note prepare/save`. Native structured adapter is planned against the version-0 contracts (strict shape validation, fail closed on unknown `status`); the first versioned dispatch point is `aitp/enter-0.2` at M1a. Hakimi never auto-runs `init`, `init --adopt`, or `inventory`. |
| **H1 · retrieval** | After M1a gate | Consume official golden fixtures for `aitp/enter-0.2`, `aitp/list-0.1`, and `aitp/show-0.1`; add closeout-first recovery and Note-age projections. `list` and `show` do not exist today. |
| **H2 · relations and diagnostics** | After M1b gate | Add `aitp/lite-entry-0.2` relations, typed resolution, derived `used_by`, `aitp/check-report-0.1`, and `aitp/run-pointer-0.1`. `check` does not exist today; no 0.1 migration or second index. |
| **H3 · research memory** | After AITP M2–M4 gates | Add reviewed artifacts, cross-topic links, and the Skill-driven collaborator protocol in gate order. |
| **Formal contract** | After M4 | Freeze Hakimi compatibility against AITP versioned JSON and extended official golden fixtures. AITP remains CLI + files; Hakimi private caches never write back. |

Current persistent schemas include `aitp/lite-entry-0.1` and `aitp/lite-note-0.1`, but those identify AITP files, not the unversioned CLI response envelopes. There is no `aitp/enter-0.1`, `aitp list`, `aitp show`, `aitp check`, `aitp search`, or `aitp --version` today. A workspace without AITP must continue normally with an explicit degraded status; Hakimi must never initialize or adopt one without a user request.

For the current manual path, install the plugin and reload:

```text
/plugins install /path/to/AITP-Research-Protocol/plugins/aitp-research-protocol
/reload
```

Then invoke `/skill:aitp`. The Skill resolves its bundled `scripts/aitp.py` relative to the installed plugin root and selects a compatible Python interpreter; it does not require a global `aitp` executable.

**Compatibility maintenance**: any change to supported AITP commands or schemas, launcher discovery, session lifecycle, Skill discovery, or stage status must update this Roadmap and `README.zh-CN.md` in the same change. Re-check AITP `--help`, versioned schemas, and official fixtures first; never describe a planned capability as available.

### M4 · Physics reasoning and insight

- Deep adaptation for DeepSeek / Kimi reasoning models: bounded thinking management, budgets, interruption, and structured presentation.
- Research checkpoints ask stage-appropriate questions about the problem, prior work, progress, objective, current obstacle, validity of the present step, and available benchmarks.
- Independent skeptical, literature, physical-consistency, numerical, and code perspectives challenge the main line before expensive or consequential actions.
- Physics-aware checks cover approximations, dimensional analysis, symmetry and conservation constraints, solvable limits, convergence, cross-method comparison, and literature benchmarks.
- The user-visible artifact is a structured research trace — frames, questions, candidate explanations, evidence, falsifiers, and decisions — not raw hidden chain-of-thought.

### M5 · Web and mobile

- Structured research-state visualization, research-memory retrieval, and researcher decision checkpoints in the web UI.
- Remote control from a phone: the web mobile shell plus a remotely deployed hakimi server with hardened authentication, including run approval, pause/resume, result inspection, and research-direction feedback.

### M6 · Branding and community

Bilingual docs, research use cases, evaluations, and tutorials.

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

Layout follows upstream: the CLI is `apps/kimi-code`; the current kap-server runtime is `packages/agent-core-v2` while `packages/agent-core` remains the legacy engine; model providers are `packages/kosong`, and the SDK is `packages/node-sdk`.

## License

MIT. Upstream Kimi Code is © Moonshot AI; see [LICENSE](LICENSE).
