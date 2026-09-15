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

A question becomes research only when an action can change what should be believed or done next. This loop is a working method, not a mandatory host state machine: actions have boundaries, results have evidence and limits, and the next step should discriminate between live possibilities.

## Research support

- **Local knowledge:** ordinary file tools maintain conclusions, assumptions, sources, and open questions through the project's existing indexes.
- **Long-term memory:** official AITP skills and CLI preserve worthwhile progress; this architecture is implemented and installed locally, while formal release and any remaining acceptance gaps are tracked below.
- **Science-first progress:** keep evidence and uncertainty visible rather than treating tool activity, turn counts, or saved records as scientific progress.
- **On-demand organization:** ordinary Goal, Plan, and tool permissions retain their separate roles, without per-step Research approvals or a second continuation engine.

## Theory-physics discipline

The optional `theory-physics` domain pack provides physics-method guidance: discuss uncertainty, retrieve evidence, check derivations and numerical results, and explain limitations. It does not require a Line, Question, Action, or Research Plan for every step. Long-term memory follows the external `using-aitp` and `distilling-methods` skills rather than a second Hakimi protocol; reading existing records requires no new result.

An ordinary one-off physics answer does not need Research Mode. The pack is a discipline, not an oracle: it is not a literature database, physics-correctness service, scheduler, second runtime, ledger, or background autonomous loop. The researcher remains responsible for conventions, significance, and final scientific judgment; AITP remains the protocol authority.

## Evidence before confidence

Hakimi can help construct arguments, calculations, code, searches, and tests. None of these alone authenticates a physical claim. Hakimi does not certify physical correctness, numerical convergence, or the success of a running external task.

Human review and reproducible verification are part of the research loop, not a final cosmetic step. When the evidence is insufficient or conflicts, the honest result is uncertainty, a blocked question, or a smaller discriminating check.

## Research Mode and AITP

**Locally implemented and installed; no formal release or complete end-to-end acceptance is claimed.** Research Mode now uses local knowledge and long-term research memory, not a smaller Research Board. Ordinary project files answer **what we know now**; official AITP records preserve **how we got here**. Follow the project's existing `AGENTS.md` and `README` indexes rather than imposing a new directory layout.

`/research on`, `/research off`, and `/research status` control or inspect the lightweight mode and official AITP skill visibility. They do not install or run the CLI, initialize a store, write the ledger, or start a background loop. Session restore and ordinary turn boundaries do not run automatic AITP maintenance. Local knowledge uses normal file tools; meaningful new knowledge or progress may be saved through official skills and CLI. A normal follow-up with no delta causes zero knowledge or ledger writes. The current CLI wrapper points at this workspace's build output, so newly started `hakimi` processes use the new implementation; already-running processes keep the previous code until they are restarted. No user session has been restarted by force.

