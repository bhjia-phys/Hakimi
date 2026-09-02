# Hakimi

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi terminal welcome screen with a pixel cat-ear exploration spacecraft" />
</p>

<p align="center">
  <strong>A theoretical-physics research agent built for one objective: truth.</strong><br />
  <span>Truth is the objective. Evidence is the boundary. Reproducibility is the test.</span>
</p>

<p align="center">
  <a href="README.zh-CN.md">中文</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">Repository</a> |
  <a href="docs/en/guides/getting-started.md">User manual</a> |
  <a href="LICENSE">License</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Why Hakimi

Hakimi is not a machine for producing one-shot answers. It is built to pursue a theoretical-physics question through bounded work: state assumptions, seek disconfirming evidence, distinguish a result from its uncertainty, and choose the next test that can decide something.

Its terminal, code, search, tests, and subagents are research instruments—not its identity. Hakimi does not optimize for busywork or engineering complexity. It begins with the simplest useful model and prefers the smallest decisive check over a larger, less discriminating construction.

## The research loop

```text
Question
  → Bounded action
  → Evidence
  → Result and uncertainty
  → Next discriminating step
```

A question becomes research only when an action can change what should be believed or done next. Hakimi keeps this loop explicit: each action is bounded, each result records its limits, and each next step is selected for its capacity to discriminate between live possibilities.

## What is implemented

- **Research surfaces:** TUI and Web provide a Research Board and Research Manager for following and steering active work.
- **Research structure:** Research Lines, Questions, and Focus make the current unknown, assumptions, and priorities visible.
- **Bounded actions:** `BeginResearchAction` and `ConcludeResearchAction` frame scientific work with an outcome, limitations, a next step, and one explicit durability assessment. No durable delta performs no ledger persistence; a durable delta emits one typed pending candidate for the existing AITP commit barrier.
- **Science-first progress:** progress is organized around evidence and uncertainty rather than tool activity or transcript volume.
- **Review and human control:** human gates and alerts support explicit judgment, while typed child-evidence review keeps delegated work inspectable.
- **External-compute observations:** Hakimi can record structured observations about externally run HPC work while keeping scheduler state separate from scientific evidence. It does not schedule jobs, poll them to completion, or certify success. Goal is the sole owner of cross-turn continuation.

## Theory-physics discipline

The optional `theory-physics` domain pack is the upper-layer handbook for sustained theoretical-physics research. It routes a request from Research Mode admission, through Line / Question / Focus and a stage Goal, to one bounded Research Action; only durable scientific deltas or reusable-method candidates are handed to the external `using-aitp` or `distilling-methods` skills on demand.

An ordinary one-off physics answer does not need Research Mode. The pack is a discipline, not an oracle: it is not a literature database, physics-correctness service, scheduler, second runtime, ledger, or background autonomous loop. The researcher remains responsible for conventions, significance, and final scientific judgment; AITP remains the protocol authority.

## Evidence before confidence

Hakimi can help construct arguments, calculations, code, searches, and tests. None of these alone authenticates a physical claim. Hakimi does not certify physical correctness, numerical convergence, or the success of a running external task.

Human review and reproducible verification are part of the research loop, not a final cosmetic step. When the evidence is insufficient or conflicts, the honest result is uncertainty, a blocked question, or a smaller discriminating check.

## Research Mode and AITP

Research Mode is discoverable by default, but every new session starts inactive. For sustained work, `theory-physics` can guide the model to call `EnterAITPMode`, wait for authoritative probe status, and perform a bounded action; inactive sessions perform zero AITP I/O. The Research Board and model context distinguish the Hakimi Goal, the observed AITP Program (including its top-level **Research goal**), and the Local Research Loop. Hakimi observes that top-level goal only through AITP `enter`; it never writes `TOPIC.md` or an AITP Topic. A Goal-to-Program alignment is a local, checkpointed binding that the user explicitly confirms rather than a text-similarity inference. In active Research Mode, a missing, stale, or explicitly conflicting binding holds Goal completion and automatic continuation; an inactive Goal is unaffected. Entering Research Mode does not schedule model turns—Goal alone owns cross-turn continuation, while Plan is only a short-lived action overlay. In `auto` permission mode, routine in-scope Research actions follow the normal tool permission policy instead of creating a second durable approval gate; a matching action approval left by an older session is resumed as an auditable standing auto authorization.

