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

## What Hakimi is

Hakimi is a fork of [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) that tracks upstream `main` closely. The current `main` provides the product shell while Hakimi builds its research layer behind explicit gates: Hakimi owns research orchestration, tools, and interaction; the separate [AITP Research Protocol](https://github.com/bhjia-phys/AITP-Research-Protocol) remains authoritative for durable research memory and evidence.

The terminal loop, tools, sessions, Skills, MCP, subagents, permissions, and OAuth continue to come from upstream Kimi Code. The historical deeply embedded prototype is archived on the [`aitp-research`](https://github.com/bhjia-phys/Hakimi/tree/aitp-research) branch and is not the integration path for this line.

## Differences from upstream

- **Branding:** `hakimi` command, `Hakimi` product name, and a pixel cat-ear spacecraft welcome logo. The package installs only `hakimi`; it never overwrites a separate `kimi` command.
- **Own home directory:** config, sessions, logs, and caches live under `~/.hakimi` (override with `HAKIMI_HOME`), independent of `~/.kimi-code`.
- **Bidirectional session sharing:** `hakimi -r` and `/sessions` can resume Kimi Code sessions, while new Hakimi sessions are mirrored into `~/.kimi-code` for the upstream CLI. Sharing is enabled only for the default `~/.hakimi` home.
- **Own release channel:** update checks and tips use [Hakimi releases](https://github.com/bhjia-phys/Hakimi/releases), including prereleases. Hakimi follows its own semver line (currently `0.21.x`) rather than upstream tags.
- **DeepSeek provider:** first-class `provider add deepseek` setup plus an unauthenticated local web-search fallback for `WebSearch`.
- **Experimental ChatGPT OAuth:** opt-in device login can use a ChatGPT subscription through the OpenAI Codex backend, independently of API-key billing.
- **Subagent presets:** `[subagent.agents.<type>]` and `[subagent.presets.<name>]` can pin per-subagent models and thinking efforts; switch at runtime with `/preset <name>`.
- **Transport identity:** provider-pipeline requests identify as `kimi-code-cli/<version> (hakimi)` so Kimi-for-Coding OAuth keeps working.

Everything else — features, flags, config schema, and behavior — follows upstream Kimi Code. See the [upstream docs](https://moonshotai.github.io/kimi-code/en/) for the full reference; `[subagent]` preset fields are documented in `docs/en/configuration/config-files.md`.

## Roadmap

**Positioning:** Hakimi is being built as a theoretical-physics research agent for DeepSeek, Kimi, and similar reasoning models. It should develop scientific software, ask useful questions, test competing explanations, and preserve grounded results through AITP without treating transcripts or raw chain-of-thought as research memory.

### Product shell baseline

Done: branding and welcome logo, own `~/.hakimi` home, bidirectional session sharing, own release channel, DeepSeek provider, experimental ChatGPT/OpenAI Codex OAuth, and subagent presets.

### Shared gates and execution order

The seven tracks are fixed: **A Web**, **B Phone remote**, **C AITP integration**, **D Built-in Hakimi Research Loop**, **E UI and settings**, **F Continuous Kimi Code upstream absorption and foundation work**, and **G Dedicated DeepSeek adapter and DeepSeek Harness intake**. Shared contracts, release work, documentation, evaluations, and tutorials serve all seven tracks; they are not an additional track.

The order is **contract freeze → core correctness → public boundaries → Hakimi overlay → final `GoalFeature` evaluation**. A–E and G may develop in parallel against frozen fixtures, but cross-track integration and release wait for F's gates. The default runtime is `agent-core-v2`; `packages/agent-core` remains v1 legacy compatibility.

### A · Web

- **Owner:** external code-app Web owner for source; Hakimi owner for receiving, branding, provenance, and shipping the bundle.
- **Depends on:** F's public contracts and B–E projections; A does not redefine domain ownership.
- **Delivery:** Web source stays in the external code-app repository. This repository only syncs the committed `apps/kimi-code/dist-web`, which presents sessions, structured research state, memory retrieval, and researcher checkpoints through public contracts.

### B · Phone remote

- **Owner:** remote product and deployment owner.
- **Depends on:** F's session, permission, auth, REST/WS, and transcript contracts plus A's deployable bundle; C is optional and D must not be a prerequisite.
- **Delivery:** the first phase is a responsive Web/PWA shell, not a native app. Production uses only `kap-server` `/api/v1` REST/WS + transcript with hardened authentication; it covers approval, pause/resume, result inspection, feedback, reconnect, and catch-up. It does not revive generic `/api/v2` RPC, debug reflection, or a daemon.

### C · AITP integration

- **Owner:** Hakimi's AITP adapter only. AITP owns `.aitp` schemas, validation, persistence, provenance, and ledger semantics.
- **Depends on:** AITP's CLI + files and F's adapter/contribution boundaries. D's built-in loop runs without C.

Last verified against AITP HEAD `9f9e873440b8d88bfbb2963d8b5717c83b9ef4cc` (2026-08-14, `--help` re-checked command by command): M0/M0.5 are complete, M0.6 is closed under its narrowed reviewed claim, and M1a, M1b-R1, and M1c are **done; deterministic gate passed** (107 tests). H0 is implementable; the installed Skill currently provides the manual CLI path with Python 3.11 or newer, locates its bundled `scripts/aitp.py`, and does not require a global `aitp` executable. Hakimi's native structured adapter is not implemented. `record`/`note prepare|save` remain strict, unversioned version-0 response contracts that fail closed on unknown `status`. The versioned read transports `aitp/enter-0.2`, `aitp/list-0.1`, `aitp/show-0.1`, and `aitp/check-report-0.1` are shipped and gated, and the M1c scoped contracts `aitp/enter-0.3`/`aitp/list-0.2` are emitted only with the single-occurrence `--workstream <slug>` flag; all may be feature-detected when the adapter lands. The persistent `aitp/lite-entry-0.1` and `aitp/lite-note-0.1` schemas identify AITP files, not response envelopes; `aitp/enter-0.1`, `aitp search`, and `aitp --version` do not exist, and `aitp lineage` remains a deferred candidate.

| Hakimi gate | AITP gate | Planned delivery and current fact |
| --- | --- | --- |
| H0 · current CLI | M0/M0.6 | Use the installed Skill for `init`, `enter`, `inventory`, and `record`/`note prepare|save`; never auto-run `init`, `init --adopt`, or `inventory`. |
| H1 · retrieval | M1a (gate passed) | Planned feature-detection of `enter-0.2`, `list-0.1`, and `show-0.1` and their golden fixtures; the AITP side is shipped and gated, the Hakimi adapter is not yet implemented. |
| H2 · relations and diagnostics | M1b-R1 (gate passed) | Planned `check-report-0.1` consumption (parse on exits 0/1; exit 2 is the error envelope); persisted `based_on`/`used_by` and pointer bundles are not in R1. |
| H3 · research memory | M1c (gate passed); AITP M2–M4 after | Planned consumption of the M1c scoped contracts (`enter-0.3`/`list-0.2`, only with the single-occurrence `--workstream` flag) and, later, reviewed artifacts, cross-topic links, and the Skill-driven collaborator protocol. |

The boundary remains strict CLI + files: no copied AITP runtime, SDK, API/MCP server, daemon, second ledger, or direct canonical-file writes. An uninitialized or AITP-free workspace continues with an explicit degraded status. H1–H3 remain Hakimi-side plans — the AITP contracts they target are shipped, but Hakimi's adapter support for them is not yet implemented and must not be described as available. The detailed matrix and verified decisions are in [`docs/aitp/`](docs/aitp/); re-check AITP `--help`, schemas, and official fixtures before changing compatibility claims.

### D · Built-in Hakimi Research Loop

- **Owner:** Hakimi research domain, including Research Frame, Research Question Board, bounded checkpoints, physics insight, and structured research trace.
- **Depends on:** F's agent, subagent, tool, permission, and transcript seams; it does not depend on C and must run without AITP.
- **Delivery:** distinguish outcome (`Goal`), action (`Todo`), and unknown/challenge (Research Question); use independent skeptical, literature, physics, numerical, and code perspectives; perform bounded physics-aware checks; expose frames, questions, evidence, falsifiers, and decisions rather than raw hidden chain-of-thought. Maintain a durable **research-process trajectory** (科研过程轨迹): a replayable line of research stages — question → literature → hypothesis/derivation → numerics → evidence → decision — derived from wire/transcript events and folded into a compact snapshot the model reads at turn boundaries, so it always knows what has been done and what the next gap is; when AITP is active, trajectory nodes map to `record`/`note prepare|save` entries as grounded research memory rather than transcript.

### E · UI and settings

- **Owner:** cross-surface UX and settings owner for TUI, Web, and mobile; domain owners retain business schemas and semantics.
- **Depends on:** A–D and F typed contracts, events, config contributions, and status projections.
- **Delivery:** keep settings, provider setup, interaction, loading/error/degraded states, bilingual copy, and accessibility behavior consistent without duplicating domain validation, defaults, persistence, or state machines.

### F · Continuous Kimi Code upstream absorption and foundation work

- **Owner:** platform/engine owner for the default `agent-core-v2` runtime, public facades, release/CI, and Hakimi overlay regression checks.
- **Depends on:** upstream `main`, classified migrations/deletions, and evidence from the other tracks; F classifies and tests changes instead of mechanically syncing them.
- **Delivery:** maintain v2 canonical contracts and adapters, absorb provider/auth/tools/session/SDK/transcript/permission/performance/security work through public boundaries, run the shared gates, and maintain release automation. Evaluate `GoalFeature` only after the preceding gates pass; do not move or remove Goal capability early.

### G · Dedicated DeepSeek adapter and DeepSeek Harness intake

- **Owner:** platform/engine owner; adapter work lands in the kosong provider layer, cache discipline in the v2 engine's request assembly.
- **Depends on:** F's contract freeze and public boundaries; DeepSeek Harness `main` reviewed as a reference upstream through a tracked intake process (planned `docs/dsh-intake/`); E's provider settings surface; must not regress the GPT/Kimi paths.
- **Delivery:** a dedicated DeepSeek adapter — top-level `thinking` semantics, official `reasoning_effort` levels, per-turn CoT passback economy, a model catalog with context windows, DeepSeek-specific error classification and telemetry, and a stream idle watchdog — scoped entirely to the adapter layer over a dialect-free core; plus continuous intake of DeepSeek Harness mechanisms, led by cache discipline: epoch request headers, session-log-derived requests, stable post-compaction system prompts, deterministic tool ordering, dynamic content appended at the tail, cache-aware usage accounting, and a real-API cache-hit e2e asserting `cacheReadTokens > 0` on every request after the first.

## Install

Prebuilt binaries and install scripts are published on the [releases page](https://github.com/bhjia-phys/Hakimi/releases):

```sh
curl -fsSL https://github.com/bhjia-phys/Hakimi/releases/latest/download/install.sh | bash
```

To update an existing install, run `hakimi upgrade` inside the terminal.

## Build from source

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

## Experimental ChatGPT / OpenAI Codex login

Enable the experiment and start the device-code flow from the terminal:

```sh
hakimi login --provider openai-codex --enable-experimental
```

For a headless terminal, add `--no-open` and open the printed URL manually. In the TUI, run `/experiments`, enable `openai-codex-oauth`, then run `/login` and choose `ChatGPT / OpenAI Codex (OAuth)`. Credentials and generated provider configuration remain under Hakimi's own home directory.

## Development

```sh
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false -C apps/kimi-code typecheck
corepack pnpm --config.engine-strict=false -C apps/kimi-code test
```

Layout follows upstream: the CLI is `apps/kimi-code`; the current kap-server runtime is `packages/agent-core-v2`, while `packages/agent-core` remains the legacy engine; model providers are in `packages/kosong`, and the SDK is in `packages/node-sdk`.

## License

MIT. Upstream Kimi Code is © Moonshot AI; see [LICENSE](LICENSE).