The selected upstream source is [AITP commit `3bebd4cc0fe786ea30420ab45692d8968cc0990b`](https://github.com/bhjia-phys/AITP-Research-Protocol/tree/3bebd4cc0fe786ea30420ab45692d8968cc0990b): version 0.10.0, `aitp/adapter-contract-0.3`, with atomic scoped Entry and Note saves. It was obtained as a source archive, not a Git checkout, and is not a release tag. The official `using-aitp` and `distilling-methods` skills remain authoritative; Hakimi does not copy their protocol or automatically perform method approval/publication. The 0.10.0 plugin is installed in the local Hakimi home as a managed plugin; the installed copy is now the local derived build described next.

The installed copy is a **local derived build, `0.10.0+repo.1`** — not an upstream release. Its base is still commit `3bebd4cc0fe786ea30420ab45692d8968cc0990b` and `aitp/adapter-contract-0.3` is unchanged. The derivation adds one repository-boundary fix in AITP itself: `resolve_root` now stops at the nearest Git root (a `.git` file, or a `.git` directory containing `HEAD`) instead of resolving a parent store across it. A Git repository with no local store therefore reports `not_initialized` to `enter`/`check` rather than borrowing an enclosing memory, and an explicit `init --adopt` creates the store at the repository root. Existing stores and nested subdirectories behave as before, and repositories without Git — or with an empty/corrupt `.git` directory — keep the original ancestor inheritance. No new CLI flags, registry entries, host hooks, or database are added, and this is not OS-level isolation. One research line maps to one Git repository: its knowledge text and its `.aitp/` store live inside that repository, a global research index is optional navigation only, and each repository keeps its own directory names rather than a fixed `knowledge/` layout.

The implemented backend production graph no longer mounts host ResearchService, Line/Question/Action management, Research Plan, checkpoint/loop/maintenance/distillation machinery, Research Goal vetoes, the native adapter, or any of the eight `aitp_*` wrappers. Historical records remain available read-only through raw session logs or session exports, not a structured Research history API or Manager. Old research-management and advancement mutations are unsupported, not a second legacy mode. Existing AITP records are preserved without automatic migration or backfill.

Ordinary Goal, Plan, and permission behavior is unchanged. Without the host Research veto, normal file tools have no extra guarantee preventing direct access to canonical AITP files: official CLI validation governs its own operations, not every filesystem write, and is not OS-level isolation. A default-model read-only smoke test recovered a source-linked memory across processes with zero knowledge or ledger change and no Goal, Plan, or subagent activity; that single fixture is not a scientific result or proof of universal model behavior. See the [Research Mode guide](docs/en/guides/research-mode.md) and [deployment record](docs/aitp/TRACKING.md#research-memory-lite-20260913) for the remaining closeout items.

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

In an interactive session, use the retained basic commands to enable, inspect, or disable Research Mode; the lightweight behavior still awaits deployment acceptance:

```text
/research on
/research status
/research off
```

Use `/login` to configure an available provider. For DeepSeek setup, run `hakimi provider deepseek`. Login is explicit; Hakimi never begins OAuth login at startup. Configuration, sessions, logs, and caches live under `~/.hakimi` by default; set `HAKIMI_HOME` to use another data directory.

On Windows, install [Git for Windows](https://gitforwindows.org/) before first launch. Hakimi uses its bundled Git Bash shell; if Git Bash is installed elsewhere, set `KIMI_SHELL_PATH` to the absolute path of `bash.exe`.

## Current status

- Hakimi is a development version that can be built from source.
- Research Mode's knowledge-and-memory workflow is locally implemented, installed, and fully tested end to end within this workspace; restart running Hakimi processes to load it. Formal release and a complete server-plus-browser end-to-end run are not claimed. The optional `theory-physics` pack may still change.
- There is no public npm package or release installer; use the source-build path above.
- Hakimi does not replace expert judgment, human review, or reproducible scientific validation.

## Documentation

- [Getting started](docs/en/guides/getting-started.md)
- [Configuration](docs/en/configuration/config-files.md)
- [Research Mode](docs/en/guides/research-mode.md)
- [Historical theory-physics collaborator program and acceptance records](docs/aitp/theory-physics-collaborator-program.md)
- [Historical theory-physics collaborator and Research Loop design](docs/aitp/theory-research-agent-design.md)
- [Current AITP compatibility amendment and historical records](docs/aitp/compatibility-matrix.md#research-memory-lite-20260913)
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

With Node.js 24.15.0+ and workspace dependencies installed, open the source development Web UI with one command:

```sh
./dev
# Equivalent from the repository root: pnpm dev
# From the parent directory: ./Hakimi/dev
```

This starts a source backend and a Vite frontend, connects them using their actual ports, and opens the browser. Occupied ports are skipped; existing instances are left alone. Frontend edits hot-reload; restart the command after backend edits. Ctrl+C stops only this development instance. Pass `--no-open` to print the URL without opening a browser, or `--help` for port options. On Windows, use `node dev` instead of `./dev`.

The development instance uses your usual Hakimi home and configuration (including existing sessions), not an isolated test profile. Set `HAKIMI_HOME` to a separate directory if you want isolation. The ordinary `hakimi` command and `pnpm dev:cli` are unchanged; the latter starts the source TUI, not the Vite frontend.

The CLI lives in `apps/kimi-code`; packages provide the SDK, model/provider integrations, and agent runtime used by the application.

## License

MIT. See [LICENSE](LICENSE). Hakimi retains the required attribution for upstream Kimi Code work by Moonshot AI.
