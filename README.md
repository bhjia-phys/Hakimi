# Hakimi

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi terminal welcome screen with a pixel cat-ear exploration spacecraft" />
</p>

<p align="center">
  <strong>A standalone Kimi Code continuation evolving into a chain-of-thought-native agent for theoretical physics.</strong><br />
  <span>Kimi Code engineering foundations — independent Hakimi governance, research orchestration, staged AITP memory integration, and product experience.</span>
</p>

<p align="center">
  <a href="README.zh-CN.md">Chinese</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">Repository</a> |
  <a href="docs/en/guides/getting-started.md">Hakimi user manual</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## What Hakimi is

Hakimi is an independent, standalone continuation built on the engineering foundations of [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code). The repository preserves its inherited Git history and upstream attribution, but it is no longer in the Kimi Code GitHub fork network and does not target product parity. Hakimi owns its v2 architecture decisions, research orchestration, tools, workflows, interaction, and release line. The separate [AITP Research Protocol](https://github.com/bhjia-phys/AITP-Research-Protocol) remains authoritative for durable research memory and evidence.

The terminal loop, tools, sessions, Skills, MCP, subagents, permissions, and OAuth originated in Kimi Code and remain candidates for selectively reviewed general-purpose improvements. Hakimi absorbs only changes that fit its goals and canonical v2 contracts; upstream product-specific behavior is not imported by default. The historical deeply embedded prototype is archived on the [`aitp-research`](https://github.com/bhjia-phys/Hakimi/tree/aitp-research) branch and is not the integration path for this line.

## Repository lineage

- **Canonical standalone repository:** [`bhjia-phys/Hakimi`](https://github.com/bhjia-phys/Hakimi)
- **Historical fork archive:** [`bhjia-phys/Hakimi-upstream-archive`](https://github.com/bhjia-phys/Hakimi-upstream-archive), retained for the original pull requests, releases, and fork-network metadata
- **Upstream foundation:** [`MoonshotAI/kimi-code`](https://github.com/MoonshotAI/kimi-code)

The preserved Git history retains the original Kimi Code authorship and remains the durable provenance record alongside the archive and license attribution.

## Differences from upstream

- **Branding:** `hakimi` command, `Hakimi` product name, and a pixel cat-ear spacecraft welcome logo. The package installs only `hakimi`; it never overwrites a separate `kimi` command.
- **Own home directory:** config, sessions, logs, and caches live under `~/.hakimi` (override with `HAKIMI_HOME`), independent of `~/.kimi-code`.
- **Bidirectional session sharing:** `hakimi -r` and `/sessions` can resume Kimi Code sessions, while new Hakimi sessions are mirrored into `~/.kimi-code` for the upstream CLI. Sharing is enabled only for the default `~/.hakimi` home.
- **Own release channel:** update checks and tips use [Hakimi releases](https://github.com/bhjia-phys/Hakimi/releases), including prereleases. Hakimi follows its own semver line (currently `0.21.x`) rather than upstream tags.
- **DeepSeek provider:** first-class `provider add deepseek` setup plus an unauthenticated local web-search fallback for `WebSearch`.
- **Experimental ChatGPT OAuth:** opt-in device login can use a ChatGPT subscription through the OpenAI Codex backend, independently of API-key billing.
- **Subagent presets:** `[subagent.agents.<type>]` and `[subagent.presets.<name>]` can pin per-subagent models and thinking efforts; switch at runtime with `/preset <name>`.
- **Transport identity:** provider-pipeline requests identify as `kimi-code-cli/<version> (hakimi)` so Kimi-for-Coding OAuth keeps working.
- **Selective upstream intake:** upstream changes are classified as general-purpose adoption, v2 adaptation, legacy-only compatibility, Hakimi overlay conflict, or rejection; product parity is not a goal.

For inherited behavior that Hakimi has not overridden, the [upstream docs](https://moonshotai.github.io/kimi-code/en/) remain a useful starting point. When Hakimi differs, this repository's code and local documentation are authoritative; `[subagent]` preset fields are documented in `docs/en/configuration/config-files.md`, and the product plan is below.

## Roadmap

**Positioning:** Hakimi is being built as a theoretical-physics research agent for DeepSeek, Kimi, and similar reasoning models. It should develop scientific software, ask useful questions, test competing explanations, and preserve grounded results through AITP without treating transcripts or raw chain-of-thought as research memory.

### Product shell baseline

Done: branding and welcome logo, own `~/.hakimi` home, bidirectional session sharing, own release channel, DeepSeek provider, experimental ChatGPT/OpenAI Codex OAuth, and subagent presets.

### Shared gates and execution order

The seven tracks are fixed: **A Web**, **B Phone remote**, **C AITP integration**, **D Built-in Hakimi Research Loop**, **E UI and settings**, **F Continuous Kimi Code upstream absorption and foundation work**, and **G Dedicated DeepSeek adapter and DeepSeek Harness intake**. Shared contracts, release work, documentation, evaluations, and tutorials serve all seven tracks; they are not an additional track.

The order is **contract freeze → core correctness → public boundaries → Hakimi overlay → reusable Tower workflow runtime → final `GoalFeature` evaluation**. A–E and G may develop in parallel against frozen fixtures, but cross-track integration and release wait for F's gates. The default runtime is `agent-core-v2`; `packages/agent-core` is frozen as v1 legacy compatibility and rollback reference.

**Platform decision (2026-08-14):** the research layer (D and C tracks) is implemented in Hakimi itself; DeepSeek Harness serves only as a mechanism reference upstream. DeepSeek Harness was evaluated as the research-layer home and rejected for now — release-candidate maturity with declared breaking changes — with a re-review condition: a stable DSH release plus a clear G2 cross-harness benchmark advantage.

### Cross-track foundation · composable Tower workflows

Tower will evolve from its current fixed worker/reviewer protocol into a reusable, validated, and observable multi-agent workflow runtime. This is a shared F/E/A foundation, not an eighth product track: F owns the headless engine, compiler, recovery, worktree isolation, and tool-enforced gates; E owns the cross-surface workflow UX; A carries the visual editor and live monitor in the in-repository `apps/kimi-web` production source. D may contribute research workflow templates, while C remains an optional AITP adapter and never becomes Tower's state store.

The design separates three concerns. A **workflow** defines nodes, dependencies, scopes, artifacts, fan-out/fan-in, review and merge gates, retries, and completion criteria. A **role/profile** defines tools, permissions, communication, and worktree confinement. A canonical **preset** maps semantic routes such as research, architecture, implementation, testing, and review to models and Thinking effort. Model aliases do not belong in workflow files, and changing a preset must not change the workflow graph. The implementation plan wraps these three policy concerns with two additional infrastructure layers: the authoritative compiler/runtime and its typed public projection.

`Agent` remains the leaf delegation primitive, `AgentSwarm` becomes a reusable fan-out/fan-in primitive, and Tower orchestrates them through one control tower, disjoint mission scopes, worker branches, independent review, and deterministic merge gates. Versioned workflow templates and typed runtime projections will support TUI launch/status flows and, later, visual graph authoring plus live execution inspection without moving engine state into the UI.

The current baseline already provides the fixed Tower protocol and separate `tower_worker` / `tower_reviewer` preset routes. Named workflow roles, a schema/compiler, resumable DAG execution, public projections, reusable engineering/research templates, and the visual editor are roadmap items, not shipped capabilities. The detailed contract, phases, evidence, and stop rules live in [`IMPLEMENTATION.md`](IMPLEMENTATION.md).

### A · Web

- **Owner:** Hakimi owns `apps/kimi-web`, the only editable production source for the browser UI; `apps/kimi-code/dist-web` and `apps/kimi-code/web-base.json` are tracked derived release assets.
- **Depends on:** F's public contracts and B–E projections; A does not redefine domain ownership.
- **Delivery:** the production cutover is complete. After source changes, regenerate and commit package assets with `pnpm run build:web-assets`, then verify a clean byte-for-byte rebuild with `pnpm run build:web-assets -- --check`; CI, release, and native flows verify tracked assets before regenerating them, while direct package build/prepack and Nix generate and validate assets for consumption. Provenance schema v4 binds source, canonical recipe/toolchain, and bundle identities, while the native receipt additionally binds the final binary hash. Generated outputs must not be edited by hand or partially replaced. This cutover does not claim a standalone Web deployment or completion of the phone-remote track.

### B · Phone remote

- **Owner:** remote product and deployment owner.
- **Depends on:** F's session, permission, auth, REST/WS, and transcript contracts plus A's deployable bundle; C is optional and D must not be a prerequisite.
- **Delivery:** the first phase is a responsive Web/PWA shell, not a native app. Production uses only `kap-server` `/api/v1` REST/WS + transcript with hardened authentication; it covers approval, pause/resume, result inspection, feedback, reconnect, and catch-up. It does not revive generic `/api/v2` RPC, debug reflection, or a daemon.

### C · AITP integration

- **Owner:** Hakimi's AITP adapter only. AITP owns `.aitp` schemas, validation, persistence, provenance, and ledger semantics.
- **Depends on:** AITP's CLI + files and F's adapter/contribution boundaries. D's built-in loop runs without C.

Last verified against AITP HEAD `eae1bce5eba367a5f6db6ba73ff0912dd3a5e290` (2026-08-23, `--help` re-checked command by command; the committed HEAD is version `0.8.0` — a Skill-only amendment now committed): M0/M0.5 are complete, M0.6 is closed under its narrowed reviewed claim, and M1a, M1b-R1, M1c, M1d, and M1e are **done; deterministic gate passed** (154 tests). The installed Skill provides the manual CLI path with Python 3.11 or newer, locates its bundled `scripts/aitp.py`, and does not require a global `aitp` executable. Hakimi's first experimental opt-in AITP Research Mode slice is **H0–H4 implemented, with H5 only partially integrated** behind the flag `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE` (default off): it includes strict contract discovery, Python probe, `enter`/`list`/`show`/`check` read-side consumption (H0–H4; H5 integration is partial), `record`/`note prepare|save` write-gated persistence, scoped `--workstream` reads/checks, M1e check-finding-code projection only; it does not expose, call, or parse the `backfill-0.1` success envelope and does not implement `sha256-once:` or `check-policy` semantics, and a TUI `/research` command with a Research Board and manager. It does **not** auto-run `init`, `init --adopt`, `inventory`, or `backfill --apply`; `backfill` is not exposed as a model tool in this slice. The Research state model covers Question/Line/Focus, the three-axis (workflow/epistemic/persistence) question model, revision-based human steering with optimistic concurrency, pending-checkpoint and save+show+check commit barrier, and a Goal-complete guard that blocks completion when a checkpoint is pending or degraded. Mode, loop, Question, Focus, and checkpoint transitions push one complete Research snapshot to the TUI; stale cold hydration cannot overwrite a newer live update. Active research steps receive semantic state-maintenance guidance: the normal bounded-action path is `BeginResearchAction` → scientific work → `ConcludeResearchAction`; lower-level action/phase tools remain recovery or maintenance surfaces. Ordinary tool calls and AITP reads are not misreported as scientific progress. `/research on` activates the capability and Board but does not schedule a model turn; Goal remains the sole cross-turn continuation owner. The protocol (`packages/protocol`), `node-sdk`, `kap-server` REST (`GET/POST /sessions/{id}/research`), and `klient` surfaces are wired. When the flag is off (`=0` or `/experiments`), all AITP tools, skills, and the Research Board are hidden and zero AITP I/O occurs; when the flag is on but the mode is not entered, the surface is available but zero AITP I/O still occurs. `record`/`note prepare|save` remain strict, unversioned version-0 response contracts that fail closed on unknown `status`. The versioned read transports `aitp/enter-0.2`, `aitp/list-0.1`, `aitp/show-0.1`, and `aitp/check-report-0.1` are shipped and gated; the M1c scoped contracts `aitp/enter-0.3`/`aitp/list-0.2` and the M1d scoped `check` contract `aitp/check-report-0.2` are emitted only with the single-occurrence `--workstream <slug>` flag; M1e adds the `backfill` command (`aitp/backfill-0.1` success envelope, dry-run default) and `sha256-once:` mutable-observation pins with no transport schema change. AITP 0.8 is a **Skill-only amendment** (now committed): it defines `method-observation` candidate markers, conservative card/trial review, two-step human decisions (approval + publication), and the platform tool/card/Skill three-layer boundary — it changes no CLI, schema, or transport. The persistent `aitp/lite-entry-0.1` and `aitp/lite-note-0.1` schemas identify AITP files, not response envelopes; `aitp/enter-0.1`, `aitp search`, and `aitp --version` do not exist, and `aitp lineage` remains a deferred candidate. A typed AITP question/line registry, literature/compute/Portfolio support, and H6 native method-distillation orchestration are **not implemented**.

Research Mode entry and active undo/cold restore run a read-only current-state maintenance cycle (`aitp enter` → `aitp check`) after a ready probe. This is not a session-end automatic closeout. The maintenance receipt and context injection expose only a safe summary — Working Note age, unresolved failures, next action, warning/check codes, and counts — while a full Research snapshot/API response or expanded Board may still include checkpoint, revision, and adapter-health fields. Valid check findings, including error findings, stay ready; only an unavailable or invalid cycle surfaces degraded. Error findings can still block a specific checkpoint according to its save barrier. This cycle never auto-runs `init`, adopts, backfills, or writes a semantic handoff, Entry, or Note; it is maintenance only, not H6 native method-distillation orchestration, which remains planned and unavailable. The Research Loop also exposes typed child evidence review and an explicit HPC run observation (`campaign`/`job`/`stage`/scheduler state) bound to the current action. These are state and evidence boundaries only: Hakimi does not submit or poll scheduler jobs, infer scientific success from `RUNNING`, or create a campaign aggregate.

Hakimi has alerts and a generic human gate, but candidate confirmation is not a runtime-enforced guard on `SetResearchFocus`, and `ResolveResearchDecision` does not automatically write an AITP decision Entry. In degraded active Research Mode, AITP writes and Goal completion are blocked; unresolved human gates also block Goal completion, while local Question/Line mutations may still occur. No automatic session-closeout is performed.

The local compatibility tests use the committed official AITP 0.8.0 golden fixtures for `enter.json`, `enter-after-save.json`, `list.json`, `show.json`, `check.json`, and `check-workstream.json`. They exercise local parser/contract behavior without starting a live CLI subprocess, so they are not live CLI conformance tests.

The opt-in Research surface is available in both TUI and Web. Web routes `/research` through the typed Research endpoint and provides a Composer **Modes** entry, live Board, and line-first form Manager. Same-session mutations are revision-safe, and checkpoint commit requires an existing AITP `entryId`; Web does not write the AITP ledger.

| Hakimi gate | AITP gate | Status |
| --- | --- | --- |
| H0 · current CLI | M0/M0.6 | **Implemented (experimental).** Launcher adapter, Python ≥ 3.11 probe, strict version-0 prepare/save envelope validation, contract-accurate record/Note argv, `enter` lifecycle, prepare→fill→save flow, and typed `not_initialized` degradation. Never auto-runs `init`, `init --adopt`, or `inventory`. |
| H1 · retrieval | M1a (gate passed) | **Implemented (experimental).** Strictly feature-detects and consumes `enter-0.2`, `list-0.1`, and `show-0.1` (including malformed Entry responses); Note-age signal; current-state maintenance is limited to read-only `enter` → `check` on mode entry and active undo/cold restore, not session-end closeout. Full canonical Entry reads use `show`, never ad hoc Markdown parsing. |
| H2 · relations and diagnostics | M1b-R1 (gate passed) | **Implemented (experimental).** Strictly consumes `check-report-0.1`: exits 0/1 are data-bearing success, warning-only findings do not degrade the adapter, and error findings block checkpoint commit. A valid exit-2 AITP error fails closed; parser misuse remains a command error rather than degrading the whole adapter. Persisted `based_on`/`used_by` and pointer bundles are not in R1. |
| H3 · research memory | M1c (gate passed); AITP M2–M4 after | **Implemented (experimental).** Consumes M1c scoped contracts (`enter-0.3`/`list-0.2`, only with the single-occurrence `--workstream` flag). Typed question/line registry, reviewed artifacts, cross-topic links, and Skill-driven collaborator protocol are not implemented. |
| H4 · workstream health | M1d (gate passed) | **Implemented (experimental).** Consumes scoped `check` (`check-report-0.2`, only with `--workstream`: admitted in-scope counts, `by_code`/`outside_scope`, four-line text is human-only); without the flag `check-report-0.1` stays byte-unchanged. |
| H5 · evidence lifecycle | M1e (gate passed) | **Partial (experimental).** AITP ships `backfill-0.1` and its `sha256-once:`/policy semantics, but the Hakimi adapter does not expose, call, or parse the backfill success envelope. Hakimi only projects check finding codes as opaque strings; it does not implement `sha256-once:` or `check-policy` semantics. |
| H6 · native distillation | planned (adapter-contract extension not yet frozen) | **Planned, unavailable.** Native method-distillation orchestration: Session-scope coordinator, candidate/proposal lifecycle, human question + decision write, crash/resume. See [`docs/aitp/method-distillation-orchestration.md`](docs/aitp/method-distillation-orchestration.md). |

The boundary remains strict CLI + files: no copied AITP runtime, SDK, API/MCP server, daemon, second ledger, or direct canonical-file writes. An uninitialized or AITP-free workspace continues with an explicit degraded status. The Hakimi adapter-shipped slice is H0–H4 implemented and H5 partial behind `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE` (default off); the AITP upstream 0.8.0 Skill-only amendment is a separate upstream-shipped layer. This opt-in flag is a Hakimi product decision only: it is not an AITP protocol-stage state and it is not an H6 availability signal. The Research surface is exposed only after setting `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE=1` (or enabling it in `/experiments`); it still does not enter the mode, probe AITP, show the Board, or open AITP plugin skills until `/research on`. With the flag off, the inactive state has zero AITP I/O and never auto-runs `init`, `init --adopt`, `inventory`, or `backfill --apply`. Toggle the flag off in `/experiments` to hide the entire Research surface. H6 (native method-distillation orchestration) is planned and unavailable; it depends on a reviewed adapter-contract extension that has not been frozen. The detailed matrix and verified decisions are in [`docs/aitp/`](docs/aitp/); the native distillation orchestration design is in [`docs/aitp/method-distillation-orchestration.md`](docs/aitp/method-distillation-orchestration.md). Re-check AITP `--help`, schemas, and official fixtures before changing compatibility claims.

### D · Built-in Hakimi Research Loop

The D track is the primary research-layer implementation track (2026-08-14 platform decision).

- **Owner:** Hakimi research domain, including Research Frame, Research Question Board, bounded checkpoints, physics insight, and structured research trace.
- **Depends on:** F's agent, subagent, tool, permission, and transcript seams; it does not depend on C and must run without AITP.
- **Delivery:** distinguish outcome (`Goal`), action (`Todo`), and unknown/challenge (Research Question); use independent skeptical, literature, physics, numerical, and code perspectives; perform bounded physics-aware checks; expose frames, questions, evidence, falsifiers, and decisions rather than raw hidden chain-of-thought. Maintain a durable **research-process trajectory** (科研过程轨迹): a replayable line of research stages — question → literature → hypothesis/derivation → numerics → evidence → decision — derived from wire/transcript events and folded into a compact snapshot the model reads at turn boundaries, so it always knows what has been done and what the next gap is; when AITP is active and persistence is explicitly enabled, eligible trajectory nodes enter the adapter-gated `record`/`note prepare|save` flow and become grounded research memory only after that write gate succeeds.

### E · UI and settings

- **Owner:** cross-surface UX and settings owner for TUI, Web, and mobile; domain owners retain business schemas and semantics.
- **Depends on:** A–D and F typed contracts, events, config contributions, and status projections.
- **Delivery:** keep settings, provider setup, interaction, loading/error/degraded states, bilingual copy, and accessibility behavior consistent without duplicating domain validation, defaults, persistence, or state machines. For Tower workflows, E owns graph/navigation semantics, validation-result diagnostics and degraded-state presentation, preset overlays, and live execution inspection; TUI starts with template selection and status, while the visual editor is delivered through A's external Web source.

### F · Continuous Kimi Code upstream absorption and foundation work

- **Owner:** platform/engine owner for the default `agent-core-v2` runtime, public facades, release/CI, Hakimi overlay regression checks, and the headless Tower workflow runtime.
- **Depends on:** upstream `main`, classified migrations/deletions, and evidence from the other tracks; F classifies and tests changes instead of mechanically syncing them.
- **Delivery:** maintain v2 canonical contracts and adapters, absorb provider/auth/tools/session/SDK/transcript/permission/performance/security work through public boundaries, run the shared gates, and maintain release automation. Build the versioned Tower workflow schema/compiler, deterministic recovery, role-route resolution, worktree/review/merge enforcement, and typed public projections consumed by E/A/D/C. Evaluate `GoalFeature` only after the preceding gates pass; do not move or remove Goal capability early.

### G · Dedicated DeepSeek adapter and DeepSeek Harness intake

- **Owner:** platform/engine owner; adapter work lands in the kosong provider layer, cache discipline in the v2 engine's request assembly.
- **Depends on:** F's contract freeze and public boundaries; DeepSeek Harness `main` reviewed as a reference upstream through a tracked intake process (planned `docs/dsh-intake/`); E's provider settings surface; must not regress the GPT/Kimi paths.
- **Delivery:** a dedicated DeepSeek adapter — top-level `thinking` semantics, official `reasoning_effort` levels, per-turn CoT passback economy, a model catalog with context windows, DeepSeek-specific error classification and telemetry, and a stream idle watchdog — scoped entirely to the adapter layer over a dialect-free core; plus continuous intake of DeepSeek Harness mechanisms, led by cache discipline: epoch request headers, session-log-derived requests, stable post-compaction system prompts, deterministic tool ordering, dynamic content appended at the tail, cache-aware usage accounting, and a real-API cache-hit e2e asserting `cacheReadTokens > 0` on every request after the first. Scope note (2026-08-14): mechanism intake only — DeepSeek Harness was evaluated and rejected as the research-layer home; no research layer is built on DSH.

## Install from source

Hakimi does not yet publish a public npm package or release install script. Building the current development version requires Node.js 24.15.0 or later and pnpm 10.33.0:

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
npm install -g ./.tmp/dist-pack/bhjia-phys-hakimi-0.21.0.tgz
hakimi --version
```

The tarball filename contains the current package version. If it has changed, use the filename printed by `pnpm pack` instead of `0.21.0`. To update a source installation, pull the desired revision and repeat the build, pack, and global-install steps.

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