A Research Line and an AITP workstream are also separate identities. After Hakimi observes the current Topic, the user or main agent must explicitly confirm a revisioned local Line-to-workstream binding; matching slugs, text, paths, or IDs never imply membership. Each confirmation has a server-owned opaque identity, and clear must compare both that identity and the non-rewinding public Research revision. Unbound, unavailable, stale, or conflicting Lines may continue low-risk local exploration, but scoped maintenance and Hakimi checkpoint adoption require the exact confirmed binding. Hakimi re-observes the unscoped Topic before scoped maintenance and checkpoint writes, while the post-save commit barrier verifies the captured Topic and exactly one captured workstream. Checkpoint-bound saves require AITP 0.9.0 adapter-contract 0.2: Hakimi supplies the captured Topic and exact singleton workstream to atomic `record save`, so a mismatch creates no canonical Entry; post-save `show` and scoped `check` remain defense in depth. Rebinding requires an explicit clear first, and undo or cold restore revalidates the stored Topic and observed revision instead of repairing the binding automatically. The same binding and typed durable-candidate state is projected through REST, WebSocket, Node SDK, klient, TUI, and Web.

[AITP](docs/aitp/) is an optional external durable-evidence ledger, used through its CLI and files. It is not a second Hakimi runtime or database. After `ConcludeResearchAction`, Hakimi can route one assessed durable delta through the existing prepare/fill/save/show/checkpoint path; a no-delta conclusion schedules no persistence or distillation work, and human assertions or decisions remain separate from agent/tool/source verification. After the first successful commit of a new checkpoint, Hakimi makes one same-turn, best-effort handoff of only that touched Entry to the exact external `distilling-methods` Skill. A duplicate commit or unavailable Skill is a non-blocking no-op, and the external Skill alone decides whether the evidence meets an existing trigger. The Research snapshot can show only that the latest exact handoff was requested or unavailable; it never claims a trigger, card, trial, completed review, approval, or publication. Hakimi does not parse markers, create or revise cards on its own, approve or publish them, auto-initialize/adopt/backfill workspaces, add `/research goal`, introduce a workstream registry, or provide the planned native H6b coordinator. Hakimi-local Goal–Program and Line–workstream bindings never write AITP. When AITP is unavailable, Research Mode reports a degraded state and blocks durable writes, checkpoints, and completion of an active Research Goal. Detailed compatibility and operating boundaries are maintained in the [AITP documentation](docs/aitp/).

## Install from source

Hakimi currently installs from source. Use Node.js 24.15.0 or newer and pnpm 10.33.0:

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

Start an interactive session, run one prompt, or continue the previous session:

```sh
hakimi
hakimi -p "Summarize the test failures in this repository."
hakimi -c
```

In an interactive session, enter Research Mode explicitly when the work requires it:

```text
/research on
```

Use `/login` to configure an available provider. For DeepSeek setup, run `hakimi provider deepseek`. Login is explicit; Hakimi never begins OAuth login at startup. Configuration, sessions, logs, and caches live under `~/.hakimi` by default; set `HAKIMI_HOME` to use another data directory.

On Windows, install [Git for Windows](https://gitforwindows.org/) before first launch. Hakimi uses its bundled Git Bash shell; if Git Bash is installed elsewhere, set `KIMI_SHELL_PATH` to the absolute path of `bash.exe`.

## Current status

- Hakimi is a development version that can be built from source.
- The Research Loop and the optional `theory-physics` pack are experimental and may change.
- There is no public npm package or release installer; use the source-build path above.
- Hakimi does not replace expert judgment, human review, or reproducible scientific validation.

## Documentation

- [Getting started](docs/en/guides/getting-started.md)
- [Configuration](docs/en/configuration/config-files.md)
- [Research Mode](docs/en/guides/research-mode.md)
- [AITP documentation and compatibility records](docs/aitp/)
- [Implementation notes](IMPLEMENTATION.md)

## Project background

Hakimi is an independent repository with its own `hakimi` command, `~/.hakimi` data directory, semver release line, and research direction. It selectively builds on engineering foundations from [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code), but it is not a product-parity fork and does not adopt upstream behavior automatically.

The historical source and attribution context remain in [`bhjia-phys/Hakimi-upstream-archive`](https://github.com/bhjia-phys/Hakimi-upstream-archive). See the [MIT license](LICENSE) for required attribution.

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
